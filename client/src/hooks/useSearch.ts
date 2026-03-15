import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/src/lib/axios';
import { Message } from '@/src/types/conversation.types';
import { useE2E } from '@/src/hooks/eseE2E';

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

    const e2e       = useE2E();
    // ref щоб decrypt не потрапляв у deps ефекту
    const decryptRef = useRef(e2e.decrypt);
    useEffect(() => { decryptRef.current = e2e.decrypt; }, [e2e.decrypt]);

    const abortRef   = useRef<AbortController | null>(null);
    const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prevConvRef = useRef<number | undefined>(undefined);

    // ── DIRECT: завантажити всю розшифровану історію ──────────────────────────
    const fetchAllDecrypted = useCallback(async (
        convId:      number,
        peerUserId:  number,
        signal:      AbortSignal,
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

            if (!data.length)     break;
            if (data.length < 30) hasMore = false;

            // Розшифровуємо через ref — не спричиняє зміни deps
            const decrypted = await Promise.all(
                data.map(async (msg) => {
                    if (!msg.content) return msg;
                    try {
                        const plain = await decryptRef.current(msg.content, peerUserId);
                        return { ...msg, content: plain };
                    } catch {
                        return msg;
                    }
                }),
            );

            // Сервер повертає desc і сам робить reverse — data вже asc
            // Для пагінації cursor = ID першого (найстарішого) повідомлення батчу
            all.unshift(...decrypted);
            cursor = data[0].id;

            setLoadedCount(all.length);
        }

        if (!signal.aborted) sessionCache.set(convId, all);
        return all;
    }, []); // ← порожній масив: не залежить від e2e

    const searchOnServer = useCallback(async (
        convId: number,
        q:      string,
        signal: AbortSignal,
    ): Promise<Message[]> => {
        const { data } = await api.get(
            `/conversations/${convId}/messages/search`,
            { params: { q }, signal },
        );
        return data as Message[];
    }, []);

    // ── Головний ефект пошуку ─────────────────────────────────────────────────
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
                    const all = await fetchAllDecrypted(conversationId, otherUserId, ctrl.signal);
                    if (ctrl.signal.aborted) return;

                    const q = query.trim().toLowerCase();
                    found = all.filter(
                        (m) => !m.deletedAt && m.content?.toLowerCase().includes(q),
                    );
                } else {
                    found = await searchOnServer(conversationId, query.trim(), ctrl.signal);
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
        // fetchAllDecrypted і searchOnServer стабільні (порожні deps)
    }, [query, conversationId, isOpen, otherUserId, fetchAllDecrypted, searchOnServer]);

    // ── Зміна conversationId — інвалідуємо кеш ───────────────────────────────
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