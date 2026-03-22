'use client';

import { Users, Hash, Search, LayoutGrid, Phone, Video } from 'lucide-react';
import { Avatar }       from '@/src/components/chat/Avatar';
import { Conversation } from '@/src/types/conversation.types';
import { User }         from '@/src/types/auth.types';
import { formatLastSeen } from '@/src/lib/chatFormatters';

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
    const isSelfConv = conversation.type === 'DIRECT' &&
        conversation.members.every(m => m.userId === currentUserId);

    const otherMember = conversation.type === 'DIRECT'
        ? conversation.members.find(m => m.userId !== currentUserId)
        : null;

    const lastSeenText = otherMember && !conversation.isOnline
        ? formatLastSeen(otherMember.user?.lastSeen)
        : null;

    const other = conversation.type === 'DIRECT'
        ? conversation.members.find(m => m.userId !== currentUserId)
        : null;

    return (
        <header className="px-5 py-3.5 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between shadow-sm z-10">
            <div className="flex items-center gap-3 min-w-0">
                {conversation.avatarUrl || conversation.type === 'DIRECT' ? (
                    <div className="relative shrink-0">
                        <Avatar
                            user={{ nickname: conversation.name ?? '?', avatarUrl: conversation.avatarUrl }}
                            size="md"
                        />
                        {conversation.type === 'DIRECT' && (
                            <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-800
                                ${conversation.isOnline ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'}`}
                            />
                        )}
                    </div>
                ) : (
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0
                        ${isGroup ? 'bg-violet-100 dark:bg-violet-900/40' : 'bg-indigo-100 dark:bg-indigo-900/40'}`}>
                        {isGroup
                            ? <Users size={18} className="text-violet-500" />
                            : <Hash  size={18} className="text-indigo-500" />}
                    </div>
                )}

                <div className="min-w-0">
                    <h2 className="font-semibold text-gray-800 dark:text-slate-100 text-base leading-tight truncate">
                        {conversation.name ?? 'Чат'}
                    </h2>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                        {conversation.type === 'DIRECT'
                            ? isSelfConv
                                ? 'Збережені повідомлення'
                                : (conversation.isOnline ? 'В мережі' : lastSeenText ?? 'Офлайн')
                            : `${conversation.members.length} учасників`}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-1">
                <button
                    onClick={onToggleSearch}
                    className={`p-2 rounded-full transition-all cursor-pointer
                        ${isSearchOpen ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/40' : 'text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'}`}
                    title="Пошук"
                >
                    <Search size={17} />
                </button>

                <button
                    onClick={onToggleMedia}
                    className={`p-2 rounded-full transition-all cursor-pointer
                        ${showMedia ? 'text-violet-600 bg-violet-50 dark:bg-violet-900/40' : 'text-slate-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30'}`}
                    title="Вкладення"
                >
                    <LayoutGrid size={17} />
                </button>

                {conversation.type === 'DIRECT' && onStartCall && other && (
                    <>
                        <button
                            onClick={() => onStartCall(conversation.id, other.userId, 'audio')}
                            className="p-2 rounded-full text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 cursor-pointer transition-all"
                            title="Аудіо дзвінок"
                        >
                            <Phone size={17} />
                        </button>
                        <button
                            onClick={() => onStartCall(conversation.id, other.userId, 'video')}
                            className="p-2 rounded-full text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer transition-all"
                            title="Відео дзвінок"
                        >
                            <Video size={17} />
                        </button>
                    </>
                )}
            </div>
        </header>
    );
}
