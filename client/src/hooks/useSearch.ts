import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/src/lib/axios';
import { Message } from '@/src/types/conversation.types';
import { useE2E } from '@/src/hooks/useE2E';

const sessionCache = new Map<number, Message[]>();

export const useSearch = (
    conversationId: number | undefined,
    otherUserId:    number | undefined,
) => {
    const [query,       setQuery]       = useState('');
    const [results,     setResults]     = useState<Message[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isOpen,      setIsOpen]      = useState(false);
    const [loadedCount, setLoadedCount] = useState(0);

    const e2e = useE2E();

    // Stable refs — prevent stale closure issues in async loops
    const decryptDirectRef = useRef(e2e.decrypt);
    const decryptGroupRef  = useRef(e2e.decryptFromGroup);
    useEffect(() => { decryptDirectRef.current = e2e.decrypt; },      [e2e.decrypt]);
    useEffect(() => { decryptGroupRef.current  = e2e.decryptFromGroup; }, [e2e.decryptFromGroup]);

    const abortRef    = useRef<AbortController | null>(null);
    const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prevConvRef = useRef<number | undefined>(undefined);

    const looksEncrypted = (s?: string | null) =>
        !!s && s.length > 20 && /^[A-Za-z0-9_\-]+$/.test(s);

    // DIRECT: load + decrypt full history for client-side search
    const fetchAllDecrypted = useCallback(async (
        convId:     number,
        peerUserId: number,
        signal:     AbortSignal,
    ): Promise<Message[]> => {
        const cached = sessionCache.get(convId);
        if (cached) return cached;

        const all: Message[] = [];
        let cursor: number | undefined;
        let hasMore = true;

        while (hasMore && !signal.aborted) {
            const url = cursor
                ? `/conversations/${convId}/messages?cursor=${cursor}`
                : `/conversations/${convId}/messages`;

            const { data }: { data: Message[] } = await api.get(url, { signal });
            if (signal.aborted) break;
            if (!data.length) break;
            if (data.length < 30) hasMore = false;

            const decrypted = await Promise.all(
                data.map(async (msg) => {
                    if (!msg.content || !looksEncrypted(msg.content)) return msg;
                    try {
                        const plain = await decryptDirectRef.current(msg.content, peerUserId);
                        return { ...msg, content: plain };
                    } catch {
                        return msg;
                    }
                }),
            );

            // Server returns desc then reverses → data is ASC; unshift = prepend older batch
            all.unshift(...decrypted);
            cursor = data[0].id;      // oldest id in this batch → next page goes further back

            setLoadedCount(all.length);
        }

        if (!signal.aborted) sessionCache.set(convId, all);
        return all;
    }, []);

    // GROUP / CHANNEL: server-side search + client decrypt
    const searchAndDecryptGroup = useCallback(async (
        convId: number,
        q:      string,
        signal: AbortSignal,
    ): Promise<Message[]> => {
        const { data }: { data: Message[] } = await api.get(
            `/conversations/${convId}/messages/search`,
            { params: { q }, signal },
        );

        // Server stores encrypted ciphertext — decrypt each result
        return Promise.all(
            data.map(async (msg) => {
                if (!msg.content || !looksEncrypted(msg.content)) return msg;
                try {
                    const plain = await decryptGroupRef.current(
                        msg.content,
                        convId,
                        Number(msg.senderId),
                    );
                    return { ...msg, content: plain };
                } catch {
                    return msg;
                }
            }),
        );
    }, []);

    // Main search effect
    useEffect(() => {
        abortRef.current?.abort();
        if (timerRef.current) clearTimeout(timerRef.current);

        if (!isOpen || !conversationId || query.trim().length < 2) {
            setResults((prev) => prev.length ? [] : prev);
            setIsSearching(false);
            setLoadedCount(0);
            return;
        }

        timerRef.current = setTimeout(async () => {
            const ctrl = new AbortController();
            abortRef.current = ctrl;

            setIsSearching(true);
            setResults([]);
            setLoadedCount(0);

            try {
                let found: Message[];

                if (otherUserId) {
                    // DIRECT — client-side filter over full decrypted history
                    const all = await fetchAllDecrypted(conversationId, otherUserId, ctrl.signal);
                    if (ctrl.signal.aborted) return;

                    const q = query.trim().toLowerCase();
                    found = all.filter(
                        (m) => !m.deletedAt && m.content?.toLowerCase().includes(q),
                    );
                } else {
                    // GROUP / CHANNEL — search on server, decrypt results here
                    found = await searchAndDecryptGroup(conversationId, query.trim(), ctrl.signal);
                }

                if (!ctrl.signal.aborted) setResults(found);
            } catch (err: any) {
                if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
                    console.error('[useSearch]', err);
                }
                if (!ctrl.signal.aborted) setResults([]);
            } finally {
                if (!ctrl.signal.aborted) {
                    setIsSearching(false);
                    setLoadedCount(0);
                }
            }
        }, 400);

        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [query, conversationId, isOpen, otherUserId, fetchAllDecrypted, searchAndDecryptGroup]);

    // Invalidate cache on conversation change
    useEffect(() => {
        if (prevConvRef.current !== undefined && prevConvRef.current !== conversationId) {
            abortRef.current?.abort();
            if (timerRef.current) clearTimeout(timerRef.current);
            if (prevConvRef.current) sessionCache.delete(prevConvRef.current);
            setIsOpen(false);
            setQuery('');
            setResults([]);
            setLoadedCount(0);
            setIsSearching(false);
        }
        prevConvRef.current = conversationId;
    }, [conversationId]);

    const close = useCallback(() => {
        abortRef.current?.abort();
        if (timerRef.current) clearTimeout(timerRef.current);
        const convId = prevConvRef.current;
        if (convId) sessionCache.delete(convId);
        setIsOpen(false);
        setQuery('');
        setResults([]);
        setLoadedCount(0);
        setIsSearching(false);
    }, []);

    return { query, setQuery, results, isSearching, isOpen, setIsOpen, close, loadedCount };
};