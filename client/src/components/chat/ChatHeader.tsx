'use client';

import { Users, Hash, Search, LayoutGrid, Phone, Video, Lock } from 'lucide-react';
import { Avatar }       from '@/src/components/chat/Avatar';
import { Conversation } from '@/src/types/conversation.types';
import { User }         from '@/src/types/auth.types';

interface Props {
    conversation:   Conversation;
    currentUser:    User | null;
    isSearchOpen:   boolean;
    showMedia:      boolean;
    onToggleSearch: () => void;
    onToggleMedia:  () => void;
    onStartCall?:   (convId: number, targetUserId: number, type: 'audio' | 'video') => void;
}

export function ChatHeader({
                               conversation, currentUser,
                               isSearchOpen, showMedia,
                               onToggleSearch, onToggleMedia, onStartCall,
                           }: Readonly<Props>) {
    const currentUserId = currentUser?.id;
    const isGroup   = conversation.type === 'GROUP';
    const isChannel = conversation.type === 'CHANNEL';
    const isSelf    = conversation.type === 'DIRECT' && conversation.members.every(m => m.userId === currentUserId);
    const otherMember = conversation.type === 'DIRECT'
        ? conversation.members.find(m => m.userId !== currentUserId)
        : null;

    const memberCountLabel = `${conversation.members.length} ${isGroup ? 'members' : 'subscribers'}`;

    return (
        <header
            className="flex items-center justify-between px-5 py-3 shrink-0 z-10"
            style={{
                background: 'var(--bg-surface)',
                borderBottom: '1px solid var(--border)',
                minHeight: '60px',
            }}
        >
            {/* ── Left: info ── */}
            <div className="flex items-center gap-3 min-w-0">
                {/* Avatar / icon */}
                {conversation.avatarUrl || conversation.type === 'DIRECT' ? (
                    <div className="relative shrink-0">
                        <Avatar
                            user={{ nickname: conversation.name ?? '?', avatarUrl: conversation.avatarUrl }}
                            size="md"
                            className="w-9 h-9"
                        />
                        {conversation.type === 'DIRECT' && (
                            <span
                                className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
                                style={{
                                    background: conversation.isOnline ? 'var(--green)' : '#3a3a4a',
                                    borderColor: 'var(--bg-surface)',
                                }}
                            />
                        )}
                    </div>
                ) : (
                    <div
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                        style={{
                            background: isGroup
                                ? 'rgba(124,77,255,0.12)'
                                : 'rgba(59,130,246,0.12)',
                        }}
                    >
                        {isGroup
                            ? <Users size={15} style={{ color: 'var(--accent)' }} />
                            : <Hash size={15} className="text-blue-400" />
                        }
                    </div>
                )}

                {/* Name + status */}
                <div className="min-w-0">
                    <h2
                        className="text-[14px] font-semibold truncate leading-tight"
                        style={{ color: 'var(--text-1)' }}
                    >
                        {isSelf ? 'Saved Messages' : (conversation.name ?? 'Chat')}
                    </h2>
                    <p
                        className="text-[11px] leading-tight mt-0.5 truncate"
                        style={{
                            color: conversation.type === 'DIRECT' && conversation.isOnline
                                ? 'var(--green)'
                                : 'var(--text-3)',
                        }}
                    >
                        {conversation.type === 'DIRECT'
                            ? isSelf
                                ? 'Private vault'
                                : conversation.isOnline
                                    ? 'Online'
                                    : 'Offline'
                            : memberCountLabel}
                    </p>
                </div>
            </div>

            {/* ── Right: actions ── */}
            <div className="flex items-center gap-1 shrink-0">
                {/* Call buttons for DIRECT */}
                {conversation.type === 'DIRECT' && !isSelf && onStartCall && otherMember && (
                    <>
                        <HeaderButton
                            onClick={() => onStartCall(conversation.id, otherMember.userId, 'audio')}
                            title="Audio call"
                        >
                            <Phone size={15} />
                        </HeaderButton>
                        <HeaderButton
                            onClick={() => onStartCall(conversation.id, otherMember.userId, 'video')}
                            title="Video call"
                        >
                            <Video size={15} />
                        </HeaderButton>
                        <div
                            className="w-px h-4 mx-1"
                            style={{ background: 'var(--border)' }}
                        />
                    </>
                )}

                <HeaderButton
                    onClick={onToggleSearch}
                    active={isSearchOpen}
                    title="Search"
                >
                    <Search size={15} />
                </HeaderButton>

                <HeaderButton
                    onClick={onToggleMedia}
                    active={showMedia}
                    title="Attachments"
                >
                    <LayoutGrid size={15} />
                </HeaderButton>

                {/* E2E indicator */}
                {(conversation.type === 'DIRECT' || conversation.type === 'GROUP') && (
                    <div
                        className="flex items-center gap-1 ml-2 px-2 py-1 rounded-lg"
                        style={{
                            background: 'rgba(124,77,255,0.08)',
                            border: '1px solid rgba(124,77,255,0.14)',
                        }}
                    >
                        <Lock size={9} style={{ color: 'var(--accent)' }} />
                        <span className="text-[9px] font-mono" style={{ color: 'var(--accent)' }}>E2E</span>
                    </div>
                )}
            </div>
        </header>
    );
}

// ── Icon button ────────────────────────────────────────────────────────────────
function HeaderButton({
                          children, onClick, active, title,
                      }: {
    children: React.ReactNode;
    onClick: () => void;
    active?: boolean;
    title?: string;
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-150"
            style={{
                background: active ? 'var(--accent-dim)' : 'transparent',
                color: active ? 'var(--accent-bright)' : 'var(--text-3)',
                border: active ? '1px solid var(--border-accent)' : '1px solid transparent',
            }}
            onMouseEnter={e => {
                if (!active) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
                }
            }}
            onMouseLeave={e => {
                if (!active) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.color = 'var(--text-3)';
                }
            }}
        >
            {children}
        </button>
    );
}