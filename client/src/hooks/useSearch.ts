import { useState, useEffect, useCallback } from 'react';
import api from '@/src/lib/axios';
import { Message } from '@/src/types/conversation.types';
import {useE2E} from "@/src/hooks/eseE2E";

export const useSearch = (
    conversationId: number | undefined,
    messages: Message[] = [],
) => {
    const [query,       setQuery]       = useState('');
    const [results,     setResults]     = useState<Message[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isOpen,      setIsOpen]      = useState(false);

    const e2e = useE2E();

    useEffect(() => {
        if (!query.trim() || query.trim().length < 2 || !conversationId) {
            setResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        const q = query.trim().toLowerCase();
        const found = messages.filter(
            (m) => !m.deletedAt && m.content.toLowerCase().includes(q)
        );
        setResults(found);
        setIsSearching(false);
    }, [query, messages]);

    const close = useCallback(() => {
        setIsOpen(false);
        setQuery('');
        setResults([]);
    }, []);

    useEffect(() => { close(); }, [conversationId]);

    return { query, setQuery, results, isSearching, isOpen, setIsOpen, close };
};