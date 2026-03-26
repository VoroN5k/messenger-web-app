'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    MessageSquare, Users, Search, X, UserPlus, Check, Hash,
    Settings, Bookmark, Plus, Shield, LogOut, Bell, BellOff, BellRing,
} from 'lucide-react';
import { useAuthStore } from '@/src/store/useAuthStore';
import api from '@/src/lib/axios';
import { Avatar } from './Avatar';
import { AvatarCropModal } from './AvatarCropModal';
import { CreateGroupModal } from './CreateGroupModal';
import { CreateChannelModal } from './CreateChannelModal';
import {
    Conversation, FriendItem, Friendship, UserSearchResult,
} from '@/src/types/conversation.types';
import { User } from '@/src/types/auth.types';

type SidebarTab = 'chats' | 'friends';

interface SidebarProps {
    currentUser: User | null;
    conversations: Conversation[];
    convsLoading: boolean;
    friends: FriendItem[];
    pendingRequests: Friendship[];
    selectedConvId?: number;
    socket: any;
    onSelectConversation: (c: Conversation) => void;
    onAddConversation: (c: Conversation) => void;
    onSendFriendRequest: (receiverId: number) => Promise<void>;
    onRespondFriendRequest: (id: number, action: 'ACCEPTED' | 'DECLINED') => Promise<void>;
    onRemoveFriend: (friendId: number) => Promise<void>;
    onLogout: () => void;
    pushPermission?: string;
    onTogglePush?: () => void;
}

