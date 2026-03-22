import {Injectable, Logger} from "@nestjs/common";
import {OgData} from "./interfaces/og.interface.js";
import {safeFetch, SsrfError} from "./guards/ssrf.guard.js";

const SUCCESS_TTL_MS = 10 * 60 * 1000; // 10 хвилин — успішні результати
const ERROR_TTL_MS   =  2 * 60 * 1000; // 2 хвилини — помилки/timeout (дозволяє retry пізніше)

@Injectable()
export class OgService {
    private readonly logger = new Logger(OgService.name);

    private readonly cache = new Map<string, { data: OgData | null; ts: number; ttl: number }>();

    async fetch(rawUrl: string): Promise<OgData | null> {
        let url: URL;
        try {
            url = new URL(rawUrl);
        } catch {
            return null;
        }

        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

        const key = url.toString();

        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.ts < cached.ttl) return cached.data;

        try {
            const res = await safeFetch(key, {
                timeoutMs:    8_000,  // ← збільшено з 5_000; Wikipedia та важкі сторінки потребують більше
                maxBytes:     512 * 1024,
                maxRedirects: 3,
            });

            if (!res || res.status === 204) {
                this.cache.set(key, { data: null, ts: Date.now(), ttl: ERROR_TTL_MS });
                return null;
            }

            if (!res.ok) {
                this.cache.set(key, { data: null, ts: Date.now(), ttl: ERROR_TTL_MS });
                return null;
            }

            const html = await res.text();
            const data = this.parseOgData(key, html, url);

            this.cache.set(key, {
                data,
                ts:  Date.now(),
                ttl: data ? SUCCESS_TTL_MS : ERROR_TTL_MS,
            });
            return data;

        } catch (err: any) {
            const isTimeout = err.name === 'AbortError' || err.message === 'This operation was aborted';

            if (err instanceof SsrfError) {
                this.logger.warn(`[SSRF blocked] ${err.message} — URL: ${rawUrl}`);
            } else if (isTimeout) {
                this.logger.warn(`OG fetch timed out for ${rawUrl}`);
            } else {
                this.logger.warn(`OG fetch failed for ${rawUrl}: ${err.message}`);
            }

            // Кешуємо ВСІ помилки (мережа, timeout, SSRF) щоб уникнути retry flood.
            // SSRF блокуємо надовго, тимчасові помилки — коротший TTL для можливого retry.
            this.cache.set(key, {
                data: null,
                ts:   Date.now(),
                ttl:  err instanceof SsrfError ? SUCCESS_TTL_MS : ERROR_TTL_MS,
            });

            return null;
        }
    }

    private parseOgData(key: string, html: string, url: URL): OgData | null {
        const getMeta = (attr: string, val: string): string | undefined => {
            const a = html.match(
                new RegExp(`<meta[^>]+${attr}=["']${escapeRegex(val)}["'][^>]+content=["']([^"']{1,500})["']`, 'i'),
            );
            const b = html.match(
                new RegExp(`<meta[^>]+content=["']([^"']{1,500})["'][^>]+${attr}=["']${escapeRegex(val)}["']`, 'i'),
            );
            return (a || b)?.[1]?.trim();
        };

        const title =
            getMeta('property', 'og:title') ||
            getMeta('name', 'twitter:title') ||
            html.match(/<title[^>]*>([^<]{1,200})/i)?.[1]?.trim();

        const description =
            getMeta('property', 'og:description') ||
            getMeta('name', 'description');

        let image = getMeta('property', 'og:image') || getMeta('name', 'twitter:image');

        if (image) {
            try {
                image = new URL(image, url.origin).toString();
                const imgUrl = new URL(image);
                if (imgUrl.protocol !== 'http:' && imgUrl.protocol !== 'https:') {
                    image = undefined;
                }
            } catch {
                image = undefined;
            }
        }

        const siteName =
            getMeta('property', 'og:site_name') ||
            url.hostname.replace(/^www\./, '');

        if (!title && !description && !image) return null;

        return {
            url:         key,
            title:       title       ? sanitizeText(title)       : undefined,
            description: description ? sanitizeText(description) : undefined,
            image,
            siteName:    siteName    ? sanitizeText(siteName)    : undefined,
        };
    }
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeText(text: string): string {
    return text
        .replace(/&amp;/g,  '&')
        .replace(/&lt;/g,   '<')
        .replace(/&gt;/g,   '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g,  "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);
}