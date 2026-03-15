'use client';

import { useState, useEffect } from 'react';
import api from '@/src/lib/axios';
import { ExternalLink } from 'lucide-react';

interface OgData {
    url:          string;
    title?:       string;
    description?: string;
    image?:       string;
    siteName?:    string;
}

const cache = new Map<string, OgData | null>();

const URL_RE = /https?:\/\/[^\s<>"]+/g;

export function extractUrls(text: string): string[] {
    return [...new Set(text.match(URL_RE) ?? [])];
}

interface Props {
    url:  string;
    isMe: boolean;
}

export function LinkPreview({ url, isMe }: Props) {
    const [data, setData] = useState<OgData | null | undefined>(
        cache.has(url) ? cache.get(url) : undefined
    );

    useEffect(() => {
        if (cache.has(url)) { setData(cache.get(url) ?? null); return; }
        api.get('/og', { params: { url } })
            .then(res => {
                const d = res.data as OgData | null;
                cache.set(url, d);
                setData(d);
            })
            .catch(() => { cache.set(url, null); setData(null); });
    }, [url]);

    if (!data) return null;
    if (!data.title && !data.description && !data.image) return null;

    return (
        <a href={url} target="_blank" rel="noopener noreferrer"
           className={`mt-2 flex flex-col gap-1.5 rounded-xl overflow-hidden border cursor-pointer
               hover:opacity-90 transition-opacity no-underline
               ${isMe
               ? 'border-white/20 bg-white/10'
               : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40'}`}>

            {data.image && (
                <img src={data.image} alt={data.title ?? ''} className="w-full max-h-32 object-cover"
                     onError={e => (e.currentTarget.style.display = 'none')} />
            )}

            <div className="px-3 py-2 flex flex-col gap-0.5">
                {data.siteName && (
                    <div className="flex items-center gap-1">
                        <ExternalLink size={10} className={isMe ? 'text-indigo-200' : 'text-slate-400'} />
                        <span className={`text-[10px] font-medium uppercase tracking-wide truncate
                            ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                            {data.siteName}
                        </span>
                    </div>
                )}
                {data.title && (
                    <p className={`text-xs font-semibold leading-tight line-clamp-2
                        ${isMe ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                        {data.title}
                    </p>
                )}
                {data.description && (
                    <p className={`text-[11px] line-clamp-2 leading-snug
                        ${isMe ? 'text-indigo-200' : 'text-slate-500 dark:text-slate-400'}`}>
                        {data.description}
                    </p>
                )}
            </div>
        </a>
    );
}