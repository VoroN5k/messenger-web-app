'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    X, Phone, Video, Search, LayoutGrid,
    Trash2, UserMinus, ChevronRight, Shield, Clock, Calendar,
    AlertTriangle, Check, Loader2, Image, Mic, Paperclip,
    MessageSquare, Users, Hash,
} from 'lucide-react';
import { Avatar } from '@/src/components/chat/Avatar';
import { useSignedUrl } from '@/src/hooks/useSignedUrl';
import { Conversation, ConvUser } from '@/src/types/conversation.types';
import { User } from '@/src/types/auth.types';
import api from '@/src/lib/axios';
import { formatLastSeen } from '@/src/lib/chatFormatters';

// ── Types ─────────────────────────────────────────────────────────────────────
interface MediaCount { photos: number; voice: number; files: number }
type ClearScope = 'self' | 'both';

export interface UserProfilePanelProps {
    conversation:   Conversation;
    currentUser:    User | null;
    peer:           ConvUser | null;
    onClose:        () => void;
    onStartCall?:   (convId: number, targetUserId: number, type: 'audio' | 'video') => void;
    onToggleSearch?: () => void;
    onToggleMedia?:  () => void;
    onChatCleared?:  () => void;
    onRemoveFriend?: (friendId: number) => void;
}

// ── Large avatar (uses signed URL) ───────────────────────────────────────────
function LargeAvatar({ user }: { user: { nickname: string; avatarUrl?: string | null } }) {
    const signed = useSignedUrl(user.avatarUrl);
    const [errored, setErrored] = useState(false);

    const PALETTE = ['#7c4dff','#5c6bc0','#26a69a','#66bb6a','#ef5350','#ec407a','#ab47bc','#42a5f5'];
    let hash = 0;
    for (let i = 0; i < user.nickname.length; i++)
        hash = user.nickname.charCodeAt(i) + ((hash << 5) - hash);
    const bg = PALETTE[Math.abs(hash) % PALETTE.length];
    const initials = user.nickname.slice(0, 2).toUpperCase();

    return signed && !errored ? (
        <img
            src={signed}
            alt={user.nickname}
            onError={() => setErrored(true)}
            className="w-full h-full object-cover"
        />
    ) : (
        <div
            className="w-full h-full flex items-center justify-center text-3xl font-bold text-white select-none"
            style={{ background: bg }}
        >
            {initials}
        </div>
    );
}

// ── Clear chat confirmation modal ─────────────────────────────────────────────
function ClearChatModal({
                            convName, isDirect, isAdmin, onConfirm, onClose,
                        }: {
    convName:  string;
    isDirect:  boolean;
    isAdmin:   boolean;
    onConfirm: (scope: ClearScope) => void;
    onClose:   () => void;
}) {
    const [scope, setScope] = useState<ClearScope>('self');
    const canDeleteBoth = isDirect || isAdmin;

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[300] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="w-full max-w-sm rounded-2xl overflow-hidden modal-enter"
                style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-md)',
                    boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
                }}
            >
                {/* Header */}
                <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(255,77,106,0.12)', border: '1px solid rgba(255,77,106,0.2)' }}
                    >
                        <Trash2 size={15} style={{ color: 'var(--red)' }} />
                    </div>
                    <div>
                        <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
                            Очистити переписку
                        </h3>
                        <p className="text-[11px] truncate max-w-[200px]" style={{ color: 'var(--text-3)' }}>
                            {convName}
                        </p>
                    </div>
                </div>

                {/* Options */}
                <div className="p-5 space-y-3">
                    {/* Self */}
                    <ScopeOption
                        value="self"
                        current={scope}
                        label="Видалити тільки у мене"
                        description="Повідомлення зникнуть лише у вашому чаті. Інші учасники їх не побачать."
                        onChange={setScope}
                        color="var(--accent)"
                    />

                    {/* Both */}
                    {canDeleteBoth && (
                        <ScopeOption
                            value="both"
                            current={scope}
                            label="Видалити для всіх"
                            description="Всі повідомлення зникнуть у кожного учасника переписки."
                            onChange={setScope}
                            color="var(--red)"
                        />
                    )}

                    {/* Warning for "both" */}
                    {scope === 'both' && (
                        <div
                            className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 slide-up"
                            style={{
                                background: 'rgba(255,77,106,0.07)',
                                border: '1px solid rgba(255,77,106,0.18)',
                            }}
                        >
                            <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
                            <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(248,113,113,0.85)' }}>
                                Всі повідомлення буде безповоротно видалено для всіх учасників.
                                Ця дія незворотна.
                            </p>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="px-5 pb-5 flex gap-2.5">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl text-[13px] font-medium cursor-pointer transition-all"
                        style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-2)',
                        }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'}
                    >
                        Скасувати
                    </button>
                    <button
                        onClick={() => onConfirm(scope)}
                        className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold cursor-pointer transition-all"
                        style={{
                            background: scope === 'both'
                                ? 'rgba(255,77,106,0.85)'
                                : 'var(--accent)',
                            color: '#fff',
                            boxShadow: scope === 'both'
                                ? '0 4px 20px rgba(255,77,106,0.3)'
                                : '0 4px 20px rgba(124,77,255,0.3)',
                        }}
                    >
                        Очистити
                    </button>
                </div>
            </div>
        </div>
    );
}

