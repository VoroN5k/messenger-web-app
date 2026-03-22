import * as dns from 'dns/promises'
import * as net from 'net'

function ipv4ToInt(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

function cidrToRange(cidr: string): { base: number; mask: number } {
    const [ip, prefix] = cidr.split('/');
    const bits = parseInt(prefix, 10);
    const base = ipv4ToInt(ip);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return { base: base & mask, mask };
}

const BLOCKED_IPV4_CIDRS = [
    '0.0.0.0/8',
    '10.0.0.0/8',
    '100.64.0.0/10',
    '127.0.0.0/8',
    '169.254.0.0/16',  // AWS/GCP metadata
    '172.16.0.0/12',
    '192.0.0.0/24',
    '192.0.2.0/24',
    '192.168.0.0/16',
    '198.18.0.0/15',
    '198.51.100.0/24',
    '203.0.113.0/24',
    '240.0.0.0/4',
].map(cidrToRange);

function isPrivateIPv4(ip: string): boolean {
    const int = ipv4ToInt(ip);
    return BLOCKED_IPV4_CIDRS.some(({ base, mask }) => (int & mask) === base);
}

function isPrivateIPv6(ip: string): boolean {
    const normalized = ip.toLowerCase().split('%')[0];
    if (normalized === '::1' || normalized === '::') return true;
    if (/^f[cd]/i.test(normalized)) return true;
    if (/^fe[89ab]/i.test(normalized)) return true;

    if (normalized.startsWith('::ffff:')) {
        const v4part = normalized.slice(7);
        if (net.isIPv4(v4part)) return isPrivateIPv4(v4part);
        const hexMatch = v4part.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
        if (hexMatch) {
            const a = parseInt(hexMatch[1], 16);
            const b = parseInt(hexMatch[2], 16);
            const reconstructed = [(a >> 8) & 0xff, a & 0xff, (b >> 8) & 0xff, b & 0xff].join('.');
            return isPrivateIPv4(reconstructed);
        }
        return true;
    }

    if (normalized.startsWith('64:ff9b::')) return true;

    if (normalized.startsWith('2002:')) {
        const parts = normalized.split(':');
        if (parts.length >= 3) {
            const hex = (parts[1] ?? '').padStart(4, '0') + (parts[2] ?? '').padStart(4, '0');
            if (hex.length === 8) {
                const v4 = [
                    parseInt(hex.slice(0, 2), 16),
                    parseInt(hex.slice(2, 4), 16),
                    parseInt(hex.slice(4, 6), 16),
                    parseInt(hex.slice(6, 8), 16),
                ].join('.');
                return isPrivateIPv4(v4);
            }
        }
    }

    return false;
}

export class SsrfError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SsrfError';
    }
}

/**
 * Validates hostname by resolving DNS and checking the IP is not private/internal.
 * Does NOT return the IP — the caller fetches the original URL so TLS SNI works correctly.
 */
async function validateHostname(hostname: string): Promise<void> {
    // If already an IP — validate directly
    if (net.isIPv4(hostname)) {
        if (isPrivateIPv4(hostname)) {
            throw new SsrfError(`Blocked: ${hostname} is a private IPv4 address`);
        }
        return;
    }

    if (net.isIPv6(hostname)) {
        if (isPrivateIPv6(hostname)) {
            throw new SsrfError(`Blocked: ${hostname} is a private IPv6 address`);
        }
        return;
    }

    // Resolve DNS to get the real IP and validate it
    let address: string;
    let family: number;

    try {
        ({ address, family } = await dns.lookup(hostname, { verbatim: true }));
    } catch (err: any) {
        throw new SsrfError(`DNS resolution failed for "${hostname}": ${err.message}`);
    }

    if (family === 4 && isPrivateIPv4(address)) {
        throw new SsrfError(`Blocked: "${hostname}" resolves to private IPv4 ${address}`);
    }

    if (family === 6 && isPrivateIPv6(address)) {
        throw new SsrfError(`Blocked: "${hostname}" resolves to private IPv6 ${address}`);
    }
}

export interface SafeFetchOptions {
    timeoutMs?:    number;
    maxBytes?:     number;
    maxRedirects?: number;
    headers?:      Record<string, string>;
}

/**
 * SSRF-safe fetch.
 *
 * Validates DNS first (blocks private IPs), then fetches the original URL
 * so that TLS SNI works correctly and HTTPS sites with valid certificates
 * don't get "fetch failed" errors.
 *
 * Note: there is a small DNS rebinding window between validation and the actual
 * request. For a server-side OG previewer this is an acceptable trade-off.
 */
export async function safeFetch(
    rawUrl: string,
    options: SafeFetchOptions = {},
): Promise<Response> {
    const {
        timeoutMs    = 5_000,
        maxBytes     = 2 * 1024 * 1024,
        maxRedirects = 3,
        headers      = {},
    } = options;

    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new SsrfError(`Invalid URL: ${rawUrl}`);
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new SsrfError(`Blocked protocol: ${url.protocol}`);
    }

    let redirectsLeft = maxRedirects;
    let currentUrl    = url;

    while (true) {
        // Validate hostname (DNS lookup + private IP check) before each request
        await validateHostname(currentUrl.hostname);

        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), timeoutMs);

        let response: Response;
        try {
            // Fetch the ORIGINAL URL (with hostname, not IP) so TLS SNI works
            response = await fetch(currentUrl.toString(), {
                method:   'GET',
                redirect: 'manual',
                signal:   controller.signal,
                headers:  {
                    'User-Agent': 'Mozilla/5.0 (compatible; Messenger-OG/1.0)',
                    Accept:       'text/html,application/xhtml+xml',
                    ...headers,
                },
            });
        } finally {
            clearTimeout(tid);
        }

        // Redirect handling
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location) throw new SsrfError('Redirect without Location header');
            if (redirectsLeft <= 0) throw new SsrfError('Too many redirects');

            redirectsLeft--;

            try {
                currentUrl = new URL(location, currentUrl.toString());
            } catch {
                throw new SsrfError(`Invalid redirect URL: ${location}`);
            }

            if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
                throw new SsrfError(`Redirect to blocked protocol: ${currentUrl.protocol}`);
            }

            continue;
        }

        // Only process HTML
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('text/html')) {
            return new Response(null, { status: 204 });
        }

        // Cap response size
        const reader = response.body?.getReader();
        if (!reader) return response;

        const chunks: Uint8Array[] = [];
        let totalBytes = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.length;
            if (totalBytes > maxBytes) {
                reader.cancel();
                break;
            }
            chunks.push(value);
        }

        const body    = new Uint8Array(Math.min(totalBytes, maxBytes));
        let   offset  = 0;
        for (const chunk of chunks) {
            body.set(chunk, offset);
            offset += chunk.length;
        }

        return new Response(body, {
            status:  response.status,
            headers: response.headers,
        });
    }
}