'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LogOut, Bell, BellOff, MessageSquare, Users, Search, X, UserPlus, Check, Hash, Plus, Settings, Bookmark } from 'lucide-react';
import { useAuthStore }         from '@/src/store/useAuthStore';
import api                      from '@/src/lib/axios';
import { Avatar }               from './Avatar';
import { AvatarCropModal }      from './AvatarCropModal';
import { CreateGroupModal }     from './CreateGroupModal';
import { CreateChannelModal }   from './CreateChannelModal';
import { Conversation, FriendItem, Friendship, UserSearchResult } from '@/src/types/conversation.types';
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

function formatTime(d: string): string {
    const date    = new Date(d);
    const now     = new Date();
    if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

function isSavedMessages(conv: Conversation, currentUserId: number | undefined): boolean {
    return !!currentUserId && conv.type === 'DIRECT' && conv.members.length > 0 && conv.members.every(m => m.userId === currentUserId);
}

export default function Sidebar(props: Readonly<SidebarProps>) {
    const {
        currentUser, conversations, convsLoading, friends, pendingRequests,
        selectedConvId, socket, onSelectConversation, onAddConversation,
        onSendFriendRequest, onRespondFriendRequest, onRemoveFriend,
        onLogout, pushPermission, onTogglePush
    } = props;
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
        const res  = await api.post('/conversations/direct', { targetUserId });
        const conv = res.data as Conversation;
        onAddConversation(conv); onSelectConversation(conv);
        socket?.emit('joinConversation', { conversationId: conv.id });
        setSearchQuery(''); setSearchResults([]); setTab('chats');
    };

    const openSaved = async () => {
        if (!currentUser) return;
        const existing = conversations.find((c: Conversation) => isSavedMessages(c, currentUser.id));
        if (existing) { onSelectConversation(existing); return; }
        const res  = await api.post('/conversations/direct', { targetUserId: currentUser.id });
        const conv = res.data as Conversation;
        onAddConversation(conv); onSelectConversation(conv);
        socket?.emit('joinConversation', { conversationId: conv.id });
    };

    const handleSendRequest = async (userId: number) => {
        setSendingReq(userId);
        try {
            await onSendFriendRequest(userId);
            setSearchResults((prev) => prev.map((u) => u.id === userId ? { ...u, friendshipStatus: 'PENDING', isRequester: true } : u));
        } finally { setSendingReq(null); }
    };

    const filteredConvs = conversations.filter((c: Conversation) => {
        if (!searchQuery.trim() || tab !== 'chats') return true;
        return c.name?.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return (
        <aside className="w-[320px] bg-[#0a0a0c] border-r border-white/5 flex flex-col z-20 shrink-0">

            <div className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="relative group cursor-pointer" onClick={() => setShowCropModal(true)}>
                        {currentUser && <Avatar user={currentUser} size="md" className="rounded-full" />}
                        <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Plus size={16} className="text-white" />
                        </div>
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-slate-100 text-sm truncate">{currentUser?.nickname}</span>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => router.push('/settings')} className="p-2 text-slate-400 hover:text-slate-200 hover:bg-white/5 rounded-full transition-colors cursor-pointer"><Settings size={18} /></button>
                </div>
            </div>

            <div className="px-4 py-2">
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="Пошук..."
                        className="w-full pl-9 pr-8 py-2 bg-white/5 text-slate-200 placeholder-slate-500 rounded-xl text-sm outline-none focus:bg-white/10 transition-all"
                    />
                    {searchQuery && (
                        <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"><X size={14} /></button>
                    )}
                </div>
            </div>

            <div className="flex px-4 pt-2 pb-3 gap-2 border-b border-white/5">
                {(['chats', 'friends'] as SidebarTab[]).map((tabKey) => (
                    <button key={tabKey} onClick={() => setTab(tabKey)}
                            className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors cursor-pointer
                                ${tab === tabKey ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
                    >
                        {tabKey === 'chats' ? 'Чати' : 'Контакти'}
                        {tabKey === 'friends' && pendingRequests.length > 0 && <span className="ml-1 bg-red-500 text-white text-xs px-1.5 rounded-full">{pendingRequests.length}</span>}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {tab === 'chats' && (
                    <>
                        <div className="flex gap-2 px-4 py-3">
                            <button onClick={openSaved} className="flex items-center justify-center p-2 rounded-xl bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors cursor-pointer" title="Збережені">
                                <Bookmark size={18} />
                            </button>
                            <button onClick={() => setShowNewGroup(true)} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-white/5 text-slate-300 text-sm font-medium hover:bg-white/10 transition-colors cursor-pointer">
                                Група
                            </button>
                            <button onClick={() => setShowNewChan(true)} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-white/5 text-slate-300 text-sm font-medium hover:bg-white/10 transition-colors cursor-pointer">
                                Канал
                            </button>
                        </div>

                        {filteredConvs.map((conv: Conversation) => {
                            const isSelected = conv.id === selectedConvId;
                            const isSaved    = isSavedMessages(conv, currentUser?.id);

                            return (
                                <div key={conv.id} onClick={() => onSelectConversation(conv)}
                                     className={`px-4 py-3 cursor-pointer transition-colors flex items-center gap-3 ${isSelected ? 'bg-violet-600/20' : 'hover:bg-white/5'}`}
                                >
                                    <div className="relative shrink-0">
                                        {isSaved ? (
                                            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-amber-500/20 text-amber-400"><Bookmark size={20} /></div>
                                        ) : conv.avatarUrl || conv.type === 'DIRECT' ? (
                                            <>
                                                <Avatar user={{ nickname: conv.name ?? '?', avatarUrl: conv.avatarUrl }} size="md" className="w-12 h-12" />
                                                {conv.type === 'DIRECT' && <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-[#0a0a0c] ${conv.isOnline ? 'bg-emerald-500' : 'bg-slate-500'}`} />}
                                            </>
                                        ) : (
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${conv.type === 'GROUP' ? 'bg-violet-500/20 text-violet-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                                                {conv.type === 'GROUP' ? <Users size={20} /> : <Hash size={20} />}
                                            </div>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                            <p className="font-semibold text-sm text-slate-200 truncate">{isSaved ? 'Збережені' : (conv.name ?? 'Чат')}</p>
                                            <span className="text-xs text-slate-500 shrink-0">{conv.lastMessage ? formatTime(conv.lastMessage.createdAt) : ''}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'text-slate-300 font-medium' : 'text-slate-500'}`}>
                                                {conv.lastMessage?.content || '...'}
                                            </p>
                                            {conv.unreadCount > 0 && <span className="bg-violet-500 text-white text-xs font-semibold rounded-full px-1.5 py-0.5 min-w-[20px] text-center shrink-0">{conv.unreadCount}</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}

                {tab === 'friends' && (
                    <div className="p-2 space-y-4">
                        {pendingRequests.length > 0 && (
                            <div>
                                <p className="px-2 text-xs font-semibold text-slate-500 mb-2">Запити в друзі</p>
                                {pendingRequests.map((req) => (
                                    <div key={req.id} className="flex items-center gap-3 p-2 rounded-xl bg-white/5 mb-1">
                                        <Avatar user={req.sender!} size="md" className="rounded-full w-10 h-10" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-slate-200 truncate">{req.sender?.nickname}</p>
                                        </div>
                                        <button onClick={() => onRespondFriendRequest(req.id, 'ACCEPTED')} className="p-2 rounded-full bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors cursor-pointer"><Check size={16} /></button>
                                        <button onClick={() => onRespondFriendRequest(req.id, 'DECLINED')} className="p-2 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors cursor-pointer"><X size={16} /></button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {searchQuery.trim().length >= 2 && (
                            <div>
                                <p className="px-2 text-xs font-semibold text-slate-500 mb-2">Глобальний пошук</p>
                                {isSearching ? (
                                    <div className="p-4 flex justify-center"><div className="animate-spin w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full" /></div>
                                ) : searchResults.length === 0 ? (
                                    <p className="px-2 text-sm text-slate-500">Нікого не знайдено</p>
                                ) : (
                                    searchResults.map((u) => (
                                        <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors mb-1 cursor-pointer">
                                            <Avatar user={u} size="md" className="rounded-full w-10 h-10" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-200 truncate">{u.nickname}</p>
                                                <p className="text-xs text-slate-500">{u.isOnline ? 'В мережі' : 'Офлайн'}</p>
                                            </div>
                                            {u.friendshipStatus === 'ACCEPTED' ? (
                                                <button onClick={() => openDirect(u.id)} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors cursor-pointer">Написати</button>
                                            ) : u.friendshipStatus === 'PENDING' && u.isRequester ? (
                                                <span className="text-xs text-slate-500 px-2">Відправлено</span>
                                            ) : u.friendshipStatus === 'PENDING' ? (
                                                <div className="flex gap-1">
                                                    <button onClick={() => onRespondFriendRequest(u.friendshipId!, 'ACCEPTED')} className="p-1.5 rounded-full bg-emerald-500/20 text-emerald-400 cursor-pointer"><Check size={14}/></button>
                                                </div>
                                            ) : (
                                                <button onClick={() => handleSendRequest(u.id)} disabled={sendingReq === u.id} className="p-2 rounded-full bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 disabled:opacity-50 transition-colors cursor-pointer"><UserPlus size={16} /></button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {friends.length > 0 && searchQuery.trim().length < 2 && (
                            <div className="pt-2">
                                <p className="px-2 text-xs font-semibold text-slate-500 mb-2">Ваші контакти</p>
                                {friends.map((f) => (
                                    <div key={f.friendshipId} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors mb-1 group cursor-pointer">
                                        <div className="relative shrink-0">
                                            <Avatar user={f.friend} size="md" className="rounded-full w-10 h-10" />
                                            <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0a0a0c] ${f.friend.isOnline ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-slate-200 truncate">{f.friend.nickname}</p>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openDirect(f.friend.id)} className="p-2 rounded-full text-slate-400 hover:text-violet-400 hover:bg-white/10 transition-colors cursor-pointer"><MessageSquare size={16} /></button>
                                            <button onClick={() => onRemoveFriend(f.friend.id)} className="p-2 rounded-full text-slate-400 hover:text-red-400 hover:bg-white/10 transition-colors cursor-pointer"><X size={16} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showCropModal && <AvatarCropModal onClose={() => setShowCropModal(false)} onSave={handleSaveAvatar} />}
            {showNewGroup && <CreateGroupModal friends={friends} currentUserId={currentUser?.id} onClose={() => setShowNewGroup(false)} onCreated={(conv) => { onAddConversation(conv); onSelectConversation(conv); socket?.emit('joinConversation', { conversationId: conv.id }); setShowNewGroup(false); }} />}
            {showNewChan && <CreateChannelModal onClose={() => setShowNewChan(false)} onCreated={(conv) => { onAddConversation(conv); onSelectConversation(conv); socket?.emit('joinConversation', { conversationId: conv.id }); setShowNewChan(false); }} />}
        </aside>
    );
}