function ScopeOption({
                         value, current, label, description, onChange, color,
                     }: {
    value: ClearScope; current: ClearScope;
    label: string; description: string;
    onChange: (v: ClearScope) => void;
    color: string;
}) {
    const active = value === current;
    return (
        <label
            className="flex items-start gap-3 cursor-pointer rounded-xl p-3.5 transition-all duration-150"
            style={{
                background: active ? `${color}10` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${active ? `${color}40` : 'var(--border)'}`,
            }}
        >
            {/* Radio */}
            <div
                className="relative flex items-center justify-center mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 transition-all"
                style={{ borderColor: active ? color : 'rgba(255,255,255,0.2)' }}
                onClick={() => onChange(value)}
            >
                {active && (
                    <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: color }}
                    />
                )}
            </div>
            <div onClick={() => onChange(value)}>
                <p className="text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>{label}</p>
                <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-3)' }}>{description}</p>
            </div>
        </label>
    );
}

// ── 5-second undo toast ───────────────────────────────────────────────────────
function UndoToast({
                       scope, onUndo, onExpired,
                   }: {
    scope: ClearScope;
    onUndo: () => void;
    onExpired: () => void;
}) {
    const [remaining, setRemaining] = useState(5);
    const expiredRef = useRef(false);
    const TOTAL = 5;

    useEffect(() => {
        const interval = setInterval(() => {
            setRemaining(r => {
                if (r <= 1) {
                    clearInterval(interval);
                    if (!expiredRef.current) { expiredRef.current = true; onExpired(); }
                    return 0;
                }
                return r - 1;
            });
        }, 1_000);
        return () => clearInterval(interval);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleUndo = () => {
        expiredRef.current = true;
        onUndo();
    };

    const pct    = ((TOTAL - remaining) / TOTAL) * 100;
    const r      = 14;
    const circ   = 2 * Math.PI * r;
    const offset = circ * (1 - pct / 100);

    return (
        <div
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-4 px-5 py-3.5 rounded-2xl shadow-2xl modal-enter"
            style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-md)',
                boxShadow: '0 16px 50px rgba(0,0,0,0.6)',
                minWidth: '300px',
                maxWidth: '90vw',
            }}
        >
            {/* Countdown ring */}
            <div className="relative shrink-0 w-9 h-9">
                <svg width="36" height="36" viewBox="0 0 36 36" className="rotate-[-90deg]">
                    <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                    <circle
                        cx="18" cy="18" r={r} fill="none"
                        stroke="var(--red)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={circ}
                        strokeDashoffset={offset}
                        style={{ transition: 'stroke-dashoffset 0.9s linear' }}
                    />
                </svg>
                <span
                    className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums"
                    style={{ color: 'var(--red)' }}
                >
                    {remaining}
                </span>
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
                    Переписку буде очищено
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {scope === 'both' ? 'Для всіх учасників' : 'Тільки для вас'}
                </p>
            </div>

            <button
                onClick={handleUndo}
                className="shrink-0 px-3.5 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer transition-all"
                style={{
                    background: 'rgba(124,77,255,0.15)',
                    border: '1px solid var(--border-accent)',
                    color: 'var(--accent-bright)',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(124,77,255,0.28)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(124,77,255,0.15)'}
            >
                Скасувати
            </button>
        </div>
    );
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ icon, count, label }: { icon: React.ReactNode; count: number; label: string }) {
    return (
        <div
            className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl flex-1"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
        >
            <div style={{ color: 'var(--accent-bright)' }}>{icon}</div>
            <span className="text-[15px] font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{count}</span>
            <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>{label}</span>
        </div>
    );
}

// ── Action button ─────────────────────────────────────────────────────────────
function ActionBtn({
                       icon, label, onClick, danger = false, disabled = false,
                   }: {
    icon: React.ReactNode; label: string;
    onClick: () => void; danger?: boolean; disabled?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="flex flex-col items-center gap-2 px-3 py-3 rounded-xl cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-1"
            style={{
                background: danger ? 'rgba(255,77,106,0.08)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${danger ? 'rgba(255,77,106,0.18)' : 'var(--border)'}`,
            }}
            onMouseEnter={e => {
                if (!disabled) (e.currentTarget as HTMLElement).style.background =
                    danger ? 'rgba(255,77,106,0.15)' : 'rgba(255,255,255,0.07)';
            }}
            onMouseLeave={e => {
                if (!disabled) (e.currentTarget as HTMLElement).style.background =
                    danger ? 'rgba(255,77,106,0.08)' : 'rgba(255,255,255,0.04)';
            }}
        >
            <div style={{ color: danger ? 'var(--red)' : 'var(--accent-bright)' }}>{icon}</div>
            <span className="text-[10px] font-medium text-center leading-tight"
                  style={{ color: danger ? 'var(--red)' : 'var(--text-2)' }}>
                {label}
            </span>
        </button>
    );
}