function formatTime(d: string): string {
    const date = new Date(d);
    const now = new Date();
    if (date.toDateString() === now.toDateString())
        return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

function isSavedMessages(conv: Conversation, uid?: number) {
    return !!uid && conv.type === 'DIRECT' && conv.members.every(m => m.userId === uid);
}

function ConvSkeleton() {
    return (
        <div className="flex items-center gap-3 px-3 py-2.5 mx-2 my-0.5 rounded-xl">
            <div className="skeleton w-11 h-11 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
                <div className="skeleton h-3 rounded-full" style={{ width: '55%' }} />
                <div className="skeleton h-2.5 rounded-full" style={{ width: '38%' }} />
            </div>
        </div>
    );
}

export default function Sidebar(props: Readonly<SidebarProps>) {
    const {
        currentUser, conversations, convsLoading, friends, pendingRequests,
        selectedConvId, socket, onSelectConversation, onAddConversation,
        onSendFriendRequest, onRespondFriendRequest, onRemoveFriend,
        onLogout, pushPermission, onTogglePush,
    } = props;

    const router = useRouter();
    const [tab, setTab] = useState<SidebarTab>('chats');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showCropModal, setShowCropModal] = useState(false);
    const [showNewGroup, setShowNewGroup] = useState(false);
    const [showNewChan, setShowNewChan] = useState(false);
    const [sendingReq, setSendingReq] = useState<number | null>(null);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const { setAuth, user, accessToken } = useAuthStore();
    const searchTimer = useRef<NodeJS.Timeout | null>(null);

    const notifGranted = pushPermission === 'granted';
    const notifDenied  = pushPermission === 'denied';

    const handleSaveAvatar = async (blob: Blob) => {
        const fd = new FormData(); fd.append('avatar', blob, 'avatar.jpg');
        const res = await api.post<{ avatarUrl: string }>('/users/avatar', fd);
        if (user && accessToken) setAuth({ ...user, avatarUrl: res.data.avatarUrl }, accessToken);
        setShowCropModal(false);
    };

    const handleSearch = (q: string) => {
        setSearchQuery(q);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        if (q.trim().length < 2) { setSearchResults([]); return; }
        setIsSearching(true);
        searchTimer.current = setTimeout(async () => {
            try {
                const res = await api.get<UserSearchResult[]>('/friends/search', { params: { q: q.trim() } });
                setSearchResults(res.data);
            } finally { setIsSearching(false); }
        }, 350);
    };

    const openDirect = async (targetUserId: number) => {
        const res = await api.post('/conversations/direct', { targetUserId });
        const conv = res.data as Conversation;
        onAddConversation(conv); onSelectConversation(conv);
        socket?.emit('joinConversation', { conversationId: conv.id });
        setSearchQuery(''); setSearchResults([]); setTab('chats');
    };

    const openSaved = async () => {
        if (!currentUser) return;
        const existing = conversations.find(c => isSavedMessages(c, currentUser.id));
        if (existing) { onSelectConversation(existing); return; }
        const res = await api.post('/conversations/direct', { targetUserId: currentUser.id });
        const conv = res.data as Conversation;
        onAddConversation(conv); onSelectConversation(conv);
        socket?.emit('joinConversation', { conversationId: conv.id });
    };

    const handleSendRequest = async (userId: number) => {
        setSendingReq(userId);
        try {
            await onSendFriendRequest(userId);
            setSearchResults(prev => prev.map(u =>
                u.id === userId ? { ...u, friendshipStatus: 'PENDING', isRequester: true } : u
            ));
        } finally { setSendingReq(null); }
    };

    const filteredConvs = conversations.filter(c => {
        if (!searchQuery.trim() || tab !== 'chats') return true;
        return c.name?.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return (
        <aside
            className="w-[300px] flex flex-col shrink-0 h-full"
            style={{
                background: 'var(--bg-surface)',
                borderRight: '1px solid var(--border)',
            }}
        >
            {/* ── Top bar ── */}
            <div className="px-4 pt-4 pb-3 flex items-center justify-between shrink-0"
                 style={{ borderBottom: '1px solid var(--border)' }}>
                {/* User info */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">

                    {/* Аватарка (ТІЛЬКИ вона тепер клікабельна і викликає модалку) */}
                    <div
                        className="relative shrink-0 cursor-pointer group"
                        onClick={() => setShowCropModal(true)}
                        title="Змінити аватар"
                    >
                        {currentUser && <Avatar user={currentUser} size="md" />}
                        <div
                            className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center"
                            style={{ background: 'rgba(0,0,0,0.55)' }}
                        >
                            <Plus size={12} className="text-white" />
                        </div>
                    </div>

                    {/* Текст (нікнейм), він більше не розтягує клікабельну зону */}
                    <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold truncate leading-tight" style={{ color: 'var(--text-1)' }}>
                            {currentUser?.nickname ?? '—'}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                            <Shield size={9} style={{ color: 'var(--accent)' }} />
                            <span className="text-[10px] font-mono" style={{ color: 'var(--text-3)' }}>E2E</span>
                        </div>
                    </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-0.5 shrink-0">
                    {/* Notification bell (Тепер не зникає, а стає неактивним (disabled) та показує BellOff) */}
                    {onTogglePush && (
                        <SidebarIconBtn
                            onClick={notifDenied ? () => {} : onTogglePush}
                            title={notifDenied ? 'Сповіщення заблоковані в браузері' : (notifGranted ? 'Сповіщення увімкнені' : 'Увімкнути сповіщення')}
                            active={notifGranted}
                            disabled={notifDenied}
                        >
                            {notifDenied
                                ? <BellOff size={15} />
                                : (notifGranted ? <BellRing size={15} style={{ color: 'var(--accent-bright)' }} /> : <Bell size={15} />)
                            }
                        </SidebarIconBtn>
                    )}

                    {/* Settings */}
                    <SidebarIconBtn onClick={() => router.push('/settings')} title="Налаштування">
                        <Settings size={15} />
                    </SidebarIconBtn>

                    {/* Logout */}
                    <SidebarIconBtn
                        onClick={() => setShowLogoutConfirm(true)}
                        title="Вийти"
                        danger
                    >
                        <LogOut size={15} />
                    </SidebarIconBtn>
                </div>
            </div>

            {/* ── Search ── */}
            <div className="px-4 py-3 shrink-0">
                <div className="relative flex items-center">
                    <Search size={13} className="absolute left-3 pointer-events-none" style={{ color: 'var(--text-3)' }} />
                    <input
                        value={searchQuery}
                        onChange={e => handleSearch(e.target.value)}
                        placeholder="Пошук..."
                        className="w-full pl-8 pr-8 py-2 text-[13px] outline-none transition-all duration-200"
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
                    {searchQuery && (
                        <button
                            onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                            className="absolute right-2.5 cursor-pointer transition-colors duration-150"
                            style={{ color: 'var(--text-3)' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}
                        >
                            <X size={13} />
                        </button>
                    )}
                </div>
            </div>

            {/* ── Tabs ── */}
            <div className="flex px-4 pb-3 gap-1 shrink-0">
                {(['chats', 'friends'] as SidebarTab[]).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className="flex-1 py-1.5 text-[12px] font-medium rounded-lg cursor-pointer transition-all duration-150 relative"
                        style={tab === t
                            ? { background: 'var(--accent-dim)', color: 'var(--accent-bright)', border: '1px solid rgba(124,77,255,0.18)' }
                            : { background: 'transparent', color: 'var(--text-3)', border: '1px solid transparent' }
                        }
                    >
                        {t === 'chats' ? 'Чати' : 'Контакти'}
                        {t === 'friends' && pendingRequests.length > 0 && (
                            <span
                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-[9px] flex items-center justify-center font-bold badge-appear"
                                style={{ background: 'var(--accent)' }}
                            >
                                {pendingRequests.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── Scrollable body ── */}
            <div className="flex-1 overflow-y-auto chat-scroll min-h-0">

                {/* ── Chats tab ── */}
                {tab === 'chats' && (
                    <>
                        {/* Quick actions */}
                        <div className="flex gap-1.5 px-4 pb-2">
                            <button
                                onClick={openSaved}
                                className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-150 shrink-0"
                                style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.14)' }}
                                title="Збережені"
                            >
                                <Bookmark size={14} className="text-amber-400" />
                            </button>
                            {[
                                { icon: <Users size={12} />, label: 'Група', action: () => setShowNewGroup(true) },
                                { icon: <Hash size={12} />, label: 'Канал', action: () => setShowNewChan(true) },
                            ].map(btn => (
                                <button
                                    key={btn.label}
                                    onClick={btn.action}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-medium cursor-pointer transition-all duration-150"
                                    style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid var(--border)',
                                        color: 'var(--text-3)',
                                    }}
                                    onMouseEnter={e => {
                                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                                        (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
                                    }}
                                    onMouseLeave={e => {
                                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
                                        (e.currentTarget as HTMLElement).style.color = 'var(--text-3)';
                                    }}
                                >
                                    {btn.icon}
                                    {btn.label}
                                </button>
                            ))}
                        </div>

                        <div className="mx-4 mb-2" style={{ borderTop: '1px solid var(--border)' }} />

                        {/* Conversation list */}
                        {convsLoading
                            ? Array.from({ length: 5 }).map((_, i) => <ConvSkeleton key={i} />)
                            : filteredConvs.length === 0
                                ? (
                                    <div className="px-4 py-8 text-center">
                                        <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
                                            {searchQuery ? 'Нічого не знайдено' : 'Немає чатів. Додайте друзів!'}
                                        </p>
                                    </div>
                                )
                                : filteredConvs.map(conv => {
                                    const isSelected = conv.id === selectedConvId;
                                    const isSaved = isSavedMessages(conv, currentUser?.id);

                                    return (
                                        <div
                                            key={conv.id}
                                            onClick={() => onSelectConversation(conv)}
                                            className="flex items-center gap-3 px-3 py-2.5 mx-2 my-0.5 rounded-xl cursor-pointer transition-all duration-150"
                                            style={{
                                                background: isSelected ? 'var(--bg-active)' : 'transparent',
                                                border: isSelected ? '1px solid var(--border-accent)' : '1px solid transparent',
                                            }}
                                            onMouseEnter={e => {
                                                if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                                            }}
                                            onMouseLeave={e => {
                                                if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
                                            }}
                                        >
                                            {/* Avatar */}
                                            <div className="relative shrink-0">
                                                {isSaved ? (
                                                    <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'rgba(251,191,36,0.12)' }}>
                                                        <Bookmark size={17} className="text-amber-400" />
                                                    </div>
                                                ) : conv.avatarUrl || conv.type === 'DIRECT' ? (
                                                    <>
                                                        <Avatar user={{ nickname: conv.name ?? '?', avatarUrl: conv.avatarUrl }} size="md" className="w-11 h-11" />
                                                        {conv.type === 'DIRECT' && (
                                                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
                                                                  style={{ background: conv.isOnline ? 'var(--green)' : '#3a3a4a', borderColor: 'var(--bg-surface)' }} />
                                                        )}
                                                    </>
                                                ) : (
                                                    <div className="w-11 h-11 rounded-full flex items-center justify-center"
                                                         style={{ background: conv.type === 'GROUP' ? 'rgba(124,77,255,0.12)' : 'rgba(59,130,246,0.12)' }}>
                                                        {conv.type === 'GROUP' ? <Users size={17} style={{ color: 'var(--accent)' }} /> : <Hash size={17} className="text-blue-400" />}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Text */}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between mb-0.5 gap-2">
                                                    <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-1)' }}>
                                                        {isSaved ? 'Збережені' : (conv.name ?? 'Чат')}
                                                    </p>
                                                    {conv.lastMessage && (
                                                        <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--text-3)' }}>
                                                            {formatTime(conv.lastMessage.createdAt)}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-[12px] truncate" style={{
                                                        color: conv.unreadCount > 0 ? 'var(--text-2)' : 'var(--text-3)',
                                                        fontWeight: conv.unreadCount > 0 ? 500 : 400,
                                                    }}>
                                                        {conv.lastMessage?.content || (conv.lastMessage?.fileType ? '📎 Файл' : '…')}
                                                    </p>
                                                    {conv.unreadCount > 0 && (
                                                        <span className="shrink-0 min-w-[18px] h-[18px] rounded-full text-[10px] font-semibold text-white px-1.5 flex items-center justify-center badge-appear"
                                                              style={{ background: 'var(--accent)' }}>
                                                            {conv.unreadCount}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                    </>
                )}

                {/* ── Friends tab ── */}
                {tab === 'friends' && (
                    <div className="px-2 py-1 space-y-4">
                        {/* Pending requests */}
                        {pendingRequests.length > 0 && (
                            <section className="slide-up">
                                <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                                    Запити
                                </p>
                                {pendingRequests.map(req => (
                                    <div key={req.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1"
                                         style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                                        <Avatar user={req.sender!} size="md" />
                                        <p className="flex-1 text-[13px] font-medium truncate" style={{ color: 'var(--text-1)' }}>
                                            {req.sender?.nickname}
                                        </p>
                                        <button onClick={() => onRespondFriendRequest(req.id, 'ACCEPTED')}
                                                className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-150"
                                                style={{ background: 'rgba(34,212,114,0.12)', border: '1px solid rgba(34,212,114,0.18)' }}>
                                            <Check size={13} className="text-green-400" />
                                        </button>
                                        <button onClick={() => onRespondFriendRequest(req.id, 'DECLINED')}
                                                className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-150"
                                                style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.15)' }}>
                                            <X size={13} className="text-red-400" />
                                        </button>
                                    </div>
                                ))}
                            </section>
                        )}

                        {/* Search results */}
                        {searchQuery.trim().length >= 2 && (
                            <section>
                                <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                                    Користувачі
                                </p>
                                {isSearching ? (
                                    <div className="flex justify-center py-8">
                                        <div className="w-5 h-5 rounded-full border-2 border-t-transparent"
                                             style={{ borderColor: 'rgba(124,77,255,0.3)', borderTopColor: 'var(--accent)', animation: 'spinSlow 0.8s linear infinite' }} />
                                    </div>
                                ) : searchResults.length === 0 ? (
                                    <p className="px-3 py-4 text-[12px]" style={{ color: 'var(--text-3)' }}>Нікого не знайдено</p>
                                ) : (
                                    searchResults.map(u => (
                                        <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 mb-0.5 cursor-pointer"
                                             onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                                             onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                                            <div className="relative shrink-0">
                                                <Avatar user={u} size="md" />
                                                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
                                                      style={{ background: u.isOnline ? 'var(--green)' : '#3a3a4a', borderColor: 'var(--bg-surface)' }} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-1)' }}>{u.nickname}</p>
                                                <p className="text-[11px]" style={{ color: u.isOnline ? 'var(--green)' : 'var(--text-3)' }}>
                                                    {u.isOnline ? 'В мережі' : 'Офлайн'}
                                                </p>
                                            </div>
                                            {u.friendshipStatus === 'ACCEPTED' ? (
                                                <button onClick={() => openDirect(u.id)}
                                                        className="text-[11px] font-medium px-3 py-1.5 rounded-lg cursor-pointer transition-all duration-150"
                                                        style={{ background: 'var(--accent-dim)', color: 'var(--accent-bright)', border: '1px solid var(--border-accent)' }}>
                                                    Написати
                                                </button>
                                            ) : u.friendshipStatus === 'PENDING' && u.isRequester ? (
                                                <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>Надіслано</span>
                                            ) : u.friendshipStatus === 'PENDING' ? (
                                                <button onClick={() => onRespondFriendRequest(u.friendshipId!, 'ACCEPTED')}
                                                        className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer"
                                                        style={{ background: 'rgba(34,212,114,0.1)', border: '1px solid rgba(34,212,114,0.15)' }}>
                                                    <Check size={13} className="text-green-400" />
                                                </button>
                                            ) : (
                                                <button onClick={() => handleSendRequest(u.id)} disabled={sendingReq === u.id}
                                                        className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-150 disabled:opacity-40"
                                                        style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}>
                                                    <UserPlus size={13} style={{ color: 'var(--accent-bright)' }} />
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </section>
                        )}

                        {/* Friends list */}
                        {friends.length > 0 && searchQuery.trim().length < 2 && (
                            <section>
                                <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                                    Контакти · {friends.length}
                                </p>
                                {friends.map(f => (
                                    <div key={f.friendshipId} className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 mb-0.5 cursor-pointer group"
                                         onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                                         onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                                        <div className="relative shrink-0">
                                            <Avatar user={f.friend} size="md" />
                                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
                                                  style={{ background: f.friend.isOnline ? 'var(--green)' : '#3a3a4a', borderColor: 'var(--bg-surface)' }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-1)' }}>{f.friend.nickname}</p>
                                            <p className="text-[11px]" style={{ color: f.friend.isOnline ? 'var(--green)' : 'var(--text-3)' }}>
                                                {f.friend.isOnline ? 'В мережі' : 'Офлайн'}
                                            </p>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                            <button onClick={() => openDirect(f.friend.id)}
                                                    className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150"
                                                    style={{ color: 'var(--text-2)' }}
                                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(124,77,255,0.1)'}
                                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                                                <MessageSquare size={13} />
                                            </button>
                                            <button onClick={() => onRemoveFriend(f.friend.id)}
                                                    className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150"
                                                    style={{ color: 'var(--text-3)' }}
                                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,77,106,0.1)'; (e.currentTarget as HTMLElement).style.color = 'var(--red)'; }}
                                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}>
                                                <X size={13} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </section>
                        )}

                        {friends.length === 0 && searchQuery.trim().length < 2 && (
                            <div className="px-4 py-8 text-center">
                                <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
                                    Немає контактів. Знайдіть людей вище!
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Modals ── */}
            {showCropModal && <AvatarCropModal onClose={() => setShowCropModal(false)} onSave={handleSaveAvatar} />}
            {showNewGroup && (
                <CreateGroupModal
                    friends={friends}
                    currentUserId={currentUser?.id}
                    onClose={() => setShowNewGroup(false)}
                    onCreated={conv => {
                        onAddConversation(conv); onSelectConversation(conv);
                        socket?.emit('joinConversation', { conversationId: conv.id });
                        setShowNewGroup(false);
                    }}
                />
            )}
            {showNewChan && (
                <CreateChannelModal
                    onClose={() => setShowNewChan(false)}
                    onCreated={conv => {
                        onAddConversation(conv); onSelectConversation(conv);
                        socket?.emit('joinConversation', { conversationId: conv.id });
                        setShowNewChan(false);
                    }}
                />
            )}

            {/* ── Logout confirm modal ── */}
            {showLogoutConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-xs rounded-2xl overflow-hidden modal-enter"
                         style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
                        <div className="px-6 py-5 text-center">
                            <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
                                 style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.2)' }}>
                                <LogOut size={20} style={{ color: 'var(--red)' }} />
                            </div>
                            <h3 className="text-[15px] font-semibold mb-1" style={{ color: 'var(--text-1)' }}>Вийти з акаунту?</h3>
                            <p className="text-[12px] mb-5" style={{ color: 'var(--text-3)' }}>
                                Ваші повідомлення залишаться зашифрованими на сервері.
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowLogoutConfirm(false)}
                                    className="flex-1 py-2.5 rounded-xl text-[13px] font-medium cursor-pointer transition-all duration-150"
                                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'}
                                >
                                    Скасувати
                                </button>
                                <button
                                    onClick={() => { setShowLogoutConfirm(false); onLogout(); }}
                                    className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold cursor-pointer transition-all duration-150 flex items-center justify-center gap-1.5"
                                    style={{ background: 'rgba(255,77,106,0.15)', border: '1px solid rgba(255,77,106,0.25)', color: 'var(--red)' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,77,106,0.22)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,77,106,0.15)'}
                                >
                                    <LogOut size={13} />
                                    Вийти
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
}

// ── Reusable icon button ──────────────────────────────────────────────────────
function SidebarIconBtn({
                            children, onClick, title, active, danger, disabled,
                        }: {
    children: React.ReactNode;
    onClick: () => void;
    title?: string;
    active?: boolean;
    danger?: boolean;
    disabled?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            disabled={disabled}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-150 ${
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
            style={{
                background: active ? 'var(--accent-dim)' : 'transparent',
                color: active ? 'var(--accent-bright)' : 'var(--text-3)',
                border: active ? '1px solid var(--border-accent)' : '1px solid transparent',
            }}
            onMouseEnter={e => {
                if (!active && !disabled) {
                    (e.currentTarget as HTMLElement).style.background = danger
                        ? 'rgba(255,77,106,0.1)'
                        : 'rgba(255,255,255,0.05)';
                    (e.currentTarget as HTMLElement).style.color = danger ? 'var(--red)' : 'var(--text-2)';
                }
            }}
            onMouseLeave={e => {
                if (!active && !disabled) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.color = 'var(--text-3)';
                }
            }}
        >
            {children}
        </button>
    );
}