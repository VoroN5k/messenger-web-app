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

    const e2e      = useE2E();
    const abortRef = useRef<AbortController | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchAllDecrypted = useCallback(async (
        convId: number,
        signal: AbortSignal,
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

            if (!data.length)     break;
            if (data.length < 30) hasMore = false;

            const decrypted = await Promise.all(
                data.map(async (msg) => {
                    if (!msg.content || !otherUserId) return msg;
                    try {
                        const plain = await e2e.decrypt(msg.content, otherUserId);
                        return { ...msg, content: plain };
                    } catch {
                        return msg;
                    }
                }),
            );

            all.unshift(...decrypted);
            cursor = data[0].id;
            setLoadedCount(all.length);
        }

        if (!signal.aborted) sessionCache.set(convId, all);
        return all;
    }, [otherUserId, e2e]);

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
        // Скасовуємо попередні запити незалежно від умов
        abortRef.current?.abort();
        if (timerRef.current) clearTimeout(timerRef.current);

        if (!isOpen || !conversationId || query.trim().length < 2) {
            // Скидаємо стан лише якщо є що скидати (уникаємо зайвих ре-рендерів)
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
                    const all = await fetchAllDecrypted(conversationId, ctrl.signal);
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
    }, [query, conversationId, isOpen, otherUserId, fetchAllDecrypted, searchOnServer]);

    // ── При зміні conversationId — інвалідуємо кеш та скидаємо стан ──────────
    // Використовуємо ref щоб уникнути циклічних залежностей
    const prevConvRef = useRef<number | undefined>(undefined);
    useEffect(() => {
        if (prevConvRef.current !== undefined && prevConvRef.current !== conversationId) {
            // Скасовуємо активні запити
            abortRef.current?.abort();
            if (timerRef.current) clearTimeout(timerRef.current);
            // Інвалідуємо кеш старої конверсації
            if (prevConvRef.current) sessionCache.delete(prevConvRef.current);
            // Скидаємо стан напряму (без close щоб уникнути циклів)
            setIsOpen(false);
            setQuery('');
            setResults([]);
            setLoadedCount(0);
            setIsSearching(false);
        }
        prevConvRef.current = conversationId;
    }, [conversationId]);

    // ── close — стабільна функція без залежностей що змінюються ──────────────
    const close = useCallback(() => {
        abortRef.current?.abort();
        if (timerRef.current) clearTimeout(timerRef.current);
        // Інвалідуємо кеш поточної конверсації через ref
        const convId = prevConvRef.current;
        if (convId) sessionCache.delete(convId);
        setIsOpen(false);
        setQuery('');
        setResults([]);
        setLoadedCount(0);
        setIsSearching(false);
    }, []); // ← порожній масив, функція стабільна

    return { query, setQuery, results, isSearching, isOpen, setIsOpen, close, loadedCount };
};