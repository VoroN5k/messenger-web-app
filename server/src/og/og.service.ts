import {Injectable, Logger} from "@nestjs/common";
import {OgData} from "./interfaces/og.interface.js";
import {safeFetch, SsrfError} from "./guards/ssrf.guard.js";

@Injectable()
export class OgService {
    private readonly logger = new Logger(OgService.name);

    private readonly cache = new Map<string, { data: OgData | null; ts: number }>();
    private readonly TTL = 10 * 60 * 1000; // 10 хвилин

    async fetch(rawUrl: string): Promise<OgData | null> {
        let url: URL;
        try {
            url = new URL(rawUrl);
        } catch {
            return null;
        }

        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

        const key = url.toString();

        // Cache
        const cached = this.cache.get(key);
        if ( cached && Date.now() - cached.ts < this.TTL) return cached.data;

        // Safe fetch
        try {
            const res = await safeFetch(key, {
                timeoutMs:    5_000,
                maxBytes:     512 * 1024, // 512 KB — для OG парсингу достатньо
                maxRedirects: 3,
            });

            if (!res || res.status === 204) {
                this.cache.set(key, { data: null, ts: Date.now() });
                return null;
            }

            if (!res.ok) {
                this.cache.set(key, { data: null, ts: Date.now() });
                return null;
            }

            const html = await res.text();
            const data = this.parseOgData(key, html, url);

            this.cache.set(key, { data, ts: Date.now() });
            return data;

        } catch (err: any) {
            if (err instanceof SsrfError) {
                // SSRF спроба — логуємо як попередження (не error щоб не спамити)
                this.logger.warn(`[SSRF blocked] ${err.message} — requested by URL: ${rawUrl}`);
            } else {
                this.logger.warn(`OG fetch failed for ${rawUrl}: ${err.message}`);
            }

            // Не кешуємо помилки мережі (тільки SSRF — щоб не допускати retry flood)
            if (err instanceof SsrfError) {
                this.cache.set(key, { data: null, ts: Date.now() });
            }

            return null;
        }
    }

    // OG / meta парсер
    private parseOgData(key: string, html: string, url: URL): OgData | null {
        const getMeta = (attr: string, val: string): string | undefined => {
            // <meta property="og:title" content="...">  або навпаки
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

        // Перетворюємо відносні URL зображень на абсолютні
        if (image) {
            try {
                image = new URL(image, url.origin).toString();
                // Не дозволяємо data: URLs або інші схеми
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

        // Якщо нічого корисного не знайшли — не повертаємо порожній об'єкт
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

// Helpers

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Прибираємо HTML entities і зайві пробіли */
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
        .slice(0, 300); // обмежуємо довжину
}