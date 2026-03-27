'use client';

import { useEffect, useRef } from 'react';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👏', '🎉', '💯'];

interface EmojiPickerProps {
    onSelect: (emoji: string) => void;
    onClose: () => void;
    align?: 'left' | 'right';
}

export function EmojiPicker({ onSelect, onClose, align = 'right' }: EmojiPickerProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let handler: ((e: MouseEvent) => void) | null = null;
        const timeout = setTimeout(() => {
            handler = (e: MouseEvent) => {
                if (ref.current && !ref.current.contains(e.target as Node)) onClose();
            };
            document.addEventListener('mousedown', handler);
        }, 80);

        return () => {
            clearTimeout(timeout);
            if (handler) document.removeEventListener('mousedown', handler);
        };
    }, [onClose]);

    return (
        <div
            ref={ref}
            className={`absolute bottom-full mb-2 z-50 bg-white rounded-2xl shadow-xl border border-slate-100 p-1.5 flex gap-0.5
                ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
            {EMOJIS.map((emoji) => (
                <button
                    key={emoji}
                    onClick={(e) => { e.stopPropagation(); onSelect(emoji); onClose(); }}
                    className="text-xl w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 active:scale-90 transition-all cursor-pointer select-none"
                >
                    {emoji}
                </button>
            ))}
        </div>
    );
}