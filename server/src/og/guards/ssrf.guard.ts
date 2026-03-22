import * as dns from 'dns/promises'
import * as net from 'net'

const IPV4_PRIVATE_RANGES: Array<[number, number, number]> = [];

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
    '0.0.0.0/8',         // "This" network
    '10.0.0.0/8',        // Private-Use (RFC 1918)
    '100.64.0.0/10',     // Shared Address Space / CGNAT (RFC 6598)
    '127.0.0.0/8',       // Loopback
    '169.254.0.0/16',    // Link-Local — AWS/GCP instance metadata!
    '172.16.0.0/12',     // Private-Use (RFC 1918)
    '192.0.0.0/24',      // IETF Protocol Assignments
    '192.0.2.0/24',      // TEST-NET-1 (RFC 5737)
    '192.168.0.0/16',    // Private-Use (RFC 1918)
    '198.18.0.0/15',     // Benchmarking (RFC 2544)
    '198.51.100.0/24',   // TEST-NET-2 (RFC 5737)
    '203.0.113.0/24',    // TEST-NET-3 (RFC 5737)
    '240.0.0.0/4',       // Reserved (включає 255.255.255.255)
].map(cidrToRange);

function isPrivateIPv4(ip: string): boolean {
    const int = ipv4ToInt(ip);
    return BLOCKED_IPV4_CIDRS.some(({ base, mask }) => (int & mask) === base);
}

function isPrivateIPv6(ip: string): boolean {
    // Нормалізуємо: прибираємо scope id (%eth0 і т.п.)
    const normalized = ip.toLowerCase().split('%')[0];

    // Loopback
    if (normalized === '::1') return true;

    // Unspecified
    if (normalized === '::') return true;

    // fc00::/7 — Unique Local Address (RFC 4193)
    // Перші 7 біт: 1111110x → fc або fd
    if (/^f[cd]/i.test(normalized)) return true;

    // fe80::/10 — Link-Local (RFC 4291)
    if (/^fe[89ab]/i.test(normalized)) return true;

    // ::ffff:0:0/96 — IPv4-mapped (може обійти IPv4 перевірку)
    if (normalized.startsWith('::ffff:')) {
        const v4part = normalized.slice(7);
        // Може бути ::ffff:192.168.1.1 або ::ffff:c0a8:101
        if (net.isIPv4(v4part)) return isPrivateIPv4(v4part);
        // Hex форма ::ffff:c0a8:0101 → розпарсимо
        const hexMatch = v4part.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
        if (hexMatch) {
            const a = parseInt(hexMatch[1], 16);
            const b = parseInt(hexMatch[2], 16);
            const reconstructed = [
                (a >> 8) & 0xff,
                a & 0xff,
                (b >> 8) & 0xff,
                b & 0xff,
            ].join('.');
            return isPrivateIPv4(reconstructed);
        }
        return true; // не вдалося розпарсити — блокуємо
    }

    // 64:ff9b::/96 — IPv4-IPv6 translators (RFC 6052)
    if (normalized.startsWith('64:ff9b::')) return true;

    // 2002::/16 — 6to4 (може тунелювати приватні IPv4)
    if (normalized.startsWith('2002:')) {
        // Виймаємо embedded IPv4 (біти 16-47)
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
 * Валідує hostname: резолвить DNS і перевіряє що IP не приватний.
 * Повертає resolved IP щоб його можна було використати у запиті.
 */
async function resolveAndValidate(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
    // Якщо hostname вже є IP — валідуємо одразу
    if (net.isIPv4(hostname)) {
        if (isPrivateIPv4(hostname)) {
            throw new SsrfError(`Blocked: ${hostname} is a private IPv4 address`);
        }
        return { address: hostname, family: 4 };
    }

    if (net.isIPv6(hostname)) {
        if (isPrivateIPv6(hostname)) {
            throw new SsrfError(`Blocked: ${hostname} is a private IPv6 address`);
        }
        return { address: hostname, family: 6 };
    }

    // DNS lookup — verbatim щоб отримати реальну відповідь без OS-level reordering
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

    return { address, family: family as 4 | 6 };
}

export interface SafeFetchOptions {
    /** Timeout у мілісекундах (default: 5000) */
    timeoutMs?: number;
    /** Максимальний розмір відповіді у байтах (default: 2MB) */
    maxBytes?: number;
    /** Максимальна кількість redirects (default: 3) */
    maxRedirects?: number;
    /** Додаткові headers */
    headers?: Record<string, string>;
}

/**
 * SSRF-safe fetch.
 *
 * - Валідує URL протокол (тільки http/https)
 * - Резолвить DNS і блокує приватні IP
 * - Робить запит на resolved IP з правильним Host header
 * - Кожен redirect проходить повторну валідацію
 * - Обмежує розмір відповіді
 */
export async function safeFetch(
    rawUrl: string,
    options: SafeFetchOptions = {},
): Promise<Response> {
    const {
        timeoutMs    = 5_000,
        maxBytes     = 2 * 1024 * 1024, // 2 MB
        maxRedirects = 3,
        headers      = {},
    } = options;

    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new SsrfError(`Invalid URL: ${rawUrl}`);
    }

    // Тільки http/https — жодних file://, ftp://, gopher:// і т.п.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new SsrfError(`Blocked protocol: ${url.protocol}`);
    }

    let redirectsLeft = maxRedirects;
    let currentUrl    = url;

    while (true) {
        const hostname = currentUrl.hostname;
        const { address, family } = await resolveAndValidate(hostname);

        // Будуємо URL з resolved IP замість hostname — DNS rebinding захист
        const targetUrl = new URL(currentUrl.toString());
        targetUrl.hostname = family === 6 ? `[${address}]` : address;

        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), timeoutMs);

        let response: Response;
        try {
            response = await fetch(targetUrl.toString(), {
                method:   'GET',
                redirect: 'manual', // обробляємо redirects самі
                signal:   controller.signal,
                headers:  {
                    'User-Agent': 'Mozilla/5.0 (compatible; Messenger-OG/1.0)',
                    Accept:       'text/html,application/xhtml+xml',
                    // Host header з оригінальним hostname (для SNI / virtual hosting)
                    Host:         hostname,
                    ...headers,
                },
            });
        } finally {
            clearTimeout(tid);
        }

        // Redirect handling
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location) {
                throw new SsrfError('Redirect without Location header');
            }

            if (redirectsLeft <= 0) {
                throw new SsrfError('Too many redirects');
            }

            redirectsLeft--;

            // Резолвимо redirect URL відносно поточного
            try {
                currentUrl = new URL(location, currentUrl.toString());
            } catch {
                throw new SsrfError(`Invalid redirect URL: ${location}`);
            }

            // Redirect може змінити протокол — перевіряємо знову
            if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
                throw new SsrfError(`Redirect to blocked protocol: ${currentUrl.protocol}`);
            }

            continue; // наступна ітерація — повторна валідація нового hostname
        }

        // Перевіряємо Content-Type — тільки HTML нам потрібен для OG
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('text/html')) {
            // Не HTML — повертаємо пустий response (не кидаємо помилку)
            return new Response(null, { status: 204 });
        }

        // Обмежуємо розмір відповіді
        const reader  = response.body?.getReader();
        if (!reader) return response;

        const chunks: Uint8Array[] = [];
        let totalBytes = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            totalBytes += value.length;
            if (totalBytes > maxBytes) {
                reader.cancel();
                // Повертаємо те що вже зчитали
                break;
            }
            chunks.push(value);
        }

        const body = new Uint8Array(totalBytes > maxBytes ? maxBytes : totalBytes);
        let offset = 0;
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
