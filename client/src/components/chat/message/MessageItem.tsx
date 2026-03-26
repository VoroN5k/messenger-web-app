'use client';

import React, { useState, useEffect, useCallback }    from 'react';
import { Reply, Forward, Pin, SmilePlus, Pencil, Trash2, Check, X, Calendar, Flame } from 'lucide-react';
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
import { parseMetadata }    from '@/src/lib/parseMetadata';
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
    firstUnreadId:    number | null;
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

function UnreadDivider() {
    return (
        <div className="flex items-center gap-4 my-6 select-none opacity-80">
            <div className="flex-1 h-px bg-white/10" />
            <div className="text-xs font-medium text-slate-400 bg-[#0a0714] px-2">Нові повідомлення</div>
            <div className="flex-1 h-px bg-white/10" />
        </div>
    );
}

function DestructCountdown({ destructAfterSeconds, createdAt, onExpired }: any) {
    const [remaining, setRemaining] = useState<number>(() => {
        const elapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
        return Math.max(0, destructAfterSeconds - elapsed);
    });

    useEffect(() => {
        if (remaining <= 0) { onExpired(); return; }
        const tid = setInterval(() => {
            setRemaining(r => { if (r <= 1) { clearInterval(tid); onExpired(); return 0; } return r - 1; });
        }, 1000);
        return () => clearInterval(tid);
    }, []);

    const fmt = (s: number) => s >= 3600 ? `${Math.floor(s/3600)}h` : s >= 60 ? `${Math.floor(s/60)}m` : `${s}s`;
    const urgency = remaining <= 10 ? 'text-red-400 animate-pulse' : remaining <= 60 ? 'text-orange-400' : 'opacity-70';

    return (
        <div className={`flex items-center gap-1 text-[10px] font-mono ${urgency}`}>
            <Flame size={10} /> {fmt(remaining)}
        </div>
    );
}

