'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    X, Phone, Video, Search, LayoutGrid, Bell, BellOff,
    Trash2, UserMinus, ChevronRight, Shield, Clock, Calendar,
    ArrowLeft, AlertTriangle, Check, Loader2, Image, Mic, Paperclip,
} from 'lucide-react';
import { Avatar } from '@/src/components/chat/Avatar';
import { useSignedUrl } from '@/src/hooks/useSignedUrl';
import { Conversation, ConvUser } from '@/src/types/conversation.types';
import { User } from '@/src/types/auth.types';
import api from '@/src/lib/axios';
import { formatLastSeen } from '@/src/lib/chatFormatters';

// ── Types ─────────────────────────────────────────────────────────────────────
interface MediaCount {
    photos:  number;
    voice:   number;
    files:   number;
}

export interface UserProfilePanelProps {
    /** The conversation the profile belongs to */
    conversation:  Conversation;
    currentUser:   User | null;
    /** The peer user (for DIRECT) — derived from conversation.members */
    peer:          ConvUser | null;
    onClose:       () => void;
    onStartCall?:  (convId: number, targetUserId: number, type: 'audio' | 'video') => void;
    onToggleSearch?: () => void;
    onToggleMedia?:  () => void;
    /** Called after chat is cleared so parent can refresh messages */
    onChatCleared?:  () => void;
    onRemoveFriend?: (friendId: number) => void;
}

// ── Large signed avatar ───────────────────────────────────────────────────────
function LargeAvatar({ user }: { user: ConvUser | { nickname: string; avatarUrl?: string | null } }) {
    const signed = useSignedUrl(user.avatarUrl);
    const initials = user.nickname.slice(0, 2).toUpperCase();
    const PALETTE = [
        '#7c4dff', '#5c6bc0', '#26a69a', '#66bb6a',
        '#ef5350', '#ec407a', '#ab47bc', '#42a5f5',
    ];
    let hash = 0;
    for (let i = 0; i < user.nickname.length; i++)
        hash = user.nickname.charCodeAt(i) + ((hash << 5) - hash);
    const bg = PALETTE[Math.abs(hash) % PALETTE.length];

    const [errored, setErrored] = useState(false);

    return signed && !errored ? (
        <img
            src={signed}
            alt={user.nickname}
            onError={() => setErrored(true)}
            className="w-full h-full object-cover"
        />
    ) : (
        <div
            className="w-full h-full flex items-center justify-center text-4xl font-bold text-white select-none"
            style={{ background: bg }}
        >
            {initials}
        </div>
    );
}

// ── Clear chat modal ──────────────────────────────────────────────────────────
type ClearScope = 'self' | 'both';

