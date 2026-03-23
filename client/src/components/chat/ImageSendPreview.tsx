'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Send, ImageIcon } from 'lucide-react';

interface Props {
    file:     File;
    previewUrl: string;
    replyTo?: { nickname: string } | null;
    onSend:   (caption: string) => void;
    onCancel: () => void;
}

export function ImageSendPreview({ file, previewUrl, replyTo, onSend, onCancel }: Props) {
    const [caption, setCaption] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input on mount
    useEffect(() => {
        const t = setTimeout(() => inputRef.current?.focus(), 80);
        return () => clearTimeout(t);
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
            if (e.key === 'Enter' && !e.shiftKey && document.activeElement === inputRef.current) {
                e.preventDefault();
                onSend(caption);
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [caption, onSend, onCancel]);

    const sizeLabel = file.size < 1024 * 1024
        ? `${(file.size / 1024).toFixed(0)} KB`
        : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

    return (
        <div
            className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-0 sm:p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md overflow-hidden flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 dark:border-slate-700 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                            <ImageIcon size={14} className="text-violet-500" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-tight">
                                Надіслати фото
                            </p>
                            <p className="text-[10px] text-slate-400 leading-tight mt-0.5 truncate max-w-[200px]">
                                {file.name} · {sizeLabel}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-all"
                    >
                        <X size={15} />
                    </button>
                </div>

                {/* Image preview */}
                <div className="relative bg-slate-950 flex items-center justify-center overflow-hidden"
                     style={{ maxHeight: '55vh', minHeight: '200px' }}>
                    <img
                        src={previewUrl}
                        alt="Preview"
                        className="max-w-full object-contain"
                        style={{ maxHeight: '55vh' }}
                        draggable={false}
                    />
                    {/* Subtle vignette at bottom for caption area blend */}
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
                </div>

                {/* Reply banner (if replying) */}
                {replyTo && (
                    <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border-t border-indigo-100 dark:border-indigo-900 flex items-center gap-2">
                        <div className="w-0.5 h-6 rounded-full bg-indigo-400 shrink-0" />
                        <p className="text-xs text-indigo-600 dark:text-indigo-400">
                            Відповідь на: <span className="font-semibold">{replyTo.nickname}</span>
                        </p>
                    </div>
                )}

                {/* Caption input */}
                <div className="flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700">
                    <input
                        ref={inputRef}
                        value={caption}
                        onChange={e => setCaption(e.target.value)}
                        placeholder="Додати підпис..."
                        maxLength={1000}
                        className="flex-1 bg-slate-50 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-400 rounded-xl px-4 py-2.5 text-sm outline-none focus:bg-white dark:focus:bg-slate-600 focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-900/30 transition-all"
                    />
                    <button
                        onClick={() => onSend(caption)}
                        className="w-10 h-10 rounded-full bg-violet-500 hover:bg-violet-600 active:scale-95 text-white flex items-center justify-center cursor-pointer transition-all shrink-0 shadow-lg shadow-violet-500/25"
                    >
                        <Send size={15} className="ml-0.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}