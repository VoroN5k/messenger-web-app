'use client';

import { useState } from 'react';
import { Search, X, Send } from 'lucide-react';
import { Avatar } from './Avatar';
import { Conversation } from '@/src/types/conversation.types';

interface Props {
    conversations: Conversation[];
    onForward: (targetConvId: number) => void;
    onClose: () => void;
}

export function ForwardModal({ conversations, onForward, onClose }: Props) {
    const [q, setQ] = useState('');

    const filtered = (conversations ?? []).filter(c =>
        c.name?.toLowerCase().includes(q.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[80vh]">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">Переслати в...</h3>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 cursor-pointer">
                        <X size={15} />
                    </button>
                </div>

                <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-700">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                            autoFocus
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            placeholder="Пошук чатів..."
                            className="w-full pl-8 pr-4 py-2 bg-slate-50 dark:bg-slate-700 dark:text-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-200"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto py-1">
                    {filtered.length === 0 ? (
                        <p className="text-center text-slate-400 text-sm py-8">Нічого не знайдено</p>
                    ) : (
                        filtered.map(conv => (
                            <button
                                key={conv.id}
                                onClick={() => { onForward(conv.id); onClose(); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                            >
                                <Avatar user={{ nickname: conv.name ?? '?', avatarUrl: conv.avatarUrl }} size="md" />
                                <div className="min-w-0 flex-1 text-left">
                                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{conv.name}</p>
                                </div>
                                <Send size={14} className="text-slate-300 shrink-0" />
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}