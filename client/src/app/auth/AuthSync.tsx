'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/src/store/useAuthStore';

export default function AuthSync() {
    useEffect(() => {
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'auth-storage') {
                const newValue = e.newValue ? JSON.parse(e.newValue) : null;
                // Якщо токену більше немає, робимо логаут і редірект
                if (!newValue || !newValue.state || !newValue.state.accessToken) {
                    useAuthStore.getState().logout();
                    if (window.location.pathname !== '/auth/login') {
                        window.location.href = '/auth/login';
                    }
                }
            }
        };

        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    return null; // Цей компонент нічого не рендерить візуально
}