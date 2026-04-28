'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Reply, Forward, Pin, SmilePlus, Pencil, Trash2, Check, X, Calendar, Flame, AlertTriangle,
} from 'lucide-react';
import { Avatar }              from '@/src/components/chat/Avatar';
import { EmojiPicker }         from '@/src/components/chat/EmojiPicker';
import { VoiceBubble }         from '@/src/components/chat/VoiceBubble';
import { LinkPreview, extractUrls } from '@/src/components/chat/LinkPreview';
import { FileBubble }          from './FileBubble';
import { ReplyBubble, ForwardBubble } from './ReplyForwardBubble';
import { ReactionsRow }        from './ReactionsRow';
import { MessageStatus }       from './MessageStatus';
import { HighlightText }       from './HighlightText';
import { isImageType }         from '@/src/lib/uploadFile';
import { parseMetadata }       from '@/src/lib/parseMetadata';
import { formatTime, formatDateSep, EDIT_WINDOW_MS } from '@/src/lib/chatFormatters';
import { Message }             from '@/src/types/conversation.types';

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

// ── Date separator ─────────────────────────────────────────────────────────────
function DateSeparator({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3 my-5 px-6 select-none">
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            <span
                className="text-[11px] px-3 py-1 rounded-full"
                style={{
                    color: 'var(--text-3)',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border)',
                }}
            >
        {label}
      </span>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        </div>
    );
}

// ── Unread divider ─────────────────────────────────────────────────────────────
function UnreadDivider() {
    return (
        <div className="flex items-center gap-3 my-4 px-6 select-none">
            <div className="flex-1 h-px" style={{ background: 'rgba(124,77,255,0.2)' }} />
            <span
                className="text-[10px] font-medium px-2.5 py-0.5 rounded-full"
                style={{
                    color: 'rgba(157,119,255,0.8)',
                    background: 'rgba(124,77,255,0.1)',
                    border: '1px solid rgba(124,77,255,0.18)',
                }}
            >
        New messages
      </span>
            <div className="flex-1 h-px" style={{ background: 'rgba(124,77,255,0.2)' }} />
        </div>
    );
}

// ── Self-destruct timer ────────────────────────────────────────────────────────
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

    const fmt = (s: number) => s >= 3600 ? `${Math.floor(s / 3600)}h` : s >= 60 ? `${Math.floor(s / 60)}m` : `${s}s`;
    const isUrgent = remaining <= 10;
    const isMid    = remaining <= 60;

    return (
        <div
            className="flex items-center gap-0.5 text-[10px] font-mono"
            style={{ color: isUrgent ? 'var(--red)' : isMid ? 'var(--amber)' : 'var(--text-3)' }}
        >
            <Flame size={9} />
            <span>{fmt(remaining)}</span>
        </div>
    );
}

