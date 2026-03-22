'use client';

import { RefObject }         from 'react';
import { Search, Loader2, ChevronUp, ChevronDown, X } from 'lucide-react';
import { HighlightText }     from './message/HighlightText';
import { Message }           from '@/src/types/conversation.types';
import { formatTime }        from '@/src/lib/chatFormatters';

interface Props {
    query:          string;
    setQuery:       (q: string) => void;
    results:        Message[];
    isSearching:    boolean;
    loadedCount:    number;
    navIdx:         number;
    currentUserId:  number | string | undefined;
    searchInputRef: RefObject<HTMLInputElement | null>;
    onNavSearch:    (dir: 'prev' | 'next') => void;
    onClose:        () => void;
    onJumpTo:       (msgId: number, idx: number) => void;
}

export function SearchPanel({
                                query, setQuery, results, isSearching, loadedCount,
                                navIdx, currentUserId, searchInputRef,
                                onNavSearch, onClose, onJumpTo,
                            }: Props) {
    return (
        <div className="bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 px-4 py-3 flex flex-col gap-2 z-10 shadow-sm">
            <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                        ref={searchInputRef as any}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Пошук по повідомленнях..."
                        className="w-full pl-8 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-400 rounded-xl outline-none focus:bg-white dark:focus:bg-slate-600 focus:ring-2 focus:ring-indigo-200 transition-all"
                    />
                    {isSearching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                            <Loader2 size={13} className="animate-spin text-slate-400" />
                            {loadedCount > 0 && (
                                <span className="text-[11px] text-slate-400">{loadedCount}...</span>
                            )}
                        </div>
                    )}
                </div>

                {results.length > 0 && (
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-400 whitespace-nowrap px-1">
                            {navIdx + 1} / {results.length}
                        </span>
                        <button onClick={() => onNavSearch('prev')} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer">
                            <ChevronUp size={15}/>
                        </button>
                        <button onClick={() => onNavSearch('next')} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer">
                            <ChevronDown size={15}/>
                        </button>
                    </div>
                )}

                <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer">
                    <X size={15}/>
                </button>
            </div>

            {query.trim().length >= 2 && !isSearching && (
                <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 divide-y divide-slate-100 dark:divide-slate-600">
                    {results.length === 0
                        ? <p className="text-xs text-slate-400 text-center py-4">Нічого не знайдено</p>
                        : results.map((msg, idx) => {
                            const isMe = String(msg.senderId) === String(currentUserId);
                            return (
                                <button
                                    key={msg.id ?? idx}
                                    onClick={() => { if (msg.id) onJumpTo(msg.id, idx); }}
                                    className={`w-full text-left px-3 py-2.5 hover:bg-white dark:hover:bg-slate-600 transition-colors
                                        ${idx === navIdx ? 'bg-indigo-50 dark:bg-indigo-900/30 border-l-2 border-l-indigo-400' : ''}`}
                                >
                                    <div className="flex items-center justify-between mb-0.5">
                                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                                            {isMe ? 'Ви' : (msg.sender?.nickname ?? '?')}
                                        </span>
                                        <span className="text-[10px] text-slate-400">{formatTime(msg.createdAt)}</span>
                                    </div>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 truncate">
                                        <HighlightText text={msg.content} query={query} />
                                    </p>
                                </button>
                            );
                        })
                    }
                </div>
            )}
        </div>
    );
}
