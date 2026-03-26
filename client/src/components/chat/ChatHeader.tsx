'use client';

import { Users, Hash, Search, LayoutGrid, Phone, Video } from 'lucide-react';
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
    const isSelfConv = conversation.type === 'DIRECT' && conversation.members.every(m => m.userId === currentUserId);
    const otherMember = conversation.type === 'DIRECT' ? conversation.members.find(m => m.userId !== currentUserId) : null;

    return (
        <header className="px-5 py-3 bg-[#05030f] border-b border-white/5 flex items-center justify-between z-10 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
                {conversation.avatarUrl || conversation.type === 'DIRECT' ? (
                    <div className="relative shrink-0">
                        <Avatar user={{ nickname: conversation.name ?? '?', avatarUrl: conversation.avatarUrl }} size="md" />
                        {conversation.type === 'DIRECT' && (
                            <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#05030f]
                                ${conversation.isOnline ? 'bg-emerald-500' : 'bg-slate-600'}`}
                            />
                        )}
                    </div>
                ) : (
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0
                        ${isGroup ? 'bg-violet-500/20 text-violet-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                        {isGroup ? <Users size={18} /> : <Hash size={18} />}
                    </div>
                )}

                <div className="min-w-0 flex flex-col">
                    <h2 className="font-semibold text-slate-100 text-base truncate">
                        {isSelfConv ? 'Збережені повідомлення' : (conversation.name ?? 'Чат')}
                    </h2>
                    <p className="text-xs text-slate-500 truncate">
                        {conversation.type === 'DIRECT'
                            ? isSelfConv ? 'Приватне сховище' : (conversation.isOnline ? 'В мережі' : 'Офлайн')
                            : `${conversation.members.length} учасників`}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button onClick={onToggleSearch} className={`p-2 rounded-full transition-colors ${isSearchOpen ? 'bg-white/10 text-slate-200' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><Search size={18} /></button>
                <button onClick={onToggleMedia} className={`p-2 rounded-full transition-colors ${showMedia ? 'bg-white/10 text-slate-200' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><LayoutGrid size={18} /></button>
                {conversation.type === 'DIRECT' && onStartCall && otherMember && (
                    <>
                        <div className="w-px h-5 bg-white/10 mx-1" />
                        <button onClick={() => onStartCall(conversation.id, otherMember.userId, 'audio')} className="p-2 rounded-full text-slate-400 hover:bg-white/5 hover:text-emerald-400 transition-colors"><Phone size={18} /></button>
                        <button onClick={() => onStartCall(conversation.id, otherMember.userId, 'video')} className="p-2 rounded-full text-slate-400 hover:bg-white/5 hover:text-emerald-400 transition-colors"><Video size={18} /></button>
                    </>
                )}
            </div>
        </header>
    );
}