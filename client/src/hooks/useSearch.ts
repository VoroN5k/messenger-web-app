import { useState, useEffect, useCallback } from 'react';
import api from '@/src/lib/axios';
import { Message } from '@/src/types/conversation.types';

export const useSearch = (conversationId: number | undefined) => {
    const [query,       setQuery]       = useState('');
    const [results,     setResults]     = useState<Message[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isOpen,      setIsOpen]      = useState(false);

    useEffect(() => {
        if (!query.trim() || query.trim().length < 2 || !conversationId) {
            setResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);

        const timer = setTimeout(async () => {
            try {
                const res = await api.get(
                    `/conversations/${conversationId}/messages/search`,
                    { params: { q: query.trim() } },
                );
                setResults(res.data);
            } catch {
                setResults([]);
            } finally {
                setIsSearching(false);
            }
        }, 350);

        return () => clearTimeout(timer);
    }, [query, conversationId]);

    const close = useCallback(() => {
        setIsOpen(false);
        setQuery('');
        setResults([]);
    }, []);

    useEffect(() => { close(); }, [conversationId]);

    return { query, setQuery, results, isSearching, isOpen, setIsOpen, close };
};