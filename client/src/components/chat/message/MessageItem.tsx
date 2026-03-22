'use client';

import React                                     from 'react';
import {
    Reply, Forward, Pin, SmilePlus,
    Pencil, Trash2, Check, X,
} from 'lucide-react';
import { Avatar }           from '@/src/components/chat/Avatar';
import { EmojiPicker }      from '@/src/components/chat/EmojiPicker';
import { VoiceBubble }      from '@/src/components/chat/VoiceBubble';
import { LinkPreview, extractUrls } from '@/src/components/chat/LinkPreview';
import { FileBubble }       from './FileBubble';
import { ReplyBubble, ForwardBubble } from './ReplyForwardBubble';
import { ReactionsRow }     from './ReactionsRow';
import { MessageStatus }    from './MessageStatus';
import { HighlightText }    from './HighlightText';
import { isImageType }      from '@/src/lib/uploadFile';
import { formatTime, formatDateSep, EDIT_WINDOW_MS } from '@/src/lib/chatFormatters';
import { Message }          from '@/src/types/conversation.types';

export interface MessageItemProps {
    msg:              Message;
    prevMsg:          Message | null;
    currentUserId:    number | string | undefined;
    isGroup:          boolean;
    isChannel:        boolean;
    canPin:           boolean;
    isSearchOpen:     boolean;
    searchQuery:      string;
    jumpTarget:       number | null;
    hoveredKey:       string | null;
    editingId:        number | null;
    editingContent:   string;
    confirmDelId:     number | null;
    pickerKey:        string | null;
    decryptFn?:       (data: ArrayBuffer, senderId: number) => Promise<ArrayBuffer>;
    msgRefsMap:       React.MutableRefObject<Record<number, HTMLDivElement | null>>;
    editInputRef:     React.RefObject<HTMLInputElement | null>;
    onHover:          (key: string | null) => void;
    onSetReplyTo:     (msg: Message) => void;
    onForwardMsg:     (msg: Message) => void;
    onPinMessage:     (msgId: number) => void;
    onPickerKey:      (key: string | null) => void;
    onToggleReaction: (msgId: number, emoji: string) => void;
    onConfirmDelete:  (id: number | null) => void;
    onStartEdit:      (msg: Message) => void;
    onSubmitEdit:     (id: number) => void;
    onCancelEdit:     () => void;
    onEditContent:    (v: string) => void;
    onDeleteMessage:  (msgId: number) => void;
}