export function MessageItem(props: Readonly<MessageItemProps>) {
    const { msg, prevMsg, currentUserId, isGroup, isChannel, canPin, isSearchOpen, searchQuery, jumpTarget, firstUnreadId, hoveredKey, editingId, editingContent, confirmDelId, pickerKey, decryptFn, msgRefsMap, editInputRef, onHover, onSetReplyTo, onForwardMsg, onPinMessage, onPickerKey, onToggleReaction, onConfirmDelete, onStartEdit, onSubmitEdit, onCancelEdit, onEditContent, onDeleteMessage } = props;

    const isMe      = String(msg.senderId) === String(currentUserId);
    const isDeleted = !!msg.deletedAt;
    const isEdited  = !!msg.editedAt && !isDeleted;
    const isVoice   = !!msg.fileUrl && !!msg.fileType?.startsWith('audio/') && !!(msg.metadata || msg.fileName === 'Голосове повідомлення');
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
    const showSep   = !prevMsg || new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();
    const showSender= !isMe && (isGroup || isChannel);
    const showUnread= !!firstUnreadId && msg.id === firstUnreadId && !isMe;
    const { destructAfterSeconds } = parseMetadata(msg.metadata);
    const hasDestruct = !!destructAfterSeconds && !isDeleted;
    const isScheduled = !!msg.scheduledAt && new Date(msg.scheduledAt) > new Date();

    const msgUrls = (!isDeleted && msg.content && !isVoice && !msg.fileUrl) ? extractUrls(msg.content).slice(0, 1) : [];

    const handleDestructExpired = useCallback(() => { if (msg.id) onDeleteMessage(msg.id); }, [msg.id, onDeleteMessage]);

    return (
        <>
            {showSep && (
                <div className="flex justify-center my-4">
                    <span className="text-xs font-medium text-slate-500 bg-white/5 px-3 py-1 rounded-full">
                        {formatDateSep(msg.createdAt)}
                    </span>
                </div>
            )}

            {showUnread && <UnreadDivider />}

            <div
                ref={el => { if (msg.id) msgRefsMap.current[msg.id] = el; }}
                className={`flex flex-col mb-1.5 ${isMe ? 'items-end' : 'items-start'}`}
                onMouseEnter={() => onHover(msgKey)}
                onMouseLeave={() => onHover(null)}
            >
                {showSender && !isDeleted && (
                    <div className="flex items-center gap-2 mb-1 ml-2">
                        {msg.sender && <Avatar user={msg.sender} size="sm" className="w-5 h-5" />}
                        <span className="text-xs font-medium text-slate-400">
                            {msg.sender?.nickname ?? ''}
                        </span>
                    </div>
                )}

                <div className={`flex items-end gap-2 ${isMe ? 'flex-row' : 'flex-row-reverse'}`}>

                    {/* Action buttons */}
                    {!isDeleted && msg.id && !isEditing && (
                        <div className={`flex items-center gap-1 transition-opacity duration-150 ${showAct ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                            <button onClick={() => onSetReplyTo(msg)} className="p-1.5 rounded-full text-slate-500 hover:text-slate-300 hover:bg-white/10 cursor-pointer"><Reply size={14} /></button>
                            <button onClick={() => onForwardMsg(msg)} className="p-1.5 rounded-full text-slate-500 hover:text-slate-300 hover:bg-white/10 cursor-pointer"><Forward size={14} /></button>
                            {canPin && (isGroup || isChannel) && <button onClick={() => onPinMessage(msg.id!)} className="p-1.5 rounded-full text-slate-500 hover:text-amber-400 hover:bg-white/10 cursor-pointer"><Pin size={14} /></button>}

                            <div className="relative">
                                <button onClick={() => onPickerKey(isPickerOn ? null : msgKey)} className={`p-1.5 rounded-full cursor-pointer ${isPickerOn ? 'text-violet-400 bg-white/10' : 'text-slate-500 hover:text-violet-400 hover:bg-white/10'}`}><SmilePlus size={14} /></button>
                                {isPickerOn && <div className="absolute z-50 bottom-full mb-2"><EmojiPicker align={isMe ? 'right' : 'left'} onSelect={e => onToggleReaction(msg.id!, e)} onClose={() => onPickerKey(null)} /></div>}
                            </div>

                            {isMe && (
                                isConfirm ? (
                                    <div className="flex items-center gap-2 bg-[#151221] border border-red-500/30 rounded-lg px-2 py-1" onClick={e => e.stopPropagation()}>
                                        <span className="text-[10px] text-slate-400">Видалити?</span>
                                        <button onClick={e => { e.stopPropagation(); onDeleteMessage(msg.id!); onConfirmDelete(null); }} className="text-red-400 hover:text-red-300"><Check size={14}/></button>
                                        <button onClick={e => { e.stopPropagation(); onConfirmDelete(null); }} className="text-slate-500 hover:text-slate-300"><X size={14}/></button>
                                    </div>
                                ) : (
                                    <>
                                        {canEdit && <button onClick={() => onStartEdit(msg)} className="p-1.5 rounded-full text-slate-500 hover:text-slate-300 hover:bg-white/10 cursor-pointer"><Pencil size={14} /></button>}
                                        <button onClick={e => { e.stopPropagation(); onConfirmDelete(msg.id!); }} className="p-1.5 rounded-full text-slate-500 hover:text-red-400 hover:bg-white/10 cursor-pointer"><Trash2 size={14} /></button>
                                    </>
                                )
                            )}
                        </div>
                    )}

                    {/* Bubble */}
                    <div
                        className={`
                            ${isImage ? 'p-1.5' : isVoice ? 'px-3 py-2.5' : 'px-4 py-2.5'}
                            max-w-md break-words flex flex-col transition-all duration-300
                            ${isMe
                            ? 'bg-violet-600 text-white rounded-2xl rounded-br-sm'
                            : 'bg-[#1e2330] text-slate-200 rounded-2xl rounded-bl-sm'}
                            ${isDeleted  ? 'opacity-50 italic' : ''}
                            ${isEditing  ? 'ring-2 ring-violet-400' : ''}
                            ${isJump     ? 'ring-2 ring-amber-500' : ''}
                            ${isScheduled ? 'opacity-80 border border-dashed border-white/30' : ''}
                        `}
                        onDoubleClick={() => canEdit && !isEditing && onStartEdit(msg)}
                    >
                        {isDeleted ? (
                            <span className="text-sm text-slate-400">Повідомлення видалено</span>
                        ) : isEditing ? (
                            <div className="flex items-center gap-2 min-w-[200px]">
                                <input
                                    ref={editInputRef as any} value={editingContent} onChange={e => onEditContent(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSubmitEdit(msg.id!); }}}
                                    className="flex-1 bg-transparent text-white placeholder-white/50 outline-none text-sm min-w-0"
                                />
                                <div className="flex gap-1 shrink-0">
                                    <button onClick={() => onSubmitEdit(msg.id!)} className="p-1 rounded bg-white/20 hover:bg-white/30"><Check size={12}/></button>
                                    <button onClick={onCancelEdit} className="p-1 rounded bg-black/20 hover:bg-black/30"><X size={12}/></button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {msg.forwardedFrom && <ForwardBubble forward={msg.forwardedFrom} isMe={isMe} />}
                                {msg.replyTo       && <ReplyBubble   reply={msg.replyTo}          isMe={isMe} />}

                                {isVoice && <VoiceBubble fileUrl={msg.fileUrl!} metadata={msg.metadata} isMe={isMe} onDecrypt={decryptFn ? d => decryptFn(d, Number(msg.senderId)) : undefined} />}
                                {hasFile && <FileBubble msg={msg} isMe={isMe} onDecrypt={decryptFn ? d => decryptFn(d, Number(msg.senderId)) : undefined} />}

                                {msg.content && !isVoice && (
                                    <span className={`text-[15px] leading-relaxed ${hasFile ? (isImage ? 'px-2 pt-1' : 'mt-1.5') : ''}`}>
                                        {isSearchOpen && searchQuery.trim().length >= 2 ? <HighlightText text={msg.content} query={searchQuery} /> : msg.content}
                                    </span>
                                )}
                                {msgUrls.map(url => <LinkPreview key={url} url={url} isMe={isMe} />)}
                            </>
                        )}

                        {/* Metadata row */}
                        {!isEditing && (
                            <div className={`flex items-center gap-1.5 self-end mt-1 flex-wrap ${isImage ? 'px-2 pb-1' : ''}`}>
                                {hasDestruct && !isDeleted && <DestructCountdown destructAfterSeconds={destructAfterSeconds!} createdAt={msg.createdAt} onExpired={handleDestructExpired} />}
                                {isScheduled && msg.scheduledAt && <Calendar size={10} className="opacity-70" />}
                                {isEdited && <span className="text-[10px] opacity-70">ред.</span>}

                                <span className={`text-[10px] font-mono ${isMe ? 'text-violet-200/80' : 'text-slate-400'}`}>
                                    {formatTime(msg.createdAt)}
                                </span>
                                {isMe && !isDeleted && <MessageStatus msg={msg} />}
                                {isMe && !isDeleted && (isGroup || isChannel) && msg.readBy && msg.readBy.length > 0 && (
                                    <span className="text-[10px] text-violet-200/80 ml-0.5" title={msg.readBy.map(r => r.nickname).join(', ')}>👁 {msg.readBy.length}</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <ReactionsRow reactions={msg.reactions ?? []} currentUserId={currentUserId!} onToggle={e => msg.id && onToggleReaction(msg.id, e)} />
            </div>
        </>
    );
}