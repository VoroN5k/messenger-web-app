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

    // Стабільні посилання для розшифровки
    const decryptDirectRef = useRef(e2e.decrypt);
    const decryptGroupRef  = useRef(e2e.decryptFromGroup);
    useEffect(() => { decryptDirectRef.current = e2e.decrypt; },      [e2e.decrypt]);
    useEffect(() => { decryptGroupRef.current  = e2e.decryptFromGroup; }, [e2e.decryptFromGroup]);

    const abortRef    = useRef<AbortController | null>(null);
    const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prevConvRef = useRef<number | undefined>(undefined);

    // Універсальна та безпечна перевірка на шифротекст
    const looksEncrypted = (s?: string | null) => {
        if (!s) return false;
        const t = s.trim();
        // Якщо зашифровано у вигляді JSON об'єкта
        if (t.startsWith('{') && t.endsWith('}')) return true;
        // Якщо це суцільний Base64 (немає пробілів і довгий рядок)
        if (t.length > 15 && !t.includes(' ')) return true;
        return false;
    };

    // УНІВЕРСАЛЬНИЙ ЗАВАНТАЖУВАЧ (Direct + Group)
    const fetchAllDecrypted = useCallback(async (
        convId:     number,
        peerUserId: number | undefined,
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
                        const plain = peerUserId
                            ? await decryptDirectRef.current(msg.content, peerUserId)
                            : await decryptGroupRef.current(msg.content, convId, Number(msg.senderId));

                        // НАЙГОЛОВНІШИЙ ФІКС:
                        // Якщо хук повернув свою заглушку замість тексту, ігноруємо її та залишаємо шифр!
                        if (plain === '[🔒 Не вдалося розшифрувати]') {
                            return msg;
                        }

                        return { ...msg, content: plain };
                    } catch {
                        return msg;
                    }
                }),
            );

            all.unshift(...decrypted);
            cursor = data[0].id; // Найстаріше повідомлення для наступної сторінки

            setLoadedCount(all.length);
        }

        // Кешуємо ТІЛЬКИ якщо в масиві не залишилось жодного нерозшифрованого повідомлення
        const hasEncryptedLeft = all.some(m => looksEncrypted(m.content));
        if (!signal.aborted && !hasEncryptedLeft) {
            sessionCache.set(convId, all);
        }

        return all;
    }, []);

    // Головний ефект пошуку
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
                // Завантажуємо та розшифровуємо всі повідомлення
                const all = await fetchAllDecrypted(conversationId, otherUserId, ctrl.signal);
                if (ctrl.signal.aborted) return;

                // Фільтруємо суто локально
                const q = query.trim().toLowerCase();
                const found = all.filter(
                    (m) => !m.deletedAt && m.content?.toLowerCase().includes(q),
                );

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
    }, [query, conversationId, isOpen, otherUserId, fetchAllDecrypted]);

    // Інвалідація кешу при зміні відкритого чату
    useEffect(() => {
        if (prevConvRef.current !== undefined && prevConvRef.current !== conversationId) {
            abortRef.current?.abort();
            if (timerRef.current) clearTimeout(timerRef.current);
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
        setIsOpen(false);
        setQuery('');
        setResults([]);
        setLoadedCount(0);
        setIsSearching(false);
    }, []);

    return { query, setQuery, results, isSearching, isOpen, setIsOpen, close, loadedCount };
};