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
        <div
            className="flex flex-col gap-2 px-4 py-3 shrink-0 slide-up"
            style={{
                background: 'var(--bg-surface)',
                borderBottom: '1px solid var(--border)',
            }}
        >
            {/* Search row */}
            <div className="flex items-center gap-2">
                <div className="flex-1 relative flex items-center">
                    <Search size={13} className="absolute left-3 pointer-events-none" style={{ color: 'var(--text-3)' }} />
                    <input
                        ref={searchInputRef as any}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search messages…"
                        className="w-full pl-8 pr-4 py-2 text-[13px] outline-none transition-all duration-150"
                        style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-1)',
                            caretColor: 'var(--accent)',
                        }}
                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-accent)')}
                        onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    />
                    {isSearching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                            <Loader2 size={12} className="animate-spin" style={{ color: 'var(--text-3)' }} />
                            {loadedCount > 0 && (
                                <span className="text-[10px] font-mono" style={{ color: 'var(--text-3)' }}>
                  {loadedCount}…
                </span>
                            )}
                        </div>
                    )}
                </div>

                {results.length > 0 && (
                    <div className="flex items-center gap-0.5">
            <span className="text-[11px] px-1 font-mono" style={{ color: 'var(--text-3)' }}>
              {navIdx + 1}/{results.length}
            </span>
                        {[
                            { dir: 'prev' as const, icon: <ChevronUp size={14} /> },
                            { dir: 'next' as const, icon: <ChevronDown size={14} /> },
                        ].map(({ dir, icon }) => (
                            <button
                                key={dir}
                                onClick={() => onNavSearch(dir)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-100"
                                style={{ color: 'var(--text-3)' }}
                                onMouseEnter={e => {
                                    (e.currentTarget as HTMLElement).style.background = 'var(--accent-dim)';
                                    (e.currentTarget as HTMLElement).style.color = 'var(--accent-bright)';
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                                    (e.currentTarget as HTMLElement).style.color = 'var(--text-3)';
                                }}
                            >
                                {icon}
                            </button>
                        ))}
                    </div>
                )}

                <button
                    onClick={onClose}
                    className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-100"
                    style={{ color: 'var(--text-3)' }}
                    onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                        (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
                    }}
                    onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                        (e.currentTarget as HTMLElement).style.color = 'var(--text-3)';
                    }}
                >
                    <X size={14} />
                </button>
            </div>

            {/* Results */}
            {query.trim().length >= 2 && !isSearching && (
                <div
                    className="max-h-52 overflow-y-auto rounded-xl chat-scroll"
                    style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                    }}
                >
                    {results.length === 0 ? (
                        <p className="text-[12px] text-center py-5" style={{ color: 'var(--text-3)' }}>
                            Nothing found
                        </p>
                    ) : (
                        results.map((msg, idx) => {
                            const isMe = String(msg.senderId) === String(currentUserId);
                            return (
                                <button
                                    key={msg.id ?? idx}
                                    onClick={() => { if (msg.id) onJumpTo(msg.id, idx); }}
                                    className="w-full text-left px-3 py-2.5 transition-all duration-100 cursor-pointer"
                                    style={{
                                        background: idx === navIdx ? 'var(--accent-dim)' : 'transparent',
                                        borderLeft: idx === navIdx ? `2px solid var(--accent)` : '2px solid transparent',
                                    }}
                                    onMouseEnter={e => {
                                        if (idx !== navIdx)
                                            (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                                    }}
                                    onMouseLeave={e => {
                                        if (idx !== navIdx)
                                            (e.currentTarget as HTMLElement).style.background = 'transparent';
                                    }}
                                >
                                    <div className="flex items-center justify-between mb-0.5">
                    <span
                        className="text-[11px] font-semibold"
                        style={{ color: idx === navIdx ? 'var(--accent-bright)' : 'var(--text-2)' }}
                    >
                      {isMe ? 'You' : (msg.sender?.nickname ?? '?')}
                    </span>
                                        <span className="text-[10px] font-mono" style={{ color: 'var(--text-3)' }}>
                      {formatTime(msg.createdAt)}
                    </span>
                                    </div>
                                    <p className="text-[12px] truncate" style={{ color: 'var(--text-2)' }}>
                                        <HighlightText text={msg.content} query={query} />
                                    </p>
                                </button>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}