// ── Info row ──────────────────────────────────────────────────────────────────
function InfoRow({
                     icon, label, value, onClick, danger = false,
                 }: {
    icon: React.ReactNode; label: string; value?: string;
    onClick?: () => void; danger?: boolean;
}) {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            onClick={onClick}
            className="w-full flex items-center gap-3 px-4 py-3 transition-all text-left"
            style={{ cursor: onClick ? 'pointer' : 'default' }}
            onMouseEnter={e => onClick && ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)')}
            onMouseLeave={e => onClick && ((e.currentTarget as HTMLElement).style.background = 'transparent')}
        >
            <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{
                    background: danger ? 'rgba(255,77,106,0.1)' : 'rgba(255,255,255,0.05)',
                    color: danger ? 'var(--red)' : 'var(--text-3)',
                }}
            >
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate"
                   style={{ color: danger ? 'var(--red)' : 'var(--text-1)' }}>
                    {label}
                </p>
                {value && (
                    <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-3)' }}>
                        {value}
                    </p>
                )}
            </div>
            {onClick && <ChevronRight size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
        </Tag>
    );
}

// ── Section divider ───────────────────────────────────────────────────────────
function Divider() {
    return <div className="mx-4 my-1" style={{ borderTop: '1px solid var(--border)' }} />;
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function UserProfilePanel({
                                     conversation, currentUser, peer, onClose,
                                     onStartCall, onToggleSearch, onToggleMedia,
                                     onChatCleared, onRemoveFriend,
                                 }: Readonly<UserProfilePanelProps>) {
    const isDirect  = conversation.type === 'DIRECT';
    const isGroup   = conversation.type === 'GROUP';
    const isChannel = conversation.type === 'CHANNEL';
    const isSelf    = isDirect && conversation.members.every(m => m.userId === currentUser?.id);

    const myMember = conversation.members.find(m => m.userId === currentUser?.id);
    const isAdmin  = myMember?.role === 'OWNER' || myMember?.role === 'ADMIN';

    const displayName   = isSelf ? 'Збережені повідомлення' : (peer?.nickname ?? conversation.name ?? 'Chat');
    const displayAvatar = peer ?? { nickname: displayName, avatarUrl: conversation.avatarUrl };
    const isOnline      = isDirect && !isSelf ? (peer?.isOnline ?? false) : false;
    const lastSeen      = isDirect && !isSelf && peer?.lastSeen
        ? formatLastSeen(peer.lastSeen)
        : null;

    const joinedAt = myMember?.joinedAt
        ? new Date(myMember.joinedAt).toLocaleDateString('uk-UA', {
            day: 'numeric', month: 'long', year: 'numeric',
        })
        : null;

    const memberLabel = isGroup
        ? `${conversation.members.length} учасників`
        : isChannel
            ? `${conversation.members.length} підписників`
            : null;

    // ── Media counts ──────────────────────────────────────────────────────────
    const [mediaCount,   setMediaCount]   = useState<MediaCount>({ photos: 0, voice: 0, files: 0 });
    const [mediaLoading, setMediaLoading] = useState(true);

    useEffect(() => {
        api.get(`/conversations/${conversation.id}/media`)
            .then(r => {
                const data: any[] = r.data;
                let photos = 0, voice = 0, files = 0;
                for (const m of data) {
                    if (!m.fileUrl) continue;
                    const mime: string = m.fileType ?? '';
                    if (mime.startsWith('image/'))      photos++;
                    else if (mime.startsWith('audio/')) voice++;
                    else                                 files++;
                }
                setMediaCount({ photos, voice, files });
            })
            .catch(() => {})
            .finally(() => setMediaLoading(false));
    }, [conversation.id]);

    // ── Clear chat flow ───────────────────────────────────────────────────────
    const [showClearModal, setShowClearModal] = useState(false);
    const [pendingScope,   setPendingScope]   = useState<ClearScope | null>(null);
    const [clearing,       setClearing]       = useState(false);

    const handleClearConfirm = (scope: ClearScope) => {
        setShowClearModal(false);
        setPendingScope(scope); // triggers undo toast
    };

    const handleUndoExpired = useCallback(async () => {
        if (!pendingScope) return;
        const scope = pendingScope;
        setPendingScope(null);
        setClearing(true);
        try {
            await api.delete(`/conversations/${conversation.id}/messages?scope=${scope}`);
            onChatCleared?.();
        } catch (err: any) {
            console.error('[ClearChat] failed:', err.message);
        } finally {
            setClearing(false);
        }
    }, [pendingScope, conversation.id, onChatCleared]);

    const handleUndo = useCallback(() => {
        setPendingScope(null);
    }, []);

    // ── Close on Escape ───────────────────────────────────────────────────────
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !showClearModal) onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onClose, showClearModal]);

    const peerId = peer?.id;
    const totalMedia = mediaCount.photos + mediaCount.voice + mediaCount.files;

    return (
        <>
            {/* ── Mobile backdrop ── */}
            <div
                className="fixed inset-0 z-30 md:hidden backdrop-enter"
                style={{ background: 'rgba(0,0,0,0.5)' }}
                onClick={onClose}
            />

            {/* ── Panel ── */}
            <div
                className="absolute top-0 right-0 h-full z-30 flex flex-col overflow-hidden panel-enter"
                style={{
                    width: '300px',
                    background: 'var(--bg-surface)',
                    borderLeft: '1px solid var(--border)',
                    boxShadow: '-12px 0 40px rgba(0,0,0,0.4)',
                }}
            >
                {/* ── Close bar ── */}
                <div
                    className="flex items-center gap-2 px-4 py-3 shrink-0"
                    style={{ borderBottom: '1px solid var(--border)' }}
                >
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-all"
                        style={{ color: 'var(--text-3)' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                    >
                        <X size={16} />
                    </button>
                    <span className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
                        {isDirect ? 'Профіль' : isGroup ? 'Інформація про групу' : 'Канал'}
                    </span>
                </div>

                {/* ── Scrollable content ── */}
                <div className="flex-1 overflow-y-auto chat-scroll">

                    {/* ── Hero ── */}
                    <div className="flex flex-col items-center px-4 pt-7 pb-5">
                        {/* Avatar */}
                        <div
                            className="w-24 h-24 rounded-full overflow-hidden mb-4 ring-2 shrink-0"
                            style={{ boxShadow: '0 0 0 2px var(--border-accent), 0 8px 30px rgba(0,0,0,0.4)' }}
                        >
                            <LargeAvatar user={displayAvatar} />
                        </div>

                        {/* Name */}
                        <h2 className="text-[17px] font-bold text-center leading-tight mb-1.5 px-2"
                            style={{ color: 'var(--text-1)' }}>
                            {displayName}
                        </h2>

                        {/* Status */}
                        {isOnline && (
                            <span className="text-[12px] font-medium" style={{ color: 'var(--green)' }}>
                                В мережі
                            </span>
                        )}
                        {!isOnline && lastSeen && (
                            <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>
                                {lastSeen}
                            </span>
                        )}
                        {memberLabel && (
                            <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>
                                {memberLabel}
                            </span>
                        )}

                        {/* E2E badge */}
                        {(isDirect || isGroup) && (
                            <div
                                className="flex items-center gap-1.5 mt-3 px-2.5 py-1.5 rounded-full"
                                style={{
                                    background: 'var(--accent-dim)',
                                    border: '1px solid var(--border-accent)',
                                }}
                            >
                                <Shield size={10} style={{ color: 'var(--accent)' }} />
                                <span className="text-[10px] font-mono" style={{ color: 'var(--accent)' }}>
                                    End-to-end encrypted
                                </span>
                            </div>
                        )}
                    </div>

                    {/* ── Quick action buttons ── */}
                    {!isSelf && (
                        <div className="px-4 pb-4">
                            <div className="flex gap-2">
                                {isDirect && peerId && onStartCall && (
                                    <>
                                        <ActionBtn
                                            icon={<Phone size={17} />}
                                            label="Аудіо"
                                            onClick={() => onStartCall(conversation.id, peerId, 'audio')}
                                        />
                                        <ActionBtn
                                            icon={<Video size={17} />}
                                            label="Відео"
                                            onClick={() => onStartCall(conversation.id, peerId, 'video')}
                                        />
                                    </>
                                )}
                                {onToggleSearch && (
                                    <ActionBtn
                                        icon={<Search size={17} />}
                                        label="Пошук"
                                        onClick={() => { onToggleSearch(); onClose(); }}
                                    />
                                )}
                                {onToggleMedia && (
                                    <ActionBtn
                                        icon={<LayoutGrid size={17} />}
                                        label="Медіа"
                                        onClick={() => { onToggleMedia(); onClose(); }}
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    <Divider />

                    {/* ── Media stats ── */}
                    <div className="px-4 py-4">
                        <p
                            className="text-[10px] font-semibold uppercase tracking-widest mb-3"
                            style={{ color: 'var(--text-3)' }}
                        >
                            Вкладення
                        </p>
                        <div className="flex gap-2">
                            {mediaLoading ? (
                                <div
                                    className="flex-1 h-20 rounded-xl flex items-center justify-center"
                                    style={{ background: 'rgba(255,255,255,0.03)' }}
                                >
                                    <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-3)' }} />
                                </div>
                            ) : totalMedia === 0 ? (
                                <div
                                    className="flex-1 h-16 rounded-xl flex items-center justify-center"
                                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}
                                >
                                    <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>Немає вкладень</span>
                                </div>
                            ) : (
                                <>
                                    {mediaCount.photos > 0 && (
                                        <StatPill icon={<Image size={14} />} count={mediaCount.photos} label="Фото" />
                                    )}
                                    {mediaCount.voice > 0 && (
                                        <StatPill icon={<Mic size={14} />} count={mediaCount.voice} label="Голос" />
                                    )}
                                    {mediaCount.files > 0 && (
                                        <StatPill icon={<Paperclip size={14} />} count={mediaCount.files} label="Файли" />
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    <Divider />

                    {/* ── Info rows ── */}
                    <div className="py-1">
                        {joinedAt && (
                            <InfoRow
                                icon={<Calendar size={14} />}
                                label={isGroup ? 'Ви приєднались' : 'Чат розпочато'}
                                value={joinedAt}
                            />
                        )}
                        {peer && !isSelf && (
                            <InfoRow
                                icon={<Clock size={14} />}
                                label="Останній сеанс"
                                value={lastSeen ?? (isOnline ? 'Зараз в мережі' : 'Невідомо')}
                            />
                        )}
                        {isGroup && (
                            <InfoRow
                                icon={<Users size={14} />}
                                label="Учасники"
                                value={`${conversation.members.length} учасників`}
                            />
                        )}
                    </div>

                    <Divider />

                    {/* ── Danger zone ── */}
                    <div className="py-1">
                        <InfoRow
                            icon={<Trash2 size={14} />}
                            label="Очистити переписку"
                            onClick={() => setShowClearModal(true)}
                            danger
                        />
                        {isDirect && !isSelf && peerId && onRemoveFriend && (
                            <InfoRow
                                icon={<UserMinus size={14} />}
                                label="Видалити з контактів"
                                onClick={() => { onRemoveFriend(peerId); onClose(); }}
                                danger
                            />
                        )}
                    </div>

                    <div className="h-6" />
                </div>

                {/* ── Clearing overlay ── */}
                {clearing && (
                    <div
                        className="absolute inset-0 flex items-center justify-center backdrop-enter"
                        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
                    >
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 size={26} className="animate-spin" style={{ color: 'var(--accent-bright)' }} />
                            <p className="text-[12px] font-mono" style={{ color: 'var(--text-2)' }}>
                                Очищення…
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Clear modal ── */}
            {showClearModal && (
                <ClearChatModal
                    convName={displayName}
                    isDirect={isDirect}
                    isAdmin={isAdmin}
                    onConfirm={handleClearConfirm}
                    onClose={() => setShowClearModal(false)}
                />
            )}

            {/* ── 5-second undo toast ── */}
            {pendingScope && (
                <UndoToast
                    scope={pendingScope}
                    onUndo={handleUndo}
                    onExpired={handleUndoExpired}
                />
            )}
        </>
    );
}