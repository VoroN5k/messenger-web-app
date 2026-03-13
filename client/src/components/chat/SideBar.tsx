'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    LogOut, Bell, BellOff, MessageSquare,
    Users, Search, X, UserPlus, Check,
    Hash, Plus, Settings,
} from 'lucide-react';
import { useAuthStore }         from '@/src/store/useAuthStore';
import api                      from '@/src/lib/axios';
import { Avatar }               from './Avatar';
import { AvatarCropModal }      from './AvatarCropModal';
import {
    Conversation, FriendItem, Friendship,
    UserSearchResult,
} from '@/src/types/conversation.types';
import { User } from '@/src/types/auth.types';

type SidebarTab = 'chats' | 'friends';

interface SidebarProps {
    currentUser:           User | null;
    conversations:         Conversation[];
    convsLoading:          boolean;
    friends:               FriendItem[];
    pendingRequests:       Friendship[];
    selectedConvId?:       number;
    socket:                any;
    onSelectConversation:  (c: Conversation) => void;
    onAddConversation:     (c: Conversation) => void;
    onSendFriendRequest:   (receiverId: number) => Promise<void>;
    onRespondFriendRequest:(id: number, action: 'ACCEPTED' | 'DECLINED') => Promise<void>;
    onRemoveFriend:        (friendId: number) => Promise<void>;
    onLogout:              () => void;
    pushPermission?:       string;
    onTogglePush?:         () => void;
}

function lastMsgText(conv: Conversation): string {
    const m = conv.lastMessage;
    if (!m) return 'Немає повідомлень';
    if (m.fileUrl)    return m.fileType?.startsWith('image/') ? '🖼 Фото' : '📎 Файл';
    if (!m.content)   return '...';
    return m.content.length > 40 ? m.content.slice(0, 40) + '…' : m.content;
}

function formatTime(d: string): string {
    const date    = new Date(d);
    const now     = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
}

