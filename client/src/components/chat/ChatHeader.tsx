'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Users, Hash, Search, LayoutGrid, Phone, Video, Lock,
    Pin, ChevronUp, ChevronLeft, Info,
} from 'lucide-react';
import { Avatar }       from '@/src/components/chat/Avatar';
import { Conversation } from '@/src/types/conversation.types';
import { User }         from '@/src/types/auth.types';
import api              from '@/src/lib/axios';
import { formatLastSeen } from '@/src/lib/chatFormatters';

interface PinnedMessageData {
    messageId: number;
    message: {
        id:      number;
        content: string;
        fileType?: string | null;
        sender:  { id: number; nickname: string };
    };
    pinnedBy: { id: number; nickname: string };
}

interface Props {
    conversation:   Conversation;
    currentUser:    User | null;
    isSearchOpen:   boolean;
    showMedia:      boolean;
    onToggleSearch: () => void;
    onToggleMedia:  () => void;
    onStartCall?:   (convId: number, targetUserId: number, type: 'audio' | 'video') => void;
    onJumpToMessage?: (messageId: number) => void;
    onBack?: () => void;

    onOpenProfile?: () => void;
}

export function ChatHeader({
                               conversation, currentUser,
                               isSearchOpen, showMedia,
                               onToggleSearch, onToggleMedia, onStartCall,
                               onJumpToMessage, onBack, onOpenProfile,
                           }: Readonly<Props>) {
    const currentUserId = currentUser?.id;
    const isGroup   = conversation.type === 'GROUP';
    const isChannel = conversation.type === 'CHANNEL';
    const isSelf    = conversation.type === 'DIRECT' && conversation.members.every(m => m.userId === currentUserId);
    const otherMember = conversation.type === 'DIRECT'
        ? conversation.members.find(m => m.userId !== currentUserId)
        : null;

    const memberCountLabel = `${conversation.members.length} ${isGroup ? 'учасників' : 'підписників'}`;

    // Multi-pin state
    const [pinnedMessages, setPinnedMessages] = useState<PinnedMessageData[]>([]);
    const [pinnedIndex,    setPinnedIndex]    = useState(0);
    const [loadingPinned,  setLoadingPinned]  = useState(false);

    const fetchPinnedMessages = useCallback(async () => {
        setLoadingPinned(true);
        try {
            const res = await api.get<PinnedMessageData[]>(`/conversations/${conversation.id}/pinned-messages`);
            setPinnedMessages(res.data);
            setPinnedIndex(0);
        } catch {
            // silently ignore
        } finally {
            setLoadingPinned(false);
        }
    }, [conversation.id]);

    useEffect(() => {
        fetchPinnedMessages();
    }, [fetchPinnedMessages]);

    const cyclePinned = () => {
        if (pinnedMessages.length === 0) return;
        const nextIdx = (pinnedIndex + 1) % pinnedMessages.length;
        setPinnedIndex(nextIdx);
        const msg = pinnedMessages[nextIdx];
        if (msg && onJumpToMessage) onJumpToMessage(msg.message.id);
    };

    const jumpToCurrent = () => {
        const msg = pinnedMessages[pinnedIndex];
        if (msg && onJumpToMessage) onJumpToMessage(msg.message.id);
    };

    const currentPinned = pinnedMessages[pinnedIndex] ?? null;
    const hasPinned     = pinnedMessages.length > 0;

    const pinnedPreview = currentPinned
        ? (currentPinned.message.fileType?.startsWith('audio/')
            ? '🎤 Голосове'
            : currentPinned.message.fileType
                ? '📎 Файл'
                : currentPinned.message.content || '…')
        : null;

    return (
        <div>
            {/* ── Main header bar ── */}
            <header
                className="flex items-center justify-between px-4 py-2.5 shrink-0 z-10"
                style={{
                    background: 'var(--bg-surface)',
                    borderBottom: '1px solid var(--border)',
                    minHeight: '60px',
                }}
            >
                {/* Left: back + avatar + info — CLICKABLE to open profile */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Back button (mobile) */}
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="md:hidden flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-colors cursor-pointer"
                            style={{ color: 'var(--text-2)' }}
                            aria-label="Back"
                        >
                            <ChevronLeft size={22} />
                        </button>
                    )}

                    {/* Avatar + name — click opens profile panel */}
                    <button
                        onClick={onOpenProfile}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left rounded-xl px-1.5 py-1 -ml-1.5 transition-all duration-150 cursor-pointer group"
                        style={{ background: 'transparent' }}
                        onMouseEnter={e => onOpenProfile && ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)')}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                        aria-label="Відкрити профіль"
                    >
                        {/* Avatar */}
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
                                style={{ background: isGroup ? 'rgba(124,77,255,0.12)' : 'rgba(59,130,246,0.12)' }}
                            >
                                {isGroup
                                    ? <Users size={15} style={{ color: 'var(--accent)' }} />
                                    : <Hash  size={15} className="text-blue-400" />}
                            </div>
                        )}

                        {/* Name + status */}
                        <div className="min-w-0">
                            <h2
                                className="text-[14px] font-semibold truncate leading-tight transition-colors duration-150"
                                style={{ color: 'var(--text-1)' }}
                            >
                                {isSelf ? 'Збережені повідомлення' : (conversation.name ?? 'Chat')}
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
                                        ? 'Ваш особистий архів'
                                        : conversation.isOnline
                                            ? 'В мережі'
                                            : formatLastSeen(otherMember?.user?.lastSeen)
                                    : memberCountLabel}
                            </p>
                        </div>
                    </button>
                </div>

                {/* Right: action buttons */}
                <div className="flex items-center gap-0.5 shrink-0 ml-1">
                    {/* Call buttons — DIRECT only */}
                    {conversation.type === 'DIRECT' && !isSelf && onStartCall && otherMember && (
                        <>
                            <HeaderButton
                                onClick={() => onStartCall(conversation.id, otherMember.userId, 'audio')}
                                title="Аудіо дзвінок"
                            >
                                <Phone size={15} />
                            </HeaderButton>
                            <HeaderButton
                                onClick={() => onStartCall(conversation.id, otherMember.userId, 'video')}
                                title="Відео дзвінок"
                            >
                                <Video size={15} />
                            </HeaderButton>
                            <div className="w-px h-4 mx-0.5" style={{ background: 'var(--border)' }} />
                        </>
                    )}

                    <HeaderButton onClick={onToggleSearch} active={isSearchOpen} title="Пошук">
                        <Search size={15} />
                    </HeaderButton>

                    <HeaderButton onClick={onToggleMedia} active={showMedia} title="Медіафайли">
                        <LayoutGrid size={15} />
                    </HeaderButton>

                    {onOpenProfile && (
                        <HeaderButton onClick={onOpenProfile} title="Профіль">
                            <Info size={15} />
                        </HeaderButton>
                    )}

                    {/* E2E badge */}
                    {(conversation.type === 'DIRECT' || conversation.type === 'GROUP') && (
                        <div
                            className="flex items-center gap-1 ml-1.5 px-2 py-1 rounded-lg"
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

            {/* ── Pinned messages banner (Telegram-style) ── */}
            {hasPinned && currentPinned && (
                <div
                    className="flex items-center gap-3 px-4 py-2 slide-up"
                    style={{
                        background: 'rgba(251,191,36,0.04)',
                        borderBottom: '1px solid rgba(251,191,36,0.10)',
                        minHeight: '44px',
                    }}
                >
                    {/* Pin icon + count indicator bars */}
                    <div className="flex flex-col items-center gap-0.5 shrink-0">
                        <Pin size={12} className="text-amber-400" />
                        {pinnedMessages.length > 1 && (
                            <div className="flex flex-col gap-0.5">
                                {pinnedMessages.map((_, i) => (
                                    <div
                                        key={i}
                                        className="w-0.5 rounded-full transition-all duration-200"
                                        style={{
                                            height: i === pinnedIndex ? '8px' : '4px',
                                            background: i === pinnedIndex
                                                ? 'rgba(251,191,36,0.9)'
                                                : 'rgba(251,191,36,0.3)',
                                        }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Content */}
                    <button
                        onClick={jumpToCurrent}
                        className="flex-1 min-w-0 text-left"
                    >
                        <p className="text-[11px] font-semibold text-amber-400 leading-tight truncate">
                            {pinnedMessages.length > 1
                                ? `Закріплено #${pinnedMessages.length - pinnedIndex} з ${pinnedMessages.length}`
                                : currentPinned.message.sender.nickname}
                        </p>
                        <p className="text-[11px] truncate" style={{ color: 'var(--text-3)' }}>
                            {pinnedPreview}
                        </p>
                    </button>

                    {/* Cycle button */}
                    {pinnedMessages.length > 1 && (
                        <button
                            onClick={cyclePinned}
                            className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150 shrink-0"
                            style={{ color: 'rgba(251,191,36,0.6)' }}
                            onMouseEnter={e => {
                                (e.currentTarget as HTMLElement).style.background = 'rgba(251,191,36,0.1)';
                                (e.currentTarget as HTMLElement).style.color = 'rgba(251,191,36,0.9)';
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLElement).style.background = 'transparent';
                                (e.currentTarget as HTMLElement).style.color = 'rgba(251,191,36,0.6)';
                            }}
                            title="Наступне закріплене"
                        >
                            <ChevronUp size={13} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// Icon button
function HeaderButton({
                          children, onClick, active, title,
                      }: {
    children: React.ReactNode;
    onClick:  () => void;
    active?:  boolean;
    title?:   string;
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-150"
            style={{
                background: active ? 'var(--accent-dim)' : 'transparent',
                color:      active ? 'var(--accent-bright)' : 'var(--text-3)',
                border:     active ? '1px solid var(--border-accent)' : '1px solid transparent',
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