export function MessageItem({
                                msg, prevMsg, currentUserId,
                                isGroup, isChannel, canPin,
                                isSearchOpen, searchQuery, jumpTarget,
                                hoveredKey, editingId, editingContent, confirmDelId, pickerKey,
                                decryptFn, msgRefsMap, editInputRef,
                                onHover, onSetReplyTo, onForwardMsg, onPinMessage, onPickerKey,
                                onToggleReaction, onConfirmDelete, onStartEdit, onSubmitEdit,
                                onCancelEdit, onEditContent, onDeleteMessage,
                            }: Readonly<MessageItemProps>) {
    const isMe      = String(msg.senderId) === String(currentUserId);
    const isDeleted = !!msg.deletedAt;
    const isEdited  = !!msg.editedAt && !isDeleted;
    const isVoice   = !!msg.fileUrl && !!msg.fileType?.startsWith('audio/') &&
        !!(msg.metadata || msg.fileName === 'Голосове повідомлення');
    const hasFile   = !!msg.fileUrl && !isDeleted && !isVoice;
    const isImage   = hasFile && isImageType(msg.fileType, msg.fileName);
    const msgKey    = msg.id ? `msg-${msg.id}` : `tmp-${msg.createdAt}`;
    const isHovered = hoveredKey === msgKey;
    const isConfirm = msg.id != null && confirmDelId === msg.id;
    const isEditing = msg.id != null && editingId    === msg.id;
    const isPickerOn= pickerKey === msgKey;
    const isJump    = msg.id != null && jumpTarget === msg.id;
    const age       = Date.now() - new Date(msg.createdAt).getTime();
    const canEdit   = isMe && !isDeleted && !!msg.id && !msg.fileUrl && age <= EDIT_WINDOW_MS;
    const showAct   = isHovered || isConfirm || isPickerOn;
    const showSep   = !prevMsg ||
        new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();
    const showSender= !isMe && (isGroup || isChannel);

    const msgUrls = (!isDeleted && msg.content && !isVoice && !msg.fileUrl)
        ? extractUrls(msg.content).slice(0, 1)
        : [];

    return (
        <>
            {showSep && (
                <div className="flex justify-center my-4">
                    <span className="bg-violet-100/50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 font-medium text-xs px-4 py-1.5 rounded-full">
                        {formatDateSep(msg.createdAt)}
                    </span>
                </div>
            )}

            <div
                ref={(el) => { if (msg.id) msgRefsMap.current[msg.id] = el; }}
                className={`flex flex-col mb-1 ${isMe ? 'items-end' : 'items-start'}`}
                onMouseEnter={() => onHover(msgKey)}
                onMouseLeave={() => onHover(null)}
            >
                {/* Group sender label */}
                {showSender && !isDeleted && (
                    <div className="flex items-center gap-2 mb-1 ml-1">
                        {msg.sender && <Avatar user={msg.sender} size="sm" />}
                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                            {msg.sender?.nickname ?? ''}
                        </span>
                    </div>
                )}

                <div className={`flex items-end gap-2 ${isMe ? 'flex-row' : 'flex-row-reverse'}`}>

                    {/* Action buttons */}
                    {!isDeleted && msg.id && !isEditing && (
                        <div className={`flex items-center gap-1 transition-opacity duration-150 ${showAct ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                            <button onClick={() => onSetReplyTo(msg)}
                                    className="p-1.5 rounded-full text-slate-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30 cursor-pointer transition-all">
                                <Reply size={13} />
                            </button>
                            <button onClick={() => onForwardMsg(msg)}
                                    className="p-1.5 rounded-full text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer transition-all">
                                <Forward size={13} />
                            </button>
                            {canPin && (isGroup || isChannel) && (
                                <button onClick={() => onPinMessage(msg.id!)}
                                        className="p-1.5 rounded-full text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 cursor-pointer transition-all"
                                        title="Закріпити">
                                    <Pin size={13} />
                                </button>
                            )}
                            {/* Emoji picker */}
                            <div className="relative">
                                <button
                                    onClick={() => onPickerKey(isPickerOn ? null : msgKey)}
                                    className={`p-1.5 rounded-full transition-all cursor-pointer
                                        ${isPickerOn ? 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/40' : 'text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'}`}>
                                    <SmilePlus size={13} />
                                </button>
                                {isPickerOn && (
                                    <EmojiPicker
                                        align={isMe ? 'right' : 'left'}
                                        onSelect={(e) => { onToggleReaction(msg.id!, e); }}
                                        onClose={() => onPickerKey(null)}
                                    />
                                )}
                            </div>
                            {/* My-message actions */}
                            {isMe && (
                                <>
                                    {isConfirm ? (
                                        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-red-100 dark:border-red-900 rounded-xl px-2.5 py-1.5 shadow-md"
                                             onClick={(e) => e.stopPropagation()}>
                                            <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">Видалити?</span>
                                            <button onClick={(e) => { e.stopPropagation(); onDeleteMessage(msg.id!); onConfirmDelete(null); }}
                                                    className="text-xs font-semibold text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 cursor-pointer">Так</button>
                                            <button onClick={(e) => { e.stopPropagation(); onConfirmDelete(null); }}
                                                    className="text-xs font-semibold text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer">Ні</button>
                                        </div>
                                    ) : (
                                        <>
                                            {canEdit && (
                                                <button onClick={() => onStartEdit(msg)}
                                                        className="p-1.5 rounded-full text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer transition-all">
                                                    <Pencil size={13} />
                                                </button>
                                            )}
                                            <button onClick={(e) => { e.stopPropagation(); onConfirmDelete(msg.id!); }}
                                                    className="p-1.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 cursor-pointer transition-all">
                                                <Trash2 size={13} />
                                            </button>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Bubble */}
                    <div
                        className={`
                            ${isImage ? 'p-1.5' : isVoice ? 'px-3 py-2.5' : 'px-4 py-2.5'}
                            max-w-md break-words flex flex-col shadow-sm transition-all duration-300
                            ${isMe
                            ? 'bg-indigo-500 text-white rounded-2xl rounded-br-sm'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl rounded-bl-sm'}
                            ${isDeleted  ? 'opacity-60' : ''}
                            ${isEditing  ? 'ring-2 ring-indigo-300 ring-offset-1' : ''}
                            ${isJump     ? 'ring-2 ring-yellow-400 ring-offset-2 scale-[1.02]' : ''}
                        `}
                        onDoubleClick={() => canEdit && !isEditing && onStartEdit(msg)}
                    >
                        {isDeleted ? (
                            <span className={`text-sm italic ${isMe ? 'text-indigo-200' : 'text-slate-400 dark:text-slate-500'}`}>
                                Повідомлення видалено
                            </span>
                        ) : isEditing ? (
                            <div className="flex items-center gap-2 min-w-[200px]">
                                <input
                                    ref={editInputRef as any}
                                    value={editingContent}
                                    onChange={(e) => onEditContent(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSubmitEdit(msg.id!); }}}
                                    maxLength={4000}
                                    className="flex-1 bg-transparent text-white placeholder-indigo-300 outline-none text-sm leading-relaxed min-w-0"
                                />
                                <div className="flex gap-1 shrink-0">
                                    <button onClick={() => onSubmitEdit(msg.id!)} className="p-1 rounded-full bg-white/20 hover:bg-white/30 text-white cursor-pointer"><Check size={12}/></button>
                                    <button onClick={onCancelEdit}               className="p-1 rounded-full bg-white/20 hover:bg-white/30 text-white cursor-pointer"><X    size={12}/></button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {msg.forwardedFrom && <ForwardBubble forward={msg.forwardedFrom} isMe={isMe} />}
                                {msg.replyTo       && <ReplyBubble   reply={msg.replyTo}          isMe={isMe} />}

                                {isVoice && (
                                    <VoiceBubble
                                        fileUrl={msg.fileUrl!}
                                        metadata={msg.metadata}
                                        isMe={isMe}
                                        onDecrypt={decryptFn ? (d) => decryptFn(d, Number(msg.senderId)) : undefined}
                                    />
                                )}
                                {hasFile && (
                                    <FileBubble
                                        msg={msg}
                                        isMe={isMe}
                                        onDecrypt={decryptFn ? (d) => decryptFn(d, Number(msg.senderId)) : undefined}
                                    />
                                )}
                                {msg.content && !isVoice && (
                                    <span className={`leading-relaxed ${hasFile ? (isImage ? 'px-2 pt-1' : 'mt-1.5') : ''}`}>
                                        {isSearchOpen && searchQuery.trim().length >= 2
                                            ? <HighlightText text={msg.content} query={searchQuery} />
                                            : msg.content}
                                    </span>
                                )}
                                {msgUrls.map(url => (
                                    <LinkPreview key={url} url={url} isMe={isMe} />
                                ))}
                            </>
                        )}

                        {/* Timestamp + status */}
                        {!isEditing && (
                            <div className={`flex items-center gap-1 self-end mt-1 ${isImage ? 'px-2 pb-1' : ''}`}>
                                {isEdited && (
                                    <span className={`text-[10px] italic select-none ${isMe ? 'text-indigo-200' : 'text-slate-400 dark:text-slate-500'}`}>ред.</span>
                                )}
                                <span className={`text-[10px] font-medium select-none ${isMe ? 'text-indigo-200' : 'text-slate-400 dark:text-slate-500'}`}>
                                    {formatTime(msg.createdAt)}
                                </span>
                                {isMe && !isDeleted && <MessageStatus msg={msg} />}
                                {isMe && !isDeleted && (isGroup || isChannel) && msg.readBy && msg.readBy.length > 0 && (
                                    <span
                                        className="text-[10px] text-indigo-200 cursor-default ml-0.5"
                                        title={msg.readBy.map(r => r.nickname).join(', ')}>
                                        👁 {msg.readBy.length}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <ReactionsRow
                    reactions={msg.reactions ?? []}
                    currentUserId={currentUserId!}
                    onToggle={(e) => msg.id && onToggleReaction(msg.id, e)}
                />
            </div>
        </>
    );
}
