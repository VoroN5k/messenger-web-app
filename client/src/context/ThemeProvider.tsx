'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
    theme:       Theme;
    toggleTheme: () => void;
    setTheme:    (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    theme:       'light',
    toggleTheme: () => {},
    setTheme:    () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>('light');

    // Читаємо збережену тему при mount
    useEffect(() => {
        const saved = localStorage.getItem('theme') as Theme | null;
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const initial = saved ?? (prefersDark ? 'dark' : 'light');
        applyTheme(initial);
        setThemeState(initial);
    }, []);

    const applyTheme = (t: Theme) => {
        const root = document.documentElement;
        if (t === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    };

    const setTheme = (t: Theme) => {
        setThemeState(t);
        applyTheme(t);
        localStorage.setItem('theme', t);
    };

    const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);