import { useState, useEffect, useCallback } from 'react';
import api from '@/src/lib/axios';
import { Message } from '@/src/types/chat.types';

export const useSearch = (selectedUserId: string | number | undefined) => {
    const [query,      setQuery]      = useState('');
    const [results,    setResults]    = useState<Message[]>([]);
    const [isSearching,setIsSearching]= useState(false);
    const [isOpen,     setIsOpen]     = useState(false);

    // Debounce 350ms
    useEffect(() => {
        if (!query.trim() || query.trim().length < 2 || !selectedUserId) {
            setResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);

        const timer = setTimeout(async () => {
            try {
                const res = await api.get('/chat/search', {
                    params: { q: query.trim(), withUserId: selectedUserId },
                });
                setResults(res.data);
            } catch (e) {
                console.error('Search failed', e);
                setResults([]);
            } finally {
                setIsSearching(false);
            }
        }, 350);

        return () => clearTimeout(timer);
    }, [query, selectedUserId]);

    // Закрити і скинути
    const close = useCallback(() => {
        setIsOpen(false);
        setQuery('');
        setResults([]);
    }, []);

    // Скинути результати при зміні співрозмовника
    useEffect(() => {
        close();
    }, [selectedUserId]);

    return { query, setQuery, results, isSearching, isOpen, setIsOpen, close };
};