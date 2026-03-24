'use client';

import { Forward, FileText, Image as ImageIcon, Mic } from 'lucide-react';
import { Message } from '@/src/types/conversation.types';

// Reply bubble
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

// Forward bubble — now shows original author + content quote
export function ForwardBubble({
                                  forward, isMe,
                              }: Readonly<{
    forward: NonNullable<Message['forwardedFrom']>;
    isMe: boolean;
}>) {
    // Determine file icon for non-text forwards
    const isAudio = forward.fileType?.startsWith('audio/');
    const isImage = forward.fileType?.startsWith('image/');
    const isFile  = !!forward.fileType && !isAudio && !isImage;

    const fileLabel = isAudio ? '🎤 Голосове' : isImage ? '🖼 Фото' : isFile ? '📎 Файл' : null;

    return (
        <div className={`rounded-xl px-3 py-2 mb-2 border-l-[3px] cursor-default
            ${isMe
            ? 'bg-white/10 border-white/40 text-white'
            : 'bg-slate-50 dark:bg-slate-700/60 border-indigo-400/70 dark:border-indigo-500/60 text-slate-700 dark:text-slate-200'}`}>

            {/* Header: "Переслано від X" */}
            <div className="flex items-center gap-1 mb-1">
                <Forward size={11} className={`shrink-0 ${isMe ? 'text-indigo-200' : 'text-indigo-400 dark:text-indigo-400'}`} />
                <p className={`text-[11px] font-semibold truncate ${isMe ? 'text-indigo-200' : 'text-indigo-500 dark:text-indigo-400'}`}>
                    {forward.sender.nickname}
                </p>
            </div>

            {/* Original content preview */}
            {(forward.content || fileLabel) && (
                <p className={`text-xs leading-snug line-clamp-3 ${isMe ? 'text-white/80' : 'text-slate-600 dark:text-slate-300'}`}>
                    {fileLabel ?? forward.content}
                </p>
            )}
        </div>
    );
}