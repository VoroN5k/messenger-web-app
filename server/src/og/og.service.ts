import {Injectable, Logger} from "@nestjs/common";
import {OgData} from "./interfaces/og.interface.js";

@Injectable()
export class OgService {
    private readonly logger = new Logger(OgService.name);
    private readonly cache = new Map<string, { data: OgData; ts: number }>();
    private readonly TTL = 10 * 60 * 1000; // 10 хвилин

    async fetch(rawUrl: string): Promise<OgData | null> {
        let url: URL;
        try {
            url = new URL(rawUrl);
            if (!['http:', 'https:'].includes(url.protocol)) return null;
        } catch { return null; }

        const key = url.toString();
        const cached = this.cache.get(key);
        if ( cached && Date.now() - cached.ts < this.TTL) return cached.data;

        try {
            const res = await fetch(key, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Messenger/1.0)', Accept: 'text/html' },
                signal: AbortSignal.timeout(5000),
            });
            if(!res.ok || !res.headers.get('content-type')?.includes('text/html')) return null;
            const html = await res.text();

            const getMeta = (attr: string, val: string): string | undefined => {
                const a = html.match(new RegExp(`<meta[^>]+${attr}=["']${val}["'][^>]+content=["']([^"']+)["']`, 'i'))
                const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${val}["']`, 'i'))

                return (a || b)?.[1];
            };

            const data: OgData = {
                url:         key,
                title:       getMeta('property', 'og:title')       || getMeta('name', 'twitter:title') || html.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim(),
                description: getMeta('property', 'og:description') || getMeta('name', 'description'),
                image:       getMeta('property', 'og:image')       || getMeta('name', 'twitter:image'),
                siteName:    getMeta('property', 'og:site_name')   || url.hostname,
            };

            this.cache.set(key, { data, ts: Date.now() });
            return data;
        } catch (err: any) {
            this.logger.warn(`OG fetch failed for ${rawUrl}: ${err.message}`);
            return null;
        }
    }

}