function ClearChatModal({
                            convName,
                            isDirect,
                            isAdmin,
                            onConfirm,
                            onClose,
                        }: {
    convName:  string;
    isDirect:  boolean;
    isAdmin:   boolean;
    onConfirm: (scope: ClearScope) => void;
    onClose:   () => void;
}) {
    const [scope, setScope] = useState<ClearScope>('self');

    const canDeleteBoth = isDirect || isAdmin;

    return (
        <div
            className="fixed inset-0 z-[300] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="w-full max-w-sm rounded-2xl overflow-hidden"
                style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-md)',
                    boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
                }}
            >
                {/* Header */}
                <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text-1)' }}>
                        Очистити переписку
                    </h3>
                    <p className="text-[12px] mt-0.5 truncate" style={{ color: 'var(--text-3)' }}>
                        {convName}
                    </p>
                </div>

                {/* Options */}
                <div className="p-5 space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer group">
                        <div className="relative mt-0.5 shrink-0">
                            <input
                                type="radio"
                                name="scope"
                                value="self"
                                checked={scope === 'self'}
                                onChange={() => setScope('self')}
                                className="appearance-none w-4 h-4 rounded-full border-2 transition-all cursor-pointer"
                                style={{
                                    borderColor: scope === 'self' ? 'var(--accent)' : 'rgba(255,255,255,0.2)',
                                    background:  scope === 'self' ? 'var(--accent)' : 'transparent',
                                }}
                            />
                            {scope === 'self' && (
                                <div
                                    className="absolute inset-[3px] rounded-full"
                                    style={{ background: '#fff' }}
                                />
                            )}
                        </div>
                        <div>
                            <p className="text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
                                Видалити лише для мене
                            </p>
                            <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-3)' }}>
                                Повідомлення зникнуть тільки у вас. Співрозмовник їх не побачить.
                            </p>
                        </div>
                    </label>

                    {canDeleteBoth && (
                        <label className="flex items-start gap-3 cursor-pointer group">
                            <div className="relative mt-0.5 shrink-0">
                                <input
                                    type="radio"
                                    name="scope"
                                    value="both"
                                    checked={scope === 'both'}
                                    onChange={() => setScope('both')}
                                    className="appearance-none w-4 h-4 rounded-full border-2 transition-all cursor-pointer"
                                    style={{
                                        borderColor: scope === 'both' ? 'var(--red)' : 'rgba(255,255,255,0.2)',
                                        background:  scope === 'both' ? 'var(--red)' : 'transparent',
                                    }}
                                />
                                {scope === 'both' && (
                                    <div
                                        className="absolute inset-[3px] rounded-full"
                                        style={{ background: '#fff' }}
                                    />
                                )}
                            </div>
                            <div>
                                <p className="text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
                                    Видалити для обох
                                </p>
                                <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-3)' }}>
                                    Повідомлення зникнуть у всіх учасників переписки.
                                </p>
                            </div>
                        </label>
                    )}

                    {scope === 'both' && (
                        <div
                            className="flex items-start gap-2 rounded-xl px-3 py-2.5"
                            style={{ background: 'rgba(255,77,106,0.08)', border: '1px solid rgba(255,77,106,0.18)' }}
                        >
                            <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
                            <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(248,113,113,0.85)' }}>
                                Всі повідомлення буде безповоротно видалено для всіх учасників. Цю дію не можна скасувати.
                            </p>
                        </div>
                    )}
                </div>

                {/* Buttons */}
                <div className="px-5 pb-5 flex gap-2">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl text-[13px] font-medium cursor-pointer transition-colors"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                    >
                        Скасувати
                    </button>
                    <button
                        onClick={() => onConfirm(scope)}
                        className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold cursor-pointer transition-colors"
                        style={{
                            background: scope === 'both' ? 'rgba(255,77,106,0.85)' : 'var(--accent)',
                            color: '#fff',
                            boxShadow: scope === 'both' ? '0 4px 20px rgba(255,77,106,0.3)' : '0 4px 20px rgba(124,77,255,0.3)',
                        }}
                    >
                        Очистити
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── 5-second undo toast ───────────────────────────────────────────────────────
function UndoToast({
                       scope,
                       onUndo,
                       onExpired,
                   }: {
    scope:     ClearScope;
    onUndo:    () => void;
    onExpired: () => void;
}) {
    const [remaining, setRemaining] = useState(5);
    const expiredRef = useRef(false);

    useEffect(() => {
        const interval = setInterval(() => {
            setRemaining(r => {
                if (r <= 1) {
                    clearInterval(interval);
                    if (!expiredRef.current) {
                        expiredRef.current = true;
                        onExpired();
                    }
                    return 0;
                }
                return r - 1;
            });
        }, 1_000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleUndo = () => {
        expiredRef.current = true;
        onUndo();
    };

    const pct = ((5 - remaining) / 5) * 100;

    return (
        <div
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-4 px-5 py-3.5 rounded-2xl shadow-2xl"
            style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-md)',
                boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
                minWidth: '320px',
                maxWidth: '90vw',
            }}
        >
            {/* Progress ring */}
            <div className="relative shrink-0">
                <svg width="36" height="36" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                    <circle
                        cx="18" cy="18" r="15" fill="none"
                        stroke="var(--red)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 15}`}
                        strokeDashoffset={`${2 * Math.PI * 15 * (1 - pct / 100)}`}
                        transform="rotate(-90 18 18)"
                        style={{ transition: 'stroke-dashoffset 0.9s linear' }}
                    />
                    <text x="18" y="22" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--red)">
                        {remaining}
                    </text>
                </svg>
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
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(124,77,255,0.25)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(124,77,255,0.15)'}
            >
                Скасувати
            </button>
        </div>
    );
}

