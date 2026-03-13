'use client';

import React, { useState, useRef, useEffect, UIEvent, useCallback } from 'react';
import {
    Send, Loader2, Trash2, Pencil, Check, X,
    SmilePlus, Paperclip, FileText, Download, ImageOff,
} from 'lucide-react';
import { useChat }       from '@/src/hooks/useChat';
import { uploadFile, isImageType, formatFileSize } from '@/src/lib/uploadFile';
import { User }    from '@/src/types/auth.types';
import { Message, Reaction } from '@/src/types/chat.types';
import { Socket }  from 'socket.io-client';
import { EmojiPicker } from './EmojiPicker';

interface ChatAreaProps {
    currentUserId: string | number;
    selectedUser:  User | null;
    socket:        Socket | null;
}

const EDIT_WINDOW_MS = 15 * 60 * 1000;

const formatTime = (d: string | Date) =>
    new Date(d).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

const formatDateSeparator = (d: string | Date) => {
    const date = new Date(d);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString())     return 'Сьогодні';
    if (date.toDateString() === yesterday.toDateString()) return 'Вчора';
    return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
};

// ── Статус ────────────────────────────────────────────────────────────────────
const CHECK_PATH = 'M1.5 5L5 8.5L12.5 1';
const MessageStatus = ({ message }: { message: Message }) => {
    const color = message.isRead ? '#a5b4fc' : 'rgba(255,255,255,0.5)';
    if (!message.id)
        return <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-label="Надсилається" className="inline-block shrink-0"><path d={CHECK_PATH} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    return (
        <svg width="19" height="10" viewBox="0 0 19 10" fill="none" aria-label={message.isRead ? 'Прочитано' : 'Доставлено'} className="inline-block shrink-0">
            <path d={CHECK_PATH} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M5.5 5L9 8.5L16.5 1" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
};

// ── Реакції ───────────────────────────────────────────────────────────────────
const ReactionsRow = ({ reactions, currentUserId, onToggle }: {
    reactions: Reaction[];
    currentUserId: string | number;
    onToggle: (emoji: string) => void;
}) => {
    if (!reactions?.length) return null;
    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {reactions.map((r) => {
                const isMine = r.userIds.some((id) => String(id) === String(currentUserId));
                return (
                    <button
                        key={r.emoji}
                        onClick={() => onToggle(r.emoji)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all cursor-pointer select-none
                            ${isMine
                            ? 'bg-indigo-100 border-indigo-300 text-indigo-700 hover:bg-indigo-200'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        <span className="text-sm leading-none">{r.emoji}</span>
                        <span>{r.count}</span>
                    </button>
                );
            })}
        </div>
    );
};

// ── Файлова бульбашка ─────────────────────────────────────────────────────────
const FileBubble = ({ msg, isMe }: { msg: Message; isMe: boolean }) => {
    const [imgError, setImgError] = useState(false);
    const isImage = isImageType(msg.fileType) && !imgError;

    if (isImage) {
        return (
            <a href={msg.fileUrl!} target="_blank" rel="noopener noreferrer">
                <img
                    src={msg.fileUrl!}
                    alt={msg.fileName ?? 'image'}
                    onError={() => setImgError(true)}
                    className="max-w-[260px] max-h-[200px] rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity block"
                />
            </a>
        );
    }

    return (
        <a
        href={msg.fileUrl!}
    target="_blank"
    rel="noopener noreferrer"
    download={msg.fileName ?? true}
    className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors max-w-[260px]
                ${isMe ? 'bg-white/15 hover:bg-white/25' : 'bg-slate-50 hover:bg-slate-100 border border-slate-200'}`}
>
    {imgError
        ? <ImageOff size={20} className={isMe ? 'text-indigo-200 shrink-0' : 'text-slate-400 shrink-0'} />
        : <FileText size={20} className={isMe ? 'text-indigo-200 shrink-0' : 'text-slate-400 shrink-0'} />
    }
    <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium truncate ${isMe ? 'text-white' : 'text-slate-700'}`}>
            {msg.fileName ?? 'Файл'}
        </p>
        {msg.fileSize != null && (
            <p className={`text-xs ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                {formatFileSize(msg.fileSize)}
            </p>
        )}
    </div>
    <Download size={14} className={isMe ? 'text-indigo-200 shrink-0' : 'text-slate-400 shrink-0'} />
</a>
    );
};
// ─────────────────────────────────────────────────────────────────────────────

export default function ChatArea({ currentUserId, selectedUser, socket }: ChatAreaProps) {
    const [inputValue,      setInputValue]      = useState('');
    const [hoveredMsgKey,   setHoveredMsgKey]   = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
    const [editingId,       setEditingId]       = useState<number | null>(null);
    const [editingContent,  setEditingContent]  = useState('');
    const [pickerMsgKey,    setPickerMsgKey]    = useState<string | null>(null);

    // Upload
    const [isDragging,     setIsDragging]     = useState(false);
    const [dragCounter,    setDragCounter]    = useState(0);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [uploadError,    setUploadError]    = useState<string | null>(null);
    const uploadAbortRef = useRef<AbortController | null>(null);

    const fileInputRef   = useRef<HTMLInputElement>(null);
    const editInputRef   = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollRef      = useRef<HTMLDivElement>(null);
    const lastMsgIdRef   = useRef<string | number | null>(null);

    const {
        messages, sendMessage, sendFileMessage,
        deleteMessage, editMessage, toggleReaction,
        isTyping, notifyTyping,
        loadMoreMessages, hasMore, isLoadingMore,
    } = useChat(selectedUser?.id, currentUserId, socket);

    // Скрол
    useEffect(() => {
        if (!messages.length) return;
        const last = messages[messages.length - 1];
        const id   = last.id ?? (last.createdAt as string);
        if (id !== lastMsgIdRef.current || isTyping) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            lastMsgIdRef.current = id;
        }
    }, [messages, isTyping]);

    useEffect(() => {
        if (confirmDeleteId === null) return;
        const h = () => setConfirmDeleteId(null);
        document.addEventListener('click', h);
        return () => document.removeEventListener('click', h);
    }, [confirmDeleteId]);

    useEffect(() => {
        if (editingId === null) return;
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelEdit(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [editingId]);

    useEffect(() => {
        if (editingId !== null) {
            editInputRef.current?.focus();
            const l = editInputRef.current?.value.length ?? 0;
            editInputRef.current?.setSelectionRange(l, l);
        }
    }, [editingId]);

    const handleScroll = async (e: UIEvent<HTMLDivElement>) => {
        const t = e.currentTarget;
        if (t.scrollTop <= 1 && hasMore && !isLoadingMore) {
            const prev = t.scrollHeight;
            await loadMoreMessages();
            requestAnimationFrame(() => { t.scrollTop = t.scrollHeight - prev; });
        }
    };

    // ── File upload ───────────────────────────────────────────────────────────
    const handleFileUpload = useCallback(async (file: File) => {
        if (!file || !selectedUser) return;
        setUploadError(null);
        setUploadProgress(0);
        const ctrl = new AbortController();
        uploadAbortRef.current = ctrl;
        try {
            const result = await uploadFile(file, setUploadProgress, ctrl.signal);
            sendFileMessage({
                fileUrl:  result.url,
                fileName: result.fileName,
                fileType: result.fileType,
                fileSize: result.fileSize,
            });
        } catch (err: any) {
            if (err.message !== 'Upload cancelled') setUploadError(err.message ?? 'Помилка завантаження');
        } finally {
            setUploadProgress(null);
            uploadAbortRef.current = null;
        }
    }, [selectedUser, sendFileMessage]);

    // ── Drag & Drop ───────────────────────────────────────────────────────────
    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        setDragCounter((c) => c + 1);
        if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
    };
    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setDragCounter((c) => {
            const next = c - 1;
            if (next <= 0) { setIsDragging(false); return 0; }
            return next;
        });
    };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        setDragCounter(0);
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
    };

    // ── Edit ──────────────────────────────────────────────────────────────────
    const startEdit = (msg: Message) => {
        if (!msg.id || msg.deletedAt || msg.fileUrl) return;
        if (Date.now() - new Date(msg.createdAt).getTime() > EDIT_WINDOW_MS) return;
        setEditingId(msg.id);
        setEditingContent(msg.content);
        setConfirmDeleteId(null);
        setPickerMsgKey(null);
    };
    const cancelEdit  = () => { setEditingId(null); setEditingContent(''); };
    const submitEdit  = (id: number) => {
        if (editingContent.trim()) editMessage(id, editingContent.trim());
        cancelEdit();
    };

    // ─────────────────────────────────────────────────────────────────────────
    if (!selectedUser) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-50 text-slate-400 font-medium">
                Оберіть когось, щоб почати спілкування
            </div>
        );
    }

    return (
        <main
            className="flex-1 flex flex-col bg-slate-50 relative"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
        >
            {/* Drag overlay */}
            {isDragging && (
                <div className="absolute inset-0 z-50 bg-indigo-500/10 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
                    <div className="bg-white rounded-2xl shadow-xl px-10 py-8 flex flex-col items-center gap-3 border-2 border-dashed border-indigo-400">
                        <Paperclip size={36} className="text-indigo-400" />
                        <p className="text-indigo-600 font-semibold text-lg">Відпустіть, щоб надіслати файл</p>
                        <p className="text-slate-400 text-sm">Максимум 10 МБ</p>
                    </div>
                </div>
            )}

            {/* Шапка */}
            <header className="px-6 py-4 bg-white border-b border-gray-100 flex items-center shadow-sm z-10">
                <div>
                    <h2 className="font-semibold text-gray-800 text-lg leading-tight">{selectedUser.nickname}</h2>
                    <p className={`text-xs font-medium mt-0.5 ${selectedUser.isOnline ? 'text-violet-500' : 'text-slate-400'}`}>
                        {selectedUser.isOnline ? 'В мережі' : 'Офлайн'}
                    </p>
                </div>
            </header>

            {/* Повідомлення */}
            <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-6 py-6 space-y-1">
                {isLoadingMore && (
                    <div className="flex justify-center py-2">
                        <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                    </div>
                )}

                {messages.map((msg: Message, idx: number) => {
                    const isMe       = String(msg.senderId) === String(currentUserId);
                    const isDeleted  = !!msg.deletedAt;
                    const isEdited   = !!msg.editedAt && !isDeleted;
                    const hasFile    = !!msg.fileUrl && !isDeleted;
                    const isImage    = hasFile && isImageType(msg.fileType);
                    const msgKey     = msg.id ? `msg-${msg.id}` : `temp-${idx}-${msg.createdAt}`;
                    const isHovered  = hoveredMsgKey === msgKey;
                    const isConfirm  = msg.id !== undefined && confirmDeleteId === msg.id;
                    const isEditing  = msg.id !== undefined && editingId === msg.id;
                    const isPickerOpen = pickerMsgKey === msgKey;

                    // Редагування тільки для текстових повідомлень в межах 15 хв
                    const ageMs   = Date.now() - new Date(msg.createdAt).getTime();
                    const canEdit = isMe && !isDeleted && !!msg.id && !msg.fileUrl && ageMs <= EDIT_WINDOW_MS;
                    const showActions = isHovered || isConfirm || isPickerOpen;

                    const showSep = idx === 0 ||
                        new Date(msg.createdAt).toDateString() !== new Date(messages[idx - 1].createdAt).toDateString();

                    return (
                        <React.Fragment key={msgKey}>
                            {showSep && (
                                <div className="flex justify-center my-4">
                                    <span className="bg-violet-100/50 text-violet-600 font-medium text-xs px-4 py-1.5 rounded-full">
                                        {formatDateSeparator(msg.createdAt)}
                                    </span>
                                </div>
                            )}

                            <div
                                className={`flex flex-col mb-1 ${isMe ? 'items-end' : 'items-start'}`}
                                onMouseEnter={() => setHoveredMsgKey(msgKey)}
                                onMouseLeave={() => setHoveredMsgKey(null)}
                            >
                                <div className={`flex items-end gap-2 ${isMe ? 'flex-row' : 'flex-row-reverse'}`}>

                                    {/* Панель дій */}
                                    {!isDeleted && msg.id && !isEditing && (
                                        <div className={`flex items-center gap-1 transition-opacity duration-150
                                            ${showActions ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>

                                            {/* Emoji picker */}
                                            <div className="relative">
                                                <button
                                                    onClick={() => setPickerMsgKey((p) => p === msgKey ? null : msgKey)}
                                                    className={`p-1.5 rounded-full transition-all cursor-pointer
                                                        ${isPickerOpen ? 'text-indigo-500 bg-indigo-50' : 'text-slate-400 hover:text-indigo-500 hover:bg-indigo-50'}`}
                                                    title="Додати реакцію"
                                                >
                                                    <SmilePlus size={14} />
                                                </button>
                                                {isPickerOpen && (
                                                    <EmojiPicker
                                                        align={isMe ? 'right' : 'left'}
                                                        onSelect={(emoji) => { toggleReaction(msg.id!, emoji); }}
                                                        onClose={() => setPickerMsgKey(null)}
                                                    />
                                                )}
                                            </div>

                                            {/* Edit + Delete — тільки власні */}
                                            {isMe && (
                                                <>
                                                    {isConfirm ? (
                                                        <div
                                                            className="flex items-center gap-1.5 bg-white border border-red-100 rounded-xl px-2.5 py-1.5 shadow-md"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <span className="text-xs text-slate-500 whitespace-nowrap">Видалити?</span>
                                                            <button onClick={(e) => { e.stopPropagation(); deleteMessage(msg.id!); setConfirmDeleteId(null); }} className="text-xs font-semibold text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer">Так</button>
                                                            <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }} className="text-xs font-semibold text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">Ні</button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {canEdit && (
                                                                <button onClick={() => startEdit(msg)} className="p-1.5 rounded-full text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 transition-all cursor-pointer" title="Редагувати">
                                                                    <Pencil size={14} />
                                                                </button>
                                                            )}
                                                            <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(msg.id!); }} className="p-1.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer" title="Видалити">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* Бульбашка */}
                                    <div
                                        className={`
                                            ${isImage ? 'p-1.5' : 'px-4 py-2.5'}
                                            max-w-md break-words flex flex-col shadow-sm
                                            ${isMe ? 'bg-indigo-500 text-white rounded-2xl rounded-br-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-2xl rounded-bl-sm'}
                                            ${isDeleted ? 'opacity-60' : ''}
                                            ${isEditing ? 'ring-2 ring-indigo-300 ring-offset-1' : ''}
                                        `}
                                        onDoubleClick={() => canEdit && !isEditing && startEdit(msg)}
                                    >
                                        {isDeleted ? (
                                            <span className={`text-sm italic ${isImage ? 'px-2 py-1' : ''} ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                Повідомлення видалено
                                            </span>
                                        ) : isEditing ? (
                                            <div className="flex items-center gap-2 min-w-[200px]">
                                                <input
                                                    ref={editInputRef}
                                                    value={editingContent}
                                                    onChange={(e) => setEditingContent(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitEdit(msg.id!); } }}
                                                    maxLength={4000}
                                                    className="flex-1 bg-transparent text-white placeholder-indigo-300 outline-none text-sm leading-relaxed min-w-0"
                                                />
                                                <div className="flex gap-1 shrink-0">
                                                    <button onClick={() => submitEdit(msg.id!)} className="p-1 rounded-full bg-white/20 hover:bg-white/30 text-white cursor-pointer"><Check size={13}/></button>
                                                    <button onClick={cancelEdit} className="p-1 rounded-full bg-white/20 hover:bg-white/30 text-white cursor-pointer"><X size={13}/></button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                {hasFile && <FileBubble msg={msg} isMe={isMe} />}
                                                {msg.content && (
                                                    <span className={`leading-relaxed ${hasFile ? (isImage ? 'px-2 pt-1' : 'mt-1.5') : ''}`}>
                                                        {msg.content}
                                                    </span>
                                                )}
                                            </>
                                        )}

                                        {/* Час + ред. + статус */}
                                        {!isEditing && (
                                            <div className={`flex items-center gap-1 self-end mt-1 ${isImage ? 'px-2 pb-1' : ''}`}>
                                                {isEdited && <span className={`text-[10px] italic select-none leading-none ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>ред.</span>}
                                                <span className={`text-[10px] font-medium select-none leading-none ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                    {formatTime(msg.createdAt)}
                                                </span>
                                                {isMe && !isDeleted && <MessageStatus message={msg} />}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Реакції */}
                                <ReactionsRow
                                    reactions={msg.reactions ?? []}
                                    currentUserId={currentUserId}
                                    onToggle={(emoji) => msg.id && toggleReaction(msg.id, emoji)}
                                />
                            </div>
                        </React.Fragment>
                    );
                })}

                {isTyping && (
                    <div className="flex justify-start animate-pulse">
                        <div className="px-4 py-2.5 rounded-2xl rounded-bl-sm bg-white border border-gray-100 text-violet-400 text-sm italic shadow-sm">
                            <span className="font-medium">{selectedUser.nickname}</span> друкує...
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Прогрес завантаження */}
            {uploadProgress !== null && (
                <div className="px-4 py-2.5 bg-white border-t border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                                className="h-full bg-indigo-500 transition-all duration-200 rounded-full"
                                style={{ width: `${uploadProgress}%` }}
                            />
                        </div>
                        <span className="text-xs text-slate-500 w-9 text-right shrink-0">{uploadProgress}%</span>
                        <button
                            onClick={() => { uploadAbortRef.current?.abort(); setUploadProgress(null); }}
                            className="text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* Помилка */}
            {uploadError && (
                <div className="px-4 py-2 bg-red-50 border-t border-red-100 flex items-center justify-between">
                    <span className="text-xs text-red-500">{uploadError}</span>
                    <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600 cursor-pointer ml-3 shrink-0">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Форма вводу */}
            <form
                onSubmit={(e) => { e.preventDefault(); if (!inputValue.trim()) return; sendMessage(inputValue); setInputValue(''); }}
                className="p-4 bg-white border-t border-gray-100 flex gap-3 items-end"
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                        e.target.value = '';
                    }}
                />

                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadProgress !== null}
                    className="p-3 h-[50px] w-[50px] rounded-full text-slate-400 hover:text-violet-500 hover:bg-violet-50 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
                    title="Прикріпити файл"
                >
                    {uploadProgress !== null
                        ? <Loader2 size={18} className="animate-spin" />
                        : <Paperclip size={18} />
                    }
                </button>

                <input
                    value={inputValue}
                    onChange={(e) => { setInputValue(e.target.value); notifyTyping(); }}
                    className="flex-1 bg-slate-50 border-transparent rounded-2xl px-5 py-3 text-gray-700 outline-none focus:bg-white focus:border-violet-200 focus:ring-4 focus:ring-violet-50 transition-all"
                    placeholder="Напишіть повідомлення..."
                />

                <button
                    type="submit"
                    disabled={!inputValue.trim() || uploadProgress !== null}
                    className="bg-violet-500 hover:bg-violet-600 text-white p-3 h-[50px] w-[50px] rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 shrink-0 cursor-pointer"
                >
                    <Send size={18} className="ml-0.5" />
                </button>
            </form>
        </main>
    );
}