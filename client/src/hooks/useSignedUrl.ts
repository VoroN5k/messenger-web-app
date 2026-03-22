'use client'

import { useState, useEffect } from 'react';
import api from '@/src/lib/axios';

interface CacheEntry { url: string; expiresAt: number }

// Module-level - survives component unmounts / re-mounts within the same session.
const cache = new Map<string, CacheEntry>();
const BUFFER_MS = 5 * 60 * 1_000; // refresh 5 min before actual expiry

// Path extraction

/**
 * Returns the storage path (after the bucket name) from any URL format we store:
 *   /storage/<bucket>/<path>                   - proxy format (preferred)
 *   https://<project>.supabase.co/storage/...  - absolute URL
 */
export function extractStoragePath(fileUrl: string | null | undefined): string | null {
    if (!fileUrl) return null;

    // /storage/<bucket>/<path>
    const m = fileUrl.match(/^\/storage\/[^/]+\/(.+)$/);
    if (m) return m[1];

    const marker = '/storage/v1/object/public/';
    const idx = fileUrl.indexOf(marker);
    if (idx !== -1) {
        const afterMarker = fileUrl.slice(idx + marker.length);
        const slashIdx    = afterMarker.indexOf('/');
        if (slashIdx !== -1) return afterMarker.slice(slashIdx + 1);
    }

    return null; // not a managed storage URL — return as-is
}

// Hook

export function useSignedUrl(fileUrl: string | null | undefined): string | null {
    const path = extractStoragePath(fileUrl);

    /** Return a cached entry if still fresh enough. */
    const fromCache = (): string | null => {
        if (!path) return null;
        const c = cache.get(path);
        return c && c.expiresAt - BUFFER_MS > Date.now() ? c.url : null;
    };

    const [url, setUrl] = useState<string | null>(() => fromCache() ?? (path ? null : (fileUrl ?? null)));

    useEffect(() => {
        // Not a managed URL - use as-is
        if (!path) {
            setUrl(fileUrl ?? null);
            return;
        }

        // Already cached and fresh
        const cached = fromCache();
        if (cached) {
            setUrl(cached);
            return;
        }

        let alive = true;

        api.get<{ url: string; expiresAt: number }>('/files/signed', { params: { path } })
            .then((res) => {
                if (!alive) return;
                cache.set(path, res.data);
                setUrl(res.data.url);
            })
            .catch(() => {
                // Graceful fallback - show original URL (may fail for private bucket but
                // doesn't crash the UI)
                if (alive) setUrl(fileUrl ?? null);
            });

        return () => { alive = false; };
    }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

    return url;
}

export async function resolveSignedUrl(fileUrl: string): Promise<string> {
    const path = extractStoragePath(fileUrl);
    if (!path) return fileUrl;

    const cached = cache.get(path);
    if (cached && cached.expiresAt - BUFFER_MS > Date.now()) return cached.url;

    const res = await api.get<{ url: string; expiresAt: number }>('/files/signed', { params: { path } });
    cache.set(path, res.data);
    return res.data.url;
}