export default function Sidebar({
                                    currentUser, conversations, convsLoading,
                                    friends, pendingRequests, selectedConvId, socket,
                                    onSelectConversation, onAddConversation,
                                    onSendFriendRequest, onRespondFriendRequest, onRemoveFriend,
                                    onLogout, pushPermission, onTogglePush,
                                }: SidebarProps) {
    const router = useRouter();

    const [tab,           setTab]           = useState<SidebarTab>('chats');
    const [searchQuery,   setSearchQuery]   = useState('');
    const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
    const [isSearching,   setIsSearching]   = useState(false);
    const [showCropModal, setShowCropModal] = useState(false);
    const [showNewGroup,  setShowNewGroup]  = useState(false);
    const [showNewChan,   setShowNewChan]   = useState(false);
    const [sendingReq,    setSendingReq]    = useState<number | null>(null);

    const { setAuth, user, accessToken } = useAuthStore();
    const searchTimer = useRef<NodeJS.Timeout | null>(null);

    // ── Avatar upload ─────────────────────────────────────────────────────────
    const handleSaveAvatar = async (blob: Blob) => {
        const fd = new FormData();
        fd.append('avatar', blob, 'avatar.jpg');
        const res = await api.post<{ avatarUrl: string }>('/users/avatar', fd);
        if (user && accessToken) setAuth({ ...user, avatarUrl: res.data.avatarUrl }, accessToken);
        setShowCropModal(false);
    };

    // ── User search ───────────────────────────────────────────────────────────
    const handleSearch = (q: string) => {
        setSearchQuery(q);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        if (q.trim().length < 2) { setSearchResults([]); return; }
        setIsSearching(true);
        searchTimer.current = setTimeout(async () => {
            try {
                const res = await api.get<UserSearchResult[]>('/friends/search', { params: { q: q.trim() } });
                setSearchResults(res.data);
            } finally {
                setIsSearching(false);
            }
        }, 350);
    };

    // ── Open DM ───────────────────────────────────────────────────────────────
    const openDirect = async (targetUserId: number) => {
        const res  = await api.post('/conversations/direct', { targetUserId });
        const conv = res.data as Conversation;
        onAddConversation(conv);
        onSelectConversation(conv);
        socket?.emit('joinConversation', { conversationId: conv.id });
        setSearchQuery(''); setSearchResults([]); setTab('chats');
    };

    // ── Send friend request ───────────────────────────────────────────────────
    const handleSendRequest = async (userId: number) => {
        setSendingReq(userId);
        try {
            await onSendFriendRequest(userId);
            setSearchResults((prev) =>
                prev.map((u) => u.id === userId ? { ...u, friendshipStatus: 'PENDING', isRequester: true } : u),
            );
        } finally {
            setSendingReq(null);
        }
    };

    const filteredConvs = conversations.filter((c) => {
        if (!searchQuery.trim() || tab !== 'chats') return true;
        return c.name?.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return (
        <aside className="w-[340px] bg-white dark:bg-slate-800 border-r border-gray-100 dark:border-slate-700 flex flex-col z-20 shrink-0 transition-colors duration-200">

            {/* ── Header ── */}
            <div className="px-4 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="relative group cursor-pointer" onClick={() => setShowCropModal(true)}>
                        {currentUser && (
                            <Avatar user={currentUser} size="md"
                                    className="ring-2 ring-transparent group-hover:ring-violet-300 transition-all" />
                        )}
                        <div className="absolute inset-0 rounded-full bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </div>
                    </div>
                    <span className="font-semibold text-gray-800 dark:text-slate-100 truncate text-sm">
                        {currentUser?.nickname}
                    </span>
                </div>

                <div className="flex items-center gap-0.5">
                    {pushPermission !== 'unsupported' && (
                        <button
                            onClick={onTogglePush}
                            disabled={pushPermission === 'granted' || pushPermission === 'denied'}
                            title={
                                pushPermission === 'granted' ? 'Сповіщення увімкнено' :
                                    pushPermission === 'denied'  ? 'Заблоковано' : 'Увімкнути сповіщення'
                            }
                            className={`p-2 rounded-full transition-all
                                ${pushPermission === 'granted'
                                ? 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cursor-default'
                                : pushPermission === 'denied'
                                    ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                    : 'text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer'}`}
                        >
                            {pushPermission === 'granted' ? <Bell size={15} /> : <BellOff size={15} />}
                        </button>
                    )}
                    {/* ── Settings button ── */}
                    <button
                        onClick={() => router.push('/settings')}
                        className="p-2 rounded-full text-gray-400 dark:text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-all cursor-pointer"
                        title="Налаштування"
                    >
                        <Settings size={15} />
                    </button>
                    <button
                        onClick={onLogout}
                        className="p-2 rounded-full text-gray-400 dark:text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-all cursor-pointer"
                        title="Вийти"
                    >
                        <LogOut size={15} />
                    </button>
                </div>
            </div>

            {/* ── Tabs ── */}
            <div className="flex border-b border-gray-100 dark:border-slate-700">
                {(['chats', 'friends'] as SidebarTab[]).map((t) => (
                    <button key={t} onClick={() => setTab(t)}
                            className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer
                                ${tab === t
                                ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-500 -mb-px'
                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                    >
                        {t === 'chats'
                            ? <><MessageSquare size={14} />Чати</>
                            : <><Users size={14} />Друзі
                                {pendingRequests.length > 0 && (
                                    <span className="ml-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center leading-none">
                                        {pendingRequests.length}
                                    </span>
                                )}
                            </>
                        }
                    </button>
                ))}
            </div>

            {/* ── Search bar ── */}
            <div className="px-3 py-2.5 border-b border-gray-100 dark:border-slate-700">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder={tab === 'chats' ? 'Пошук чатів...' : 'Знайти людей...'}
                        className="w-full pl-8 pr-8 py-2 bg-slate-50 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-400 rounded-xl text-sm outline-none focus:bg-white dark:focus:bg-slate-600 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-800 transition-all"
                    />
                    {searchQuery && (
                        <button onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                            <X size={13} />
                        </button>
                    )}
                </div>
            </div>

            {/* ── Content ── */}
            <div className="flex-1 overflow-y-auto">

                {/* ══ CHATS tab ══ */}
                {tab === 'chats' && (
                    <>
                        <div className="flex gap-1.5 px-3 py-2">
                            <button onClick={() => setShowNewGroup(true)}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-600 text-xs text-slate-500 dark:text-slate-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-violet-200 dark:hover:border-violet-700 hover:text-violet-600 dark:hover:text-violet-400 transition-all cursor-pointer">
                                <Plus size={12} />Група
                            </button>
                            <button onClick={() => setShowNewChan(true)}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-600 text-xs text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-200 dark:hover:border-indigo-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer">
                                <Hash size={12} />Канал
                            </button>
                        </div>

                        {convsLoading ? (
                            <div className="flex justify-center py-8">
                                <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : filteredConvs.length === 0 ? (
                            <p className="text-center text-slate-400 dark:text-slate-500 text-sm py-10">
                                {searchQuery ? 'Нічого не знайдено' : 'Немає чатів. Додайте друзів!'}
                            </p>
                        ) : (
                            filteredConvs.map((conv) => {
                                const isSelected = conv.id === selectedConvId;
                                const typeIcon   =
                                    conv.type === 'GROUP'   ? <Users size={10} className="text-violet-400" /> :
                                        conv.type === 'CHANNEL' ? <Hash  size={10} className="text-indigo-400" /> : null;

                                return (
                                    <div key={conv.id} onClick={() => onSelectConversation(conv)}
                                         className={`px-3 py-3 cursor-pointer transition-all flex items-center gap-3 border-l-[3px]
                                            ${isSelected
                                             ? 'bg-violet-50 dark:bg-violet-900/20 border-l-violet-500'
                                             : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 border-l-transparent'}`}
                                    >
                                        <div className="relative shrink-0">
                                            {conv.avatarUrl
                                                ? <Avatar user={{ nickname: conv.name ?? '?', avatarUrl: conv.avatarUrl }} size="lg" />
                                                : conv.type === 'DIRECT'
                                                    ? <Avatar user={{ nickname: conv.name ?? '?', avatarUrl: null }} size="lg" />
                                                    : (
                                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center
                                                            ${conv.type === 'GROUP' ? 'bg-violet-100 dark:bg-violet-900/40' : 'bg-indigo-100 dark:bg-indigo-900/40'}`}>
                                                            {conv.type === 'GROUP'
                                                                ? <Users size={20} className="text-violet-500" />
                                                                : <Hash  size={20} className="text-indigo-500" />}
                                                        </div>
                                                    )
                                            }
                                            {conv.type === 'DIRECT' && (
                                                <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800
                                                    ${conv.isOnline ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'}`} />
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-1">
                                                <div className="flex items-center gap-1 min-w-0">
                                                    {typeIcon}
                                                    <p className={`font-medium text-sm truncate
                                                        ${isSelected ? 'text-violet-900 dark:text-violet-300' : 'text-gray-800 dark:text-slate-200'}`}>
                                                        {conv.name ?? 'Чат'}
                                                    </p>
                                                </div>
                                                <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                                                    {conv.lastMessage ? formatTime(conv.lastMessage.createdAt) : ''}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between gap-1 mt-0.5">
                                                <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{lastMsgText(conv)}</p>
                                                {conv.unreadCount > 0 && (
                                                    <span className="bg-violet-500 text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shrink-0">
                                                        {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </>
                )}

                {/* ══ FRIENDS tab ══ */}
                {tab === 'friends' && (
                    <>
                        {pendingRequests.length > 0 && (
                            <div className="px-3 py-2">
                                <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Вхідні запити</p>
                                {pendingRequests.map((req) => (
                                    <div key={req.id} className="flex items-center gap-2 py-2">
                                        <Avatar user={req.sender!} size="md" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{req.sender?.nickname}</p>
                                        </div>
                                        <button onClick={() => onRespondFriendRequest(req.id, 'ACCEPTED')}
                                                className="p-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 hover:bg-emerald-100 cursor-pointer transition-colors">
                                            <Check size={13} />
                                        </button>
                                        <button onClick={() => onRespondFriendRequest(req.id, 'DECLINED')}
                                                className="p-1.5 rounded-full bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-100 cursor-pointer transition-colors">
                                            <X size={13} />
                                        </button>
                                    </div>
                                ))}
                                <div className="border-b border-slate-100 dark:border-slate-700 mt-2 mb-1" />
                            </div>
                        )}

                        {searchQuery.trim().length >= 2 && (
                            <div className="px-3 py-2">
                                <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Результати пошуку</p>
                                {isSearching ? (
                                    <div className="flex justify-center py-4">
                                        <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : searchResults.length === 0 ? (
                                    <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-3">Нікого не знайдено</p>
                                ) : (
                                    searchResults.map((u) => (
                                        <div key={u.id} className="flex items-center gap-2 py-2">
                                            <Avatar user={u} size="md" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{u.nickname}</p>
                                                <p className="text-xs text-slate-400 dark:text-slate-500">{u.isOnline ? 'В мережі' : 'Офлайн'}</p>
                                            </div>
                                            {u.friendshipStatus === 'ACCEPTED' ? (
                                                <button onClick={() => openDirect(u.id)}
                                                        className="text-xs px-2.5 py-1 rounded-lg bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 hover:bg-violet-100 cursor-pointer transition-colors font-medium">
                                                    Написати
                                                </button>
                                            ) : u.friendshipStatus === 'PENDING' && u.isRequester ? (
                                                <span className="text-xs text-slate-400 px-2">Надіслано</span>
                                            ) : u.friendshipStatus === 'PENDING' ? (
                                                <div className="flex gap-1">
                                                    <button onClick={() => onRespondFriendRequest(u.friendshipId!, 'ACCEPTED')}
                                                            className="p-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 hover:bg-emerald-100 cursor-pointer">
                                                        <Check size={13} />
                                                    </button>
                                                    <button onClick={() => onRespondFriendRequest(u.friendshipId!, 'DECLINED')}
                                                            className="p-1.5 rounded-full bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-100 cursor-pointer">
                                                        <X size={13} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button onClick={() => handleSendRequest(u.id)} disabled={sendingReq === u.id}
                                                        className="p-1.5 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-600 hover:bg-violet-100 cursor-pointer disabled:opacity-50 transition-colors">
                                                    <UserPlus size={13} />
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )}
                                <div className="border-b border-slate-100 dark:border-slate-700 mt-2 mb-1" />
                            </div>
                        )}

                        {friends.length === 0 && searchQuery.trim().length < 2 ? (
                            <p className="text-center text-slate-400 dark:text-slate-500 text-sm py-10">Немає друзів. Знайдіть людей вгорі!</p>
                        ) : (
                            <div className="px-3 py-2">
                                {searchQuery.trim().length < 2 && (
                                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">
                                        Друзі · {friends.length}
                                    </p>
                                )}
                                {friends.map((f) => (
                                    <div key={f.friendshipId} className="flex items-center gap-2 py-2 group">
                                        <div className="relative shrink-0">
                                            <Avatar user={f.friend} size="md" />
                                            <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-800
                                                ${f.friend.isOnline ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{f.friend.nickname}</p>
                                            <p className="text-xs text-slate-400 dark:text-slate-500">{f.friend.isOnline ? 'В мережі' : 'Офлайн'}</p>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openDirect(f.friend.id)}
                                                    className="p-1.5 rounded-full text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30 cursor-pointer transition-colors" title="Написати">
                                                <MessageSquare size={13} />
                                            </button>
                                            <button onClick={() => onRemoveFriend(f.friend.id)}
                                                    className="p-1.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 cursor-pointer transition-colors" title="Видалити з друзів">
                                                <X size={13} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ── Modals ── */}
            {showCropModal && (
                <AvatarCropModal onClose={() => setShowCropModal(false)} onSave={handleSaveAvatar} />
            )}
            {showNewGroup && (
                <CreateGroupModal
                    friends={friends}
                    onClose={() => setShowNewGroup(false)}
                    onCreated={(conv) => {
                        onAddConversation(conv);
                        onSelectConversation(conv);
                        socket?.emit('joinConversation', { conversationId: conv.id });
                        setShowNewGroup(false);
                    }}
                />
            )}
            {showNewChan && (
                <CreateChannelModal
                    onClose={() => setShowNewChan(false)}
                    onCreated={(conv) => {
                        onAddConversation(conv);
                        onSelectConversation(conv);
                        socket?.emit('joinConversation', { conversationId: conv.id });
                        setShowNewChan(false);
                    }}
                />
            )}
        </aside>
    );
}

// ── Create Group Modal ────────────────────────────────────────────────────────
function CreateGroupModal({ friends, onClose, onCreated }: {
    friends: FriendItem[]; onClose: () => void; onCreated: (c: Conversation) => void;
}) {
    const [name,     setName]     = useState('');
    const [selected, setSelected] = useState<number[]>([]);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');

    const toggle = (id: number) =>
        setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

    const submit = async () => {
        const trimmedName = name.trim();
        if (!trimmedName) { setError('Введіть назву групи'); return; }
        if (trimmedName.length < 2) { setError('Мінімум 2 символи'); return; }
        setError(''); setLoading(true);
        try {
            const res = await api.post('/conversations/group', { name: trimmedName, memberIds: selected });
            onCreated(res.data as Conversation);
        } catch (e: any) {
            const msg = e.response?.data?.message || 'Помилка створення';
            setError(Array.isArray(msg) ? msg[0] : msg);
        } finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">Нова група</h3>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer text-slate-400"><X size={15} /></button>
                </div>
                <div className="p-5 space-y-4">
                    <div>
                        <input value={name} onChange={(e) => { setName(e.target.value); setError(''); }}
                               onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                               placeholder="Назва групи *" autoFocus
                               className={`w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-violet-200 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-400 transition-all
                                   ${error ? 'border-red-400' : 'border-slate-200 dark:border-slate-600'}`} />
                        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                    </div>
                    {friends.length === 0 ? (
                        <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">Немає друзів. Групу буде створено лише з вами.</p>
                    ) : (
                        <>
                            <p className="text-xs text-slate-400 dark:text-slate-500">Оберіть учасників (необов'язково):</p>
                            <div className="max-h-48 overflow-y-auto space-y-1">
                                {friends.map((f) => (
                                    <label key={f.friendshipId} className="flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                                        <input type="checkbox" checked={selected.includes(f.friend.id)}
                                               onChange={() => toggle(f.friend.id)}
                                               className="accent-violet-500 w-4 h-4 cursor-pointer" />
                                        <Avatar user={f.friend} size="sm" />
                                        <span className="text-sm text-slate-700 dark:text-slate-300">{f.friend.nickname}</span>
                                    </label>
                                ))}
                            </div>
                            {selected.length > 0 && (
                                <p className="text-xs text-violet-500 font-medium">Вибрано: {selected.length} учасник(ів)</p>
                            )}
                        </>
                    )}
                </div>
                <div className="px-5 pb-5 flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors">Скасувати</button>
                    <button onClick={submit} disabled={loading || !name.trim()}
                            className="flex-1 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        {loading ? 'Створення...' : 'Створити'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Create Channel Modal ──────────────────────────────────────────────────────
function CreateChannelModal({ onClose, onCreated }: {
    onClose: () => void; onCreated: (c: Conversation) => void;
}) {
    const [name,    setName]    = useState('');
    const [desc,    setDesc]    = useState('');
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState('');

    const submit = async () => {
        const trimmedName = name.trim();
        if (!trimmedName) { setError('Введіть назву каналу'); return; }
        setError(''); setLoading(true);
        try {
            const res = await api.post('/conversations/channel', { name: trimmedName, description: desc.trim() || undefined });
            onCreated(res.data as Conversation);
        } catch (e: any) {
            const msg = e.response?.data?.message || 'Помилка створення';
            setError(Array.isArray(msg) ? msg[0] : msg);
        } finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">Новий канал</h3>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer text-slate-400"><X size={15} /></button>
                </div>
                <div className="p-5 space-y-3">
                    <div>
                        <input value={name} onChange={(e) => { setName(e.target.value); setError(''); }}
                               placeholder="Назва каналу *" autoFocus
                               className={`w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-400 transition-all
                                   ${error ? 'border-red-400' : 'border-slate-200 dark:border-slate-600'}`} />
                        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                    </div>
                    <textarea value={desc} onChange={(e) => setDesc(e.target.value)}
                              placeholder="Опис (необов'язково)" rows={3}
                              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-400 text-sm outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
                </div>
                <div className="px-5 pb-5 flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">Скасувати</button>
                    <button onClick={submit} disabled={loading || !name.trim()}
                            className="flex-1 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        {loading ? 'Створення...' : 'Створити'}
                    </button>
                </div>
            </div>
        </div>
    );
}