// ── Action button ──────────────────────────────────────────────────────────────
function ActionBtn({
                       onClick, children, danger,
                   }: {
    onClick: (e: React.MouseEvent) => void;
    children: React.ReactNode;
    danger?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-100"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = danger
                    ? 'rgba(255,77,106,0.1)'
                    : 'rgba(255,255,255,0.06)';
                (e.currentTarget as HTMLElement).style.color = danger ? 'var(--red)' : 'var(--text-1)';
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-3)';
            }}
        >
            {children}
        </button>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function MessageItem(props: Readonly<MessageItemProps>) {
    const {
        msg, prevMsg, currentUserId, isGroup, isChannel, canPin,
        isSearchOpen, searchQuery, jumpTarget, firstUnreadId,
        hoveredKey, editingId, editingContent, confirmDelId, pickerKey,
        decryptFn, msgRefsMap, editInputRef,
        onHover, onSetReplyTo, onForwardMsg, onPinMessage, onPickerKey,
        onToggleReaction, onConfirmDelete, onStartEdit, onSubmitEdit,
        onCancelEdit, onEditContent, onDeleteMessage,
    } = props;

    const isMe       = String(msg.senderId) === String(currentUserId);
    const isDeleted  = !!msg.deletedAt;
    const isEdited   = !!msg.editedAt && !isDeleted;
    const isVoice    = !!msg.fileUrl && !!msg.fileType?.startsWith('audio/') && !!(msg.metadata || msg.fileName === 'Голосове повідомлення');
    const hasFile    = !!msg.fileUrl && !isDeleted && !isVoice;
    const isImage    = hasFile && isImageType(msg.fileType, msg.fileName);
    const msgKey     = msg.id ? `msg-${msg.id}` : `tmp-${msg.createdAt}`;
    const isHovered  = hoveredKey === msgKey;
    const isConfirm  = msg.id != null && confirmDelId === msg.id;
    const isEditing  = msg.id != null && editingId === msg.id;
    const isPickerOn = pickerKey === msgKey;
    const isJump     = msg.id != null && jumpTarget === msg.id;
    const age        = Date.now() - new Date(msg.createdAt).getTime();
    const canEdit    = isMe && !isDeleted && !!msg.id && !msg.fileUrl && age <= EDIT_WINDOW_MS;
    const showAct    = isHovered || isConfirm || isPickerOn;
    const showSep    = !prevMsg || new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();
    const showSender = !isMe && (isGroup || isChannel);
    const showUnread = !!firstUnreadId && msg.id === firstUnreadId && !isMe;
    const isScheduled = !!msg.scheduledAt && new Date(msg.scheduledAt) > new Date();
    const { destructAfterSeconds } = parseMetadata(msg.metadata);
    const hasDestruct = !!destructAfterSeconds && !isDeleted;
    const msgUrls    = (!isDeleted && msg.content && !isVoice && !msg.fileUrl) ? extractUrls(msg.content).slice(0, 1) : [];

    const handleDestructExpired = useCallback(() => {
        if (msg.id) onDeleteMessage(msg.id);
    }, [msg.id, onDeleteMessage]);

    return (
        <>
            {showSep && <DateSeparator label={formatDateSep(msg.createdAt)} />}
            {showUnread && <UnreadDivider />}

            <div
                ref={el => { if (msg.id) msgRefsMap.current[msg.id] = el; }}
                className={`flex flex-col mb-1 px-4 msg-appear ${isMe ? 'items-end' : 'items-start'}`}
                onMouseEnter={() => onHover(msgKey)}
                onMouseLeave={() => onHover(null)}
            >
                {/* Sender name (group/channel, not mine) */}
                {showSender && !isDeleted && (
                    <div className="flex items-center gap-1.5 mb-1 ml-1">
                        {msg.sender && <Avatar user={msg.sender} size="sm" className="w-4 h-4" />}
                        <span
                            className="text-[11px] font-medium"
                            style={{ color: 'var(--accent-bright)' }}
                        >
              {msg.sender?.nickname ?? ''}
            </span>
                    </div>
                )}

                <div className={`flex items-end gap-2 max-w-[75%] ${isMe ? 'flex-row' : 'flex-row-reverse'}`}>

                    {/* ── Action toolbar ── */}
                    {!isDeleted && msg.id && !isEditing && (
                        <div
                            className="flex items-center gap-0.5 transition-all duration-150 shrink-0"
                            style={{
                                opacity: showAct ? 1 : 0,
                                pointerEvents: showAct ? 'auto' : 'none',
                                transform: showAct ? 'translateY(0)' : 'translateY(4px)',
                            }}
                        >
                            <div
                                className="flex items-center gap-0.5 rounded-xl px-1 py-1"
                                style={{
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border)',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                                }}
                            >
                                <ActionBtn onClick={e => { e.stopPropagation(); onSetReplyTo(msg); }}>
                                    <Reply size={13} />
                                </ActionBtn>
                                <ActionBtn onClick={e => { e.stopPropagation(); onForwardMsg(msg); }}>
                                    <Forward size={13} />
                                </ActionBtn>
                                {canPin && (isGroup || isChannel) && (
                                    <ActionBtn onClick={e => { e.stopPropagation(); onPinMessage(msg.id!); }}>
                                        <Pin size={13} />
                                    </ActionBtn>
                                )}

                                {/* Emoji picker */}
                                <div className="relative">
                                    <ActionBtn
                                        onClick={e => { e.stopPropagation(); onPickerKey(isPickerOn ? null : msgKey); }}
                                    >
                                        <SmilePlus size={13} />
                                    </ActionBtn>
                                    {isPickerOn && (
                                        <div className={`absolute z-50 bottom-full mb-2 ${isMe ? 'right-0' : 'left-0'}`}>
                                            <EmojiPicker
                                                align={isMe ? 'right' : 'left'}
                                                onSelect={em => onToggleReaction(msg.id!, em)}
                                                onClose={() => onPickerKey(null)}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Edit / delete (only mine) */}
                                {isMe && (
                                    isConfirm ? (
                                        <div
                                            className="flex items-center gap-1.5 px-2"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>Delete?</span>
                                            <button
                                                onClick={e => { e.stopPropagation(); onDeleteMessage(msg.id!); onConfirmDelete(null); }}
                                                className="cursor-pointer transition-colors duration-100"
                                                style={{ color: 'var(--red)' }}
                                            >
                                                <Check size={13} />
                                            </button>
                                            <button
                                                onClick={e => { e.stopPropagation(); onConfirmDelete(null); }}
                                                className="cursor-pointer transition-colors duration-100"
                                                style={{ color: 'var(--text-3)' }}
                                            >
                                                <X size={13} />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            {canEdit && (
                                                <ActionBtn onClick={() => onStartEdit(msg)}>
                                                    <Pencil size={13} />
                                                </ActionBtn>
                                            )}
                                            <ActionBtn
                                                onClick={e => { e.stopPropagation(); onConfirmDelete(msg.id!); }}
                                                danger
                                            >
                                                <Trash2 size={13} />
                                            </ActionBtn>
                                        </>
                                    )
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Bubble ── */}
                    <div
                        className="flex flex-col break-words transition-all duration-200"
                        style={{
                            maxWidth: '100%',
                            padding: isImage ? '4px' : isVoice ? '10px 12px' : '9px 14px',
                            borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                            background: isDeleted
                                ? 'rgba(255,255,255,0.02)'
                                : isMe
                                    ? 'var(--msg-mine-bg)'
                                    : 'var(--msg-them-bg)',
                            border: isDeleted
                                ? '1px solid var(--border)'
                                : isMe
                                    ? '1px solid var(--msg-mine-border)'
                                    : '1px solid var(--msg-them-border)',
                            boxShadow: isMe && !isDeleted
                                ? '0 2px 12px rgba(100,60,255,0.12)'
                                : '0 2px 8px rgba(0,0,0,0.15)',
                            outline: isJump ? '2px solid rgba(251,191,36,0.5)' : 'none',
                            outlineOffset: '2px',
                            opacity: isDeleted ? 0.5 : 1,
                            fontStyle: isDeleted ? 'italic' : 'normal',
                        }}
                        onDoubleClick={() => canEdit && !isEditing && onStartEdit(msg)}
                    >
                        {isDeleted ? (
                            <span className="text-[13px]" style={{ color: 'var(--text-3)' }}>
                Message deleted
              </span>
                        ) : isEditing ? (
                            <div className="flex items-center gap-2" style={{ minWidth: '180px' }}>
                                <input
                                    ref={editInputRef as any}
                                    value={editingContent}
                                    onChange={e => onEditContent(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSubmitEdit(msg.id!); } }}
                                    className="flex-1 bg-transparent outline-none text-[14px] min-w-0"
                                    style={{ color: 'var(--text-1)', caretColor: 'var(--accent)' }}
                                />
                                <div className="flex gap-1 shrink-0">
                                    <button
                                        onClick={() => onSubmitEdit(msg.id!)}
                                        className="w-6 h-6 rounded-md flex items-center justify-center cursor-pointer"
                                        style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}
                                    >
                                        <Check size={11} style={{ color: 'var(--accent-bright)' }} />
                                    </button>
                                    <button
                                        onClick={onCancelEdit}
                                        className="w-6 h-6 rounded-md flex items-center justify-center cursor-pointer"
                                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}
                                    >
                                        <X size={11} style={{ color: 'var(--text-3)' }} />
                                    </button>
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
                                        onDecrypt={decryptFn ? d => decryptFn(d, Number(msg.senderId)) : undefined}
                                    />
                                )}
                                {hasFile && (
                                    <FileBubble
                                        msg={msg}
                                        isMe={isMe}
                                        onDecrypt={decryptFn ? d => decryptFn(d, Number(msg.senderId)) : undefined}
                                    />
                                )}
                                {msg.content && !isVoice && (
                                    <span
                                        className="text-[14px] leading-relaxed"
                                        style={{
                                            color: isMe ? 'rgba(238,238,255,0.92)' : 'var(--text-1)',
                                            marginTop: hasFile && !isImage ? '6px' : isImage ? '4px' : 0,
                                        }}
                                    >
                    {isSearchOpen && searchQuery.trim().length >= 2
                        ? <HighlightText text={msg.content} query={searchQuery} />
                        : msg.content}
                  </span>
                                )}
                                {msgUrls.map(url => <LinkPreview key={url} url={url} isMe={isMe} />)}
                            </>
                        )}

                        {/* ── Meta row ── */}
                        {!isEditing && (
                            <div
                                className="flex items-center gap-1.5 self-end flex-wrap mt-1"
                                style={{ marginRight: isImage ? '-2px' : 0 }}
                            >
                                {hasDestruct && !isDeleted && (
                                    <DestructCountdown
                                        destructAfterSeconds={destructAfterSeconds!}
                                        createdAt={msg.createdAt}
                                        onExpired={handleDestructExpired}
                                    />
                                )}
                                {isScheduled && msg.scheduledAt && (
                                    <Calendar size={9} style={{ color: 'var(--text-3)' }} />
                                )}
                                {isEdited && (
                                    <span className="text-[10px]" style={{ color: isMe ? 'rgba(238,238,255,0.4)' : 'var(--text-3)' }}>
                    edited
                  </span>
                                )}
                                {msg._isLegacy && !isDeleted && (
                                    <span
                                        title="deprecated – read only (v1 encryption)"
                                        className="flex items-center cursor-help"
                                    >
                                        <AlertTriangle size={9} className="text-amber-500" />
                                    </span>
                                )}
                                <span
                                    className="text-[10px] font-mono"
                                    style={{ color: isMe ? 'rgba(238,238,255,0.38)' : 'var(--text-3)' }}
                                >
                  {formatTime(msg.createdAt)}
                </span>
                                {isMe && !isDeleted && <MessageStatus msg={msg} />}
                                {isMe && !isDeleted && (isGroup || isChannel) && msg.readBy && msg.readBy.length > 0 && (
                                    <span
                                        className="text-[9px]"
                                        style={{ color: 'rgba(238,238,255,0.38)' }}
                                        title={msg.readBy.map(r => r.nickname).join(', ')}
                                    >
                    👁 {msg.readBy.length}
                  </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Reactions ── */}
                <ReactionsRow
                    reactions={msg.reactions ?? []}
                    currentUserId={currentUserId!}
                    onToggle={em => msg.id && onToggleReaction(msg.id, em)}
                />
            </div>
        </>
    );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────
export function MessageSkeleton({ isMe }: { isMe?: boolean }) {
    return (
        <div className={`flex flex-col mb-3 px-4 ${isMe ? 'items-end' : 'items-start'}`}>
            <div
                className="skeleton"
                style={{
                    width: isMe ? `${160 + Math.random() * 80}px` : `${180 + Math.random() * 100}px`,
                    height: '38px',
                    borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                }}
            />
        </div>
    );
}