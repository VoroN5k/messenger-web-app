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
        /* Backdrop */
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center backdrop-enter"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            {/* Sheet */}
            <div
                className="w-full sm:max-w-sm flex flex-col overflow-hidden modal-enter"
                style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-md)',
                    borderRadius: '20px 20px 20px 20px',
                    boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
                    maxHeight: '80vh',
                }}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-5 py-4 shrink-0"
                    style={{ borderBottom: '1px solid var(--border)' }}
                >
                    <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
                        Forward to…
                    </h3>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150"
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

                {/* Search */}
                <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="relative flex items-center">
                        <Search size={13} className="absolute left-3 pointer-events-none" style={{ color: 'var(--text-3)' }} />
                        <input
                            autoFocus
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            placeholder="Search chats…"
                            className="w-full pl-8 pr-4 py-2 text-[13px] outline-none"
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
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto chat-scroll py-1.5">
                    {filtered.length === 0 ? (
                        <p
                            className="text-center text-[12px] py-8"
                            style={{ color: 'var(--text-3)' }}
                        >
                            Nothing found
                        </p>
                    ) : (
                        filtered.map(conv => (
                            <button
                                key={conv.id}
                                onClick={() => { onForward(conv.id); onClose(); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 transition-all duration-100 cursor-pointer"
                                style={{ color: 'inherit' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                            >
                                <Avatar
                                    user={{ nickname: conv.name ?? '?', avatarUrl: conv.avatarUrl }}
                                    size="md"
                                />
                                <p
                                    className="flex-1 text-left text-[13px] font-medium truncate"
                                    style={{ color: 'var(--text-1)' }}
                                >
                                    {conv.name}
                                </p>
                                <Send size={13} style={{ color: 'var(--text-3)' }} />
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}