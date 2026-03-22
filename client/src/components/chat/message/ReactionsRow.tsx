'use client';

import { Reaction } from '@/src/types/conversation.types';

interface Props {
    reactions:     Reaction[];
    currentUserId: number | string;
    onToggle:      (emoji: string) => void;
}

export function ReactionsRow({ reactions, currentUserId, onToggle }: Props) {
    if (!reactions?.length) return null;
    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {reactions.map((r) => {
                const mine = r.userIds.some((id) => String(id) === String(currentUserId));
                return (
                    <button
                        key={r.emoji}
                        onClick={() => onToggle(r.emoji)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all cursor-pointer select-none
                            ${mine
                            ? 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200'
                            : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                    >
                        <span className="text-sm leading-none">{r.emoji}</span>
                        <span>{r.count}</span>
                    </button>
                );
            })}
        </div>
    );
}
