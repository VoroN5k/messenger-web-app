'use client';

import { Forward } from 'lucide-react';
import { Message } from '@/src/types/conversation.types';

export function ReplyBubble({
                                reply, isMe,
                            }: Readonly<{
    reply: NonNullable<Message['replyTo']>;
    isMe: boolean;
}>) {
    return (
        <div className={`text-xs rounded-lg px-2.5 py-1.5 mb-1.5 border-l-2 cursor-default
            ${isMe
            ? 'bg-white/10 border-white/50 text-indigo-100'
            : 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-500 text-slate-500 dark:text-slate-400'}`}>
            <p className="font-semibold mb-0.5">{reply.sender.nickname}</p>
            <p className="truncate opacity-80">
                {reply.deletedAt ? 'Повідомлення видалено' : reply.content || '📎 Файл'}
            </p>
        </div>
    );
}

export function ForwardBubble({
                                  forward, isMe,
                              }: Readonly<{
    forward: NonNullable<Message['forwardedFrom']>;
    isMe: boolean;
}>) {
    return (
        <div className={`flex items-center gap-1.5 mb-1.5 ${isMe ? 'text-white/60' : 'text-slate-400 dark:text-slate-400'}`}>
            <Forward
                size={11}
                className="shrink-0"
                style={{ color: isMe ? 'rgba(196,181,253,0.7)' : 'rgba(99,179,237,0.8)' }}
            />
            <span
                className="text-[11px] font-medium truncate"
                style={{ color: isMe ? 'rgba(196,181,253,0.8)' : 'rgba(99,179,237,0.9)' }}
            >
                Переслано від {forward.sender.nickname}
            </span>
        </div>
    );
}