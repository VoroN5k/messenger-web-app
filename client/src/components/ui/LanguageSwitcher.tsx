'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

const FLAGS: Record<string, string> = {
    uk: '🇺🇦',
    en: '🇬🇧',
};

const LABELS: Record<string, string> = {
    uk: 'UA',
    en: 'EN',
};

interface Props {
    currentLocale: string;
    /** Optional extra classes for the button */
    className?: string;
}

export function LanguageSwitcher({ currentLocale, className = '' }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const toggle = () => {
        const next = currentLocale === 'uk' ? 'en' : 'uk';
        // Set cookie (1 year)
        document.cookie = `locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
        startTransition(() => {
            router.refresh();
        });
    };

    const next = currentLocale === 'uk' ? 'en' : 'uk';

    return (
        <button
            onClick={toggle}
            disabled={isPending}
            title={`Switch to ${next.toUpperCase()}`}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold
                text-slate-500 dark:text-slate-400
                hover:text-slate-700 dark:hover:text-slate-200
                hover:bg-slate-100 dark:hover:bg-slate-700
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all cursor-pointer select-none
                ${className}`}
        >
            <span className="text-sm leading-none">{FLAGS[currentLocale]}</span>
            <span>{LABELS[currentLocale]}</span>
        </button>
    );
}