// ── Stat pill (media count) ───────────────────────────────────────────────────
function StatPill({ icon, count, label }: { icon: React.ReactNode; count: number; label: string }) {
    return (
        <div
            className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl flex-1"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
        >
            <div style={{ color: 'var(--accent-bright)' }}>{icon}</div>
            <span className="text-[14px] font-bold" style={{ color: 'var(--text-1)' }}>{count}</span>
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
            className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-1"
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

// ── Row item ──────────────────────────────────────────────────────────────────
function RowItem({
                     icon, label, value, onClick, danger = false,
                 }: {
    icon: React.ReactNode; label: string; value?: string;
    onClick?: () => void; danger?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer transition-all text-left"
            style={{ color: 'inherit' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
        >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                 style={{
                     background: danger ? 'rgba(255,77,106,0.1)' : 'rgba(255,255,255,0.05)',
                     color: danger ? 'var(--red)' : 'var(--text-3)',
                 }}>
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate"
                   style={{ color: danger ? 'var(--red)' : 'var(--text-1)' }}>
                    {label}
                </p>
                {value && (
                    <p className="text-[11px] truncate" style={{ color: 'var(--text-3)' }}>{value}</p>
                )}
            </div>
            <ChevronRight size={14} style={{ color: 'var(--text-3)' }} />
        </button>
    );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function UserProfilePanel({
                                     conversation,
                                     currentUser,
                                     peer,
                                     onClose,
                                     onStartCall,
                                     onToggleSearch,
                                     onToggleMedia,
                                     onChatCleared,
                                     onRemoveFriend,
                                 }: UserProfilePanelProps) {
    const isDirect  = conversation.type === 'DIRECT';
    const isGroup   = conversation.type === 'GROUP';
    const isChannel = conversation.type === 'CHANNEL';
    const isSelf    = isDirect && conversation.members.every(m => m.userId === currentUser?.id);

    const myMember = conversation.members.find(m => m.userId === currentUser?.id);
    const isAdmin  = myMember?.role === 'OWNER' || myMember?.role === 'ADMIN';

    // Display data
    const displayName   = isSelf ? 'Збережені' : (peer?.nickname ?? conversation.name ?? 'Chat');
    const displayAvatar = peer ?? { nickname: displayName, avatarUrl: conversation.avatarUrl };
    const isOnline      = isDirect && !isSelf ? peer?.isOnline : false;
    const lastSeen      = isDirect && !isSelf && peer?.lastSeen
        ? formatLastSeen(peer.lastSeen)
        : null;

    // Join date for groups
    const joinedAt = myMember?.joinedAt
        ? new Date(myMember.joinedAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
        : null;

    // Media counts
    const [mediaCount, setMediaCount] = useState<MediaCount>({ photos: 0, voice: 0, files: 0 });
    const [mediaLoading, setMediaLoading] = useState(true);

    useEffect(() => {
        api.get(`/conversations/${conversation.id}/media`)
            .then(r => {
                const data: any[] = r.data;
                let photos = 0, voice = 0, files = 0;
                for (const m of data) {
                    if (!m.fileUrl) continue;
                    const mime: string = m.fileType ?? '';
                    if (mime.startsWith('image/'))       photos++;
                    else if (mime.startsWith('audio/'))  voice++;
                    else                                  files++;
                }
                setMediaCount({ photos, voice, files });
            })
            .catch(() => {})
            .finally(() => setMediaLoading(false));
    }, [conversation.id]);

    // Clear chat flow
    const [showClearModal, setShowClearModal] = useState(false);
    const [pendingScope,   setPendingScope]   = useState<ClearScope | null>(null);
    const [clearing,       setClearing]       = useState(false);

    const handleClearConfirm = (scope: ClearScope) => {
        setShowClearModal(false);
        setPendingScope(scope);  // triggers undo toast
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
            console.error('Clear chat failed:', err.message);
        } finally {
            setClearing(false);
        }
    }, [pendingScope, conversation.id, onChatCleared]);

    const handleUndo = () => {
        setPendingScope(null);
    };

    // Member count label
    const memberLabel = isGroup
        ? `${conversation.members.length} учасників`
        : isChannel
            ? `${conversation.members.length} підписників`
            : null;

    const peerId = peer?.id;

    return (
        <>
            {/* Backdrop — on mobile only */}
            <div
                className="fixed inset-0 z-30 md:hidden"
                style={{ background: 'rgba(0,0,0,0.4)' }}
                onClick={onClose}
            />

            {/* Panel */}
            <div
                className="absolute top-0 right-0 h-full z-30 flex flex-col overflow-hidden panel-enter"
                style={{
                    width: '300px',
                    background: 'var(--bg-surface)',
                    borderLeft: '1px solid var(--border)',
                    boxShadow: '-8px 0 32px rgba(0,0,0,0.35)',
                }}
            >
                {/* Close bar */}
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
            {isDirect ? 'Профіль' : isGroup ? 'Група' : 'Канал'}
          </span>
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto chat-scroll">

                    {/* ── Hero: avatar + name ── */}
                    <div className="flex flex-col items-center px-4 pt-6 pb-5">
                        {/* Avatar */}
                        <div className="w-24 h-24 rounded-full overflow-hidden mb-3 ring-2"
                             style={{ boxShadow: '0 0 0 2px var(--border-accent)' }}>
                            <LargeAvatar user={displayAvatar} />
                        </div>

                        {/* Name */}
                        <h2 className="text-[17px] font-bold text-center leading-tight mb-1"
                            style={{ color: 'var(--text-1)' }}>
                            {displayName}
                        </h2>

                        {/* Status / member count */}
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
                            <div className="flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full"
                                 style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}>
                                <Shield size={10} style={{ color: 'var(--accent)' }} />
                                <span className="text-[10px] font-mono" style={{ color: 'var(--accent)' }}>E2E encrypted</span>
                            </div>
                        )}
                    </div>

                    {/* ── Action buttons row ── */}
                    {!isSelf && (
                        <div className="px-4 pb-4">
                            <div className="flex gap-2">
                                {isDirect && peerId && onStartCall && (
                                    <>
                                        <ActionBtn
                                            icon={<Phone size={18} />}
                                            label="Аудіо"
                                            onClick={() => onStartCall(conversation.id, peerId, 'audio')}
                                        />
                                        <ActionBtn
                                            icon={<Video size={18} />}
                                            label="Відео"
                                            onClick={() => onStartCall(conversation.id, peerId, 'video')}
                                        />
                                    </>
                                )}
                                {onToggleSearch && (
                                    <ActionBtn
                                        icon={<Search size={18} />}
                                        label="Пошук"
                                        onClick={() => { onToggleSearch(); onClose(); }}
                                    />
                                )}
                                {onToggleMedia && (
                                    <ActionBtn
                                        icon={<LayoutGrid size={18} />}
                                        label="Медіа"
                                        onClick={() => { onToggleMedia(); onClose(); }}
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    <div className="mx-4 mb-1" style={{ borderTop: '1px solid var(--border)' }} />

                    {/* ── Media stats ── */}
                    {(mediaCount.photos > 0 || mediaCount.voice > 0 || mediaCount.files > 0 || mediaLoading) && (
                        <div className="px-4 py-3">
                            <p className="text-[10px] font-semibold uppercase tracking-widest mb-3"
                               style={{ color: 'var(--text-3)' }}>
                                Вкладення
                            </p>
                            <div className="flex gap-2">
                                {mediaLoading ? (
                                    <div className="flex-1 h-16 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-3)' }} />
                                        </div>
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
                    )}

                    <div className="mx-4 mb-1" style={{ borderTop: '1px solid var(--border)' }} />

                    {/* ── Info rows ── */}
                    <div className="py-1">
                        {joinedAt && (
                            <RowItem
                                icon={<Calendar size={15} />}
                                label={isGroup ? 'Ви приєднались' : 'В чаті з'}
                                value={joinedAt}
                                onClick={() => {}}
                            />
                        )}
                        {peer && !isSelf && (
                            <RowItem
                                icon={<Clock size={15} />}
                                label="Останній сеанс"
                                value={lastSeen ?? (isOnline ? 'зараз в мережі' : 'невідомо')}
                                onClick={() => {}}
                            />
                        )}
                    </div>

                    <div className="mx-4 my-1" style={{ borderTop: '1px solid var(--border)' }} />

                    {/* ── Danger zone ── */}
                    <div className="py-1">
                        <RowItem
                            icon={<Trash2 size={15} />}
                            label="Очистити переписку"
                            onClick={() => setShowClearModal(true)}
                            danger
                        />
                        {isDirect && !isSelf && peerId && onRemoveFriend && (
                            <RowItem
                                icon={<UserMinus size={15} />}
                                label="Видалити з контактів"
                                onClick={() => { onRemoveFriend(peerId); onClose(); }}
                                danger
                            />
                        )}
                    </div>

                    {/* Bottom padding */}
                    <div className="h-6" />
                </div>

                {/* Clearing overlay */}
                {clearing && (
                    <div className="absolute inset-0 flex items-center justify-center"
                         style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-bright)' }} />
                            <p className="text-[12px] font-mono" style={{ color: 'var(--text-2)' }}>
                                Очищення...
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Clear chat modal ── */}
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