'use client';

import React, {
    useState, useRef, useEffect, UIEvent, useCallback,
} from 'react';
import {
    Send, Loader2, Trash2, Pencil, Check, X,
    SmilePlus, Paperclip, FileText, Download,
    ImageOff, Search, ChevronUp, ChevronDown,
    Reply, Users, Hash,
} from 'lucide-react';
import { useMessages }   from '@/src/hooks/useMessages';
import { useSearch }     from '@/src/hooks/useSearch';
import { uploadFile, isImageType, formatFileSize } from '@/src/lib/uploadFile';
import { Avatar }        from './Avatar';
import { EmojiPicker }   from './EmojiPicker';
import {
    Conversation, Message, Reaction,
} from '@/src/types/conversation.types';
import { User }          from '@/src/types/auth.types';
import { Socket }        from 'socket.io-client';

interface ChatAreaProps {
    currentUser:           User | null;
    conversation:          Conversation | null;
    socket:                Socket | null;
    onConversationUpdate?: (updated: any) => void;
    onMarkRead?:           (conversationId: number) => void;
}

const EDIT_WINDOW_MS = 15 * 60 * 1000;

const formatTime = (d: string | Date) =>
    new Date(d).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

const formatDateSep = (d: string | Date) => {
    const date = new Date(d);
    const now  = new Date();
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    if (date.toDateString() === now.toDateString())  return 'Сьогодні';
    if (date.toDateString() === yest.toDateString()) return 'Вчора';
    return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
};

const escReg = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const HighlightText = ({ text, query }: { text: string; query: string }) => {
    if (!query.trim()) return <>{text}</>;
    const parts = text.split(new RegExp(`(${escReg(query.trim())})`, 'gi'));
    return (
        <>
            {parts.map((p, i) =>
                p.toLowerCase() === query.trim().toLowerCase()
                    ? <mark key={i} className="bg-yellow-300 text-yellow-900 rounded-sm px-px">{p}</mark>
                    : <span key={i}>{p}</span>,
            )}
        </>
    );
};

const CP = 'M1.5 5L5 8.5L12.5 1';
const MessageStatus = ({ msg }: { msg: Message }) => {
    const isRead = msg.isRead === true;
    const c = isRead ? '#69dafa' : 'rgba(255,255,255,0.5)';
    if (!msg.id)
        return <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="inline-block shrink-0"><path d={CP} stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    return (
        <svg width="19" height="10" viewBox="0 0 19 10" fill="none" className="inline-block shrink-0">
            <path d={CP}                   stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M5.5 5L9 8.5L16.5 1" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
};

const ReactionsRow = ({ reactions, currentUserId, onToggle }: {
    reactions: Reaction[]; currentUserId: number | string; onToggle: (e: string) => void;
}) => {
    if (!reactions?.length) return null;
    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {reactions.map((r) => {
                const mine = r.userIds.some((id) => String(id) === String(currentUserId));
                return (
                    <button key={r.emoji} onClick={() => onToggle(r.emoji)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all cursor-pointer select-none
                                ${mine
                                ? 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200'
                                : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'}`}>
                        <span className="text-sm leading-none">{r.emoji}</span>
                        <span>{r.count}</span>
                    </button>
                );
            })}
        </div>
    );
};

const FileBubble = ({ msg, isMe }: { msg: Message; isMe: boolean }) => {
    const [err, setErr] = useState(false);
    if (isImageType(msg.fileType) && !err) {
        return (
            <a href={msg.fileUrl!} target="_blank" rel="noopener noreferrer">
                <img src={msg.fileUrl!} alt={msg.fileName ?? 'image'} onError={() => setErr(true)}
                     className="max-w-[260px] max-h-[200px] rounded-xl object-cover cursor-pointer hover:opacity-90 block" />
            </a>
        );
    }
    return (
        <a href={msg.fileUrl!} target="_blank" rel="noopener noreferrer" download={msg.fileName ?? true}
           className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors max-w-[260px]
            ${isMe ? 'bg-white/15 hover:bg-white/25' : 'bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600'}`}>
            {err
                ? <ImageOff size={20} className={isMe ? 'text-indigo-200 shrink-0' : 'text-slate-400 shrink-0'} />
                : <FileText size={20} className={isMe ? 'text-indigo-200 shrink-0' : 'text-slate-400 shrink-0'} />}
            <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${isMe ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>
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

const ReplyBubble = ({ reply, isMe }: { reply: NonNullable<Message['replyTo']>; isMe: boolean }) => (
    <div className={`text-xs rounded-lg px-2.5 py-1.5 mb-1.5 border-l-2 cursor-default
        ${isMe
        ? 'bg-white/10 border-white/50 text-indigo-100'
        : 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-500 text-slate-500 dark:text-slate-400'}`}>
        <p className="font-semibold mb-0.5">{reply.sender.nickname}</p>
        <p className="truncate opacity-80">{reply.deletedAt ? 'Повідомлення видалено' : reply.content || '📎 Файл'}</p>
    </div>
);

export default function ChatArea({
                                     currentUser, conversation, socket, onConversationUpdate, onMarkRead,
                                 }: ChatAreaProps) {
    const currentUserId = currentUser?.id;

    const [inputValue,     setInputValue]     = useState('');
    const [hoveredKey,     setHoveredKey]     = useState<string | null>(null);
    const [confirmDelId,   setConfirmDelId]   = useState<number | null>(null);
    const [editingId,      setEditingId]      = useState<number | null>(null);
    const [editingContent, setEditingContent] = useState('');
    const [pickerKey,      setPickerKey]      = useState<string | null>(null);
    const [replyTo,        setReplyTo]        = useState<Message | null>(null);
    const [searchNavIdx,   setSearchNavIdx]   = useState(0);
    const [isDragging,     setIsDragging]     = useState(false);
    const [dragCounter,    setDragCounter]    = useState(0);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [uploadError,    setUploadError]    = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fileInputRef   = useRef<HTMLInputElement>(null);
    const editInputRef   = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollRef      = useRef<HTMLDivElement>(null);
    const lastMsgIdRef   = useRef<string | number | null>(null);
    const msgRefsMap     = useRef<Record<number, HTMLDivElement | null>>({});

    const {
        messages, typingUsers, hasMore, isLoadingMore, jumpTarget,
        sendMessage, sendFileMessage, deleteMessage, editMessage, toggleReaction,
        notifyTyping, loadMoreMessages, jumpToMessage, clearJumpTarget,
    } = useMessages(conversation?.id, currentUserId, socket);

    const { query, setQuery, results, isSearching, isOpen, setIsOpen, close: closeSearch } =
        useSearch(conversation?.id);

    useEffect(() => {
        if (!messages.length) return;
        const last = messages[messages.length - 1];
        const id   = last.id ?? (last.createdAt as string);
        if (id !== lastMsgIdRef.current && !jumpTarget) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            lastMsgIdRef.current = id;
        }
    }, [messages]);

    useEffect(() => {
        if (!messages.length || !conversation) return;
        const last = messages[messages.length - 1];
        if (String(last.senderId) !== String(currentUserId)) {
            onMarkRead?.(conversation.id);
        }
    }, [messages]);

    useEffect(() => {
        if (jumpTarget === null) return;
        const el = msgRefsMap.current[jumpTarget];
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const t = setTimeout(clearJumpTarget, 2500);
            return () => clearTimeout(t);
        }
    }, [jumpTarget, messages]);

    useEffect(() => { setSearchNavIdx(0); }, [results]);

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (editingId !== null) cancelEdit();
                else if (replyTo)       setReplyTo(null);
                else if (isOpen)        closeSearch();
            }
        };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [editingId, replyTo, isOpen]);

    useEffect(() => {
        if (editingId !== null) {
            editInputRef.current?.focus();
            const l = editInputRef.current?.value.length ?? 0;
            editInputRef.current?.setSelectionRange(l, l);
        }
    }, [editingId]);

    useEffect(() => {
        if (isOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
    }, [isOpen]);

    const handleScroll = async (e: UIEvent<HTMLDivElement>) => {
        const t = e.currentTarget;
        if (t.scrollTop <= 1 && hasMore && !isLoadingMore) {
            const prev = t.scrollHeight;
            await loadMoreMessages();
            requestAnimationFrame(() => { t.scrollTop = t.scrollHeight - prev; });
        }
    };

    const handleFileUpload = useCallback(async (file: File) => {
        if (!file || !conversation) return;
        setUploadError(null); setUploadProgress(0);
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        try {
            const r = await uploadFile(file, setUploadProgress, ctrl.signal);
            sendFileMessage({ fileUrl: r.url, fileName: r.fileName, fileType: r.fileType, fileSize: r.fileSize, replyToId: replyTo?.id });
            setReplyTo(null);
        } catch (err: any) {
            if (err.message !== 'Upload cancelled') setUploadError(err.message ?? 'Помилка');
        } finally { setUploadProgress(null); abortRef.current = null; }
    }, [conversation, sendFileMessage, replyTo]);

    const onDragEnter = (e: React.DragEvent) => {
        e.preventDefault(); setDragCounter((c) => c + 1);
        if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
    };
    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setDragCounter((c) => { const n = c - 1; if (n <= 0) { setIsDragging(false); return 0; } return n; });
    };
    const onDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false); setDragCounter(0);
        const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f);
    };

    const startEdit = (msg: Message) => {
        if (!msg.id || msg.deletedAt || msg.fileUrl) return;
        if (Date.now() - new Date(msg.createdAt).getTime() > EDIT_WINDOW_MS) return;
        setEditingId(msg.id); setEditingContent(msg.content);
        setConfirmDelId(null); setPickerKey(null);
    };
    const cancelEdit = () => { setEditingId(null); setEditingContent(''); };
    const submitEdit = (id: number) => {
        if (editingContent.trim()) editMessage(id, editingContent.trim());
        cancelEdit();
    };

    const navSearch = (dir: 'prev' | 'next') => {
        if (!results.length) return;
        const next = dir === 'next'
            ? (searchNavIdx + 1) % results.length
            : (searchNavIdx - 1 + results.length) % results.length;
        setSearchNavIdx(next);
        const msg = results[next];
        if (msg.id) jumpToMessage(msg.id);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim()) return;
        sendMessage(inputValue.trim(), replyTo?.id);
        setInputValue(''); setReplyTo(null);
    };

    const myMember  = conversation?.members.find((m) => m.userId === currentUserId);
    const canPost   = conversation?.type !== 'CHANNEL' || myMember?.role !== 'MEMBER';
    const isChannel = conversation?.type === 'CHANNEL';
    const isGroup   = conversation?.type === 'GROUP';

    if (!conversation) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-400 font-medium flex-col gap-3 transition-colors duration-200">
                <MessageSquarePlaceholder />
                <p>Оберіть чат або знайдіть друзів</p>
            </div>
        );
    }

    return (
        <main className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900 relative min-w-0 transition-colors duration-200"
              onDragEnter={onDragEnter} onDragLeave={onDragLeave}
              onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>

            {isDragging && (
                <div className="absolute inset-0 z-50 bg-indigo-500/10 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl px-10 py-8 flex flex-col items-center gap-3 border-2 border-dashed border-indigo-400">
                        <Paperclip size={36} className="text-indigo-400" />
                        <p className="text-indigo-600 dark:text-indigo-400 font-semibold text-lg">Відпустіть, щоб надіслати файл</p>
                        <p className="text-slate-400 text-sm">Максимум 10 МБ</p>
                    </div>
                </div>
            )}

            {/* ── Header ── */}
            <header className="px-5 py-3.5 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between shadow-sm z-10">
                <div className="flex items-center gap-3 min-w-0">
                    {conversation.avatarUrl || conversation.type === 'DIRECT' ? (
                        <div className="relative shrink-0">
                            <Avatar user={{ nickname: conversation.name ?? '?', avatarUrl: conversation.avatarUrl }} size="md" />
                            {conversation.type === 'DIRECT' && (
                                <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-800
                                    ${conversation.isOnline ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'}`} />
                            )}
                        </div>
                    ) : (
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0
                            ${isGroup ? 'bg-violet-100 dark:bg-violet-900/40' : 'bg-indigo-100 dark:bg-indigo-900/40'}`}>
                            {isGroup ? <Users size={18} className="text-violet-500" /> : <Hash size={18} className="text-indigo-500" />}
                        </div>
                    )}
                    <div className="min-w-0">
                        <h2 className="font-semibold text-gray-800 dark:text-slate-100 text-base leading-tight truncate">
                            {conversation.name ?? 'Чат'}
                        </h2>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                            {conversation.type === 'DIRECT'
                                ? (conversation.isOnline ? 'В мережі' : 'Офлайн')
                                : `${conversation.members.length} учасників`}
                        </p>
                    </div>
                </div>
                <button onClick={() => setIsOpen((o) => !o)}
                        className={`p-2 rounded-full transition-all cursor-pointer
                            ${isOpen ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/40' : 'text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'}`}
                        title="Пошук">
                    <Search size={17} />
                </button>
            </header>

            {/* ── Search panel ── */}
            {isOpen && (
                <div className="bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 px-4 py-3 flex flex-col gap-2 z-10 shadow-sm">
                    <div className="flex items-center gap-2">
                        <div className="flex-1 relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input ref={searchInputRef} value={query} onChange={(e) => setQuery(e.target.value)}
                                   placeholder="Пошук по повідомленнях..."
                                   className="w-full pl-8 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-400 rounded-xl outline-none focus:bg-white dark:focus:bg-slate-600 focus:ring-2 focus:ring-indigo-200 transition-all" />
                            {isSearching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
                        </div>
                        {results.length > 0 && (
                            <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-400 whitespace-nowrap px-1">{searchNavIdx + 1} / {results.length}</span>
                                <button onClick={() => navSearch('prev')} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer"><ChevronUp size={15}/></button>
                                <button onClick={() => navSearch('next')} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer"><ChevronDown size={15}/></button>
                            </div>
                        )}
                        <button onClick={closeSearch} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"><X size={15}/></button>
                    </div>
                    {query.trim().length >= 2 && !isSearching && (
                        <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 divide-y divide-slate-100 dark:divide-slate-600">
                            {results.length === 0
                                ? <p className="text-xs text-slate-400 text-center py-4">Нічого не знайдено</p>
                                : results.map((msg, idx) => {
                                    const isMe = String(msg.senderId) === String(currentUserId);
                                    return (
                                        <button key={msg.id ?? idx}
                                                onClick={() => { setSearchNavIdx(idx); if (msg.id) jumpToMessage(msg.id); }}
                                                className={`w-full text-left px-3 py-2.5 hover:bg-white dark:hover:bg-slate-600 transition-colors
                                                    ${idx === searchNavIdx ? 'bg-indigo-50 dark:bg-indigo-900/30 border-l-2 border-l-indigo-400' : ''}`}>
                                            <div className="flex items-center justify-between mb-0.5">
                                                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{isMe ? 'Ви' : (msg.sender?.nickname ?? '?')}</span>
                                                <span className="text-[10px] text-slate-400">{formatTime(msg.createdAt)}</span>
                                            </div>
                                            <p className="text-sm text-slate-600 dark:text-slate-300 truncate">
                                                <HighlightText text={msg.content} query={query} />
                                            </p>
                                        </button>
                                    );
                                })
                            }
                        </div>
                    )}
                </div>
            )}

            {/* ── Messages ── */}
            <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-5 py-5 space-y-1">
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
                    const msgKey     = msg.id ? `msg-${msg.id}` : `tmp-${idx}`;
                    const isHovered  = hoveredKey === msgKey;
                    const isConfirm  = msg.id != null && confirmDelId === msg.id;
                    const isEditing  = msg.id != null && editingId    === msg.id;
                    const isPickerOn = pickerKey === msgKey;
                    const isJump     = msg.id != null && jumpTarget === msg.id;
                    const age        = Date.now() - new Date(msg.createdAt).getTime();
                    const canEdit    = isMe && !isDeleted && !!msg.id && !msg.fileUrl && age <= EDIT_WINDOW_MS;
                    const showAct    = isHovered || isConfirm || isPickerOn;
                    const showSep    = idx === 0 ||
                        new Date(msg.createdAt).toDateString() !== new Date(messages[idx - 1].createdAt).toDateString();
                    const showSender = !isMe && (isGroup || isChannel);

                    return (
                        <React.Fragment key={msgKey}>
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
                                onMouseEnter={() => setHoveredKey(msgKey)}
                                onMouseLeave={() => setHoveredKey(null)}
                            >
                                {showSender && !isDeleted && (
                                    <div className="flex items-center gap-2 mb-1 ml-1">
                                        {msg.sender && <Avatar user={msg.sender} size="sm" />}
                                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{msg.sender?.nickname ?? ''}</span>
                                    </div>
                                )}

                                <div className={`flex items-end gap-2 ${isMe ? 'flex-row' : 'flex-row-reverse'}`}>
                                    {!isDeleted && msg.id && !isEditing && (
                                        <div className={`flex items-center gap-1 transition-opacity duration-150 ${showAct ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                            <button onClick={() => setReplyTo(msg)}
                                                    className="p-1.5 rounded-full text-slate-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30 cursor-pointer transition-all">
                                                <Reply size={13} />
                                            </button>
                                            <div className="relative">
                                                <button onClick={() => setPickerKey((p) => p === msgKey ? null : msgKey)}
                                                        className={`p-1.5 rounded-full transition-all cursor-pointer
                                                            ${isPickerOn ? 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/40' : 'text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'}`}>
                                                    <SmilePlus size={13} />
                                                </button>
                                                {isPickerOn && (
                                                    <EmojiPicker align={isMe ? 'right' : 'left'}
                                                                 onSelect={(e) => { toggleReaction(msg.id!, e); }}
                                                                 onClose={() => setPickerKey(null)} />
                                                )}
                                            </div>
                                            {isMe && (
                                                <>
                                                    {isConfirm ? (
                                                        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-red-100 dark:border-red-900 rounded-xl px-2.5 py-1.5 shadow-md"
                                                             onClick={(e) => e.stopPropagation()}>
                                                            <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">Видалити?</span>
                                                            <button onClick={(e) => { e.stopPropagation(); deleteMessage(msg.id!); setConfirmDelId(null); }}
                                                                    className="text-xs font-semibold text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 cursor-pointer">Так</button>
                                                            <button onClick={(e) => { e.stopPropagation(); setConfirmDelId(null); }}
                                                                    className="text-xs font-semibold text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer">Ні</button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {canEdit && (
                                                                <button onClick={() => startEdit(msg)}
                                                                        className="p-1.5 rounded-full text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer transition-all">
                                                                    <Pencil size={13} />
                                                                </button>
                                                            )}
                                                            <button onClick={(e) => { e.stopPropagation(); setConfirmDelId(msg.id!); }}
                                                                    className="p-1.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 cursor-pointer transition-all">
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}

                                    <div className={`
                                        ${isImage ? 'p-1.5' : 'px-4 py-2.5'}
                                        max-w-md break-words flex flex-col shadow-sm transition-all duration-300
                                        ${isMe
                                        ? 'bg-indigo-500 text-white rounded-2xl rounded-br-sm'
                                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl rounded-bl-sm'}
                                        ${isDeleted ? 'opacity-60' : ''}
                                        ${isEditing ? 'ring-2 ring-indigo-300 ring-offset-1' : ''}
                                        ${isJump    ? 'ring-2 ring-yellow-400 ring-offset-2 scale-[1.02]' : ''}
                                    `}
                                         onDoubleClick={() => canEdit && !isEditing && startEdit(msg)}
                                    >
                                        {isDeleted ? (
                                            <span className={`text-sm italic ${isMe ? 'text-indigo-200' : 'text-slate-400 dark:text-slate-500'}`}>
                                                Повідомлення видалено
                                            </span>
                                        ) : isEditing ? (
                                            <div className="flex items-center gap-2 min-w-[200px]">
                                                <input ref={editInputRef} value={editingContent}
                                                       onChange={(e) => setEditingContent(e.target.value)}
                                                       onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitEdit(msg.id!); }}}
                                                       maxLength={4000}
                                                       className="flex-1 bg-transparent text-white placeholder-indigo-300 outline-none text-sm leading-relaxed min-w-0" />
                                                <div className="flex gap-1 shrink-0">
                                                    <button onClick={() => submitEdit(msg.id!)} className="p-1 rounded-full bg-white/20 hover:bg-white/30 text-white cursor-pointer"><Check size={12}/></button>
                                                    <button onClick={cancelEdit}               className="p-1 rounded-full bg-white/20 hover:bg-white/30 text-white cursor-pointer"><X    size={12}/></button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                {msg.replyTo && !isDeleted && <ReplyBubble reply={msg.replyTo} isMe={isMe} />}
                                                {hasFile && <FileBubble msg={msg} isMe={isMe} />}
                                                {msg.content && (
                                                    <span className={`leading-relaxed ${hasFile ? (isImage ? 'px-2 pt-1' : 'mt-1.5') : ''}`}>
                                                        {isOpen && query.trim().length >= 2
                                                            ? <HighlightText text={msg.content} query={query} />
                                                            : msg.content}
                                                    </span>
                                                )}
                                            </>
                                        )}

                                        {!isEditing && (
                                            <div className={`flex items-center gap-1 self-end mt-1 ${isImage ? 'px-2 pb-1' : ''}`}>
                                                {isEdited && (
                                                    <span className={`text-[10px] italic select-none ${isMe ? 'text-indigo-200' : 'text-slate-400 dark:text-slate-500'}`}>ред.</span>
                                                )}
                                                <span className={`text-[10px] font-medium select-none ${isMe ? 'text-indigo-200' : 'text-slate-400 dark:text-slate-500'}`}>
                                                    {formatTime(msg.createdAt)}
                                                </span>
                                                {isMe && !isDeleted && <MessageStatus msg={msg} />}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <ReactionsRow reactions={msg.reactions ?? []} currentUserId={currentUserId!}
                                              onToggle={(e) => msg.id && toggleReaction(msg.id, e)} />
                            </div>
                        </React.Fragment>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Typing indicator */}
            {typingUsers.length > 0 && (
                <div className="px-5 py-1.5 bg-slate-50 dark:bg-slate-900 border-t border-gray-100/50 dark:border-slate-800">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl rounded-bl-sm bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 text-violet-400 text-sm italic shadow-sm animate-pulse">
                        <span className="font-medium">{typingUsers.map((t) => t.nickname).join(', ')}</span>
                        {typingUsers.length === 1 ? ' друкує...' : ' друкують...'}
                    </div>
                </div>
            )}

            {uploadProgress !== null && (
                <div className="px-4 py-2.5 bg-white dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full bg-indigo-500 transition-all duration-200 rounded-full" style={{ width: `${uploadProgress}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 w-9 text-right shrink-0">{uploadProgress}%</span>
                        <button onClick={() => { abortRef.current?.abort(); setUploadProgress(null); }}
                                className="text-slate-400 hover:text-red-500 cursor-pointer"><X size={13}/></button>
                    </div>
                </div>
            )}

            {uploadError && (
                <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-100 dark:border-red-900 flex items-center justify-between">
                    <span className="text-xs text-red-500">{uploadError}</span>
                    <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600 cursor-pointer ml-3 shrink-0"><X size={13}/></button>
                </div>
            )}

            {replyTo && (
                <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border-t border-indigo-100 dark:border-indigo-900 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-0.5">
                            Відповідь на: {replyTo.sender?.nickname ?? 'повідомлення'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {replyTo.deletedAt ? 'Видалено' : replyTo.content || '📎 Файл'}
                        </p>
                    </div>
                    <button onClick={() => setReplyTo(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"><X size={14} /></button>
                </div>
            )}

            {/* ── Input ── */}
            {canPost ? (
                <form onSubmit={handleSubmit} className="p-4 bg-white dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700 flex gap-3 items-end">
                    <input ref={fileInputRef} type="file" className="hidden"
                           onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }} />
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadProgress !== null}
                            className="p-3 h-[48px] w-[48px] rounded-full text-slate-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30 flex items-center justify-center transition-all disabled:opacity-40 cursor-pointer shrink-0">
                        {uploadProgress !== null ? <Loader2 size={17} className="animate-spin" /> : <Paperclip size={17} />}
                    </button>
                    <input value={inputValue}
                           onChange={(e) => { setInputValue(e.target.value); notifyTyping(); }}
                           onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e as any); } }}
                           className="flex-1 bg-slate-50 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-400 border-transparent rounded-2xl px-5 py-3 text-gray-700 outline-none focus:bg-white dark:focus:bg-slate-600 focus:ring-4 focus:ring-violet-50 dark:focus:ring-violet-900/30 transition-all text-sm"
                           placeholder="Напишіть повідомлення..." />
                    <button type="submit" disabled={!inputValue.trim() || uploadProgress !== null}
                            className="bg-violet-500 hover:bg-violet-600 text-white p-3 h-[48px] w-[48px] rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 shrink-0 cursor-pointer">
                        <Send size={17} className="ml-0.5" />
                    </button>
                </form>
            ) : (
                <div className="p-4 bg-white dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700 text-center text-sm text-slate-400 italic">
                    Тільки адміни можуть писати в цьому каналі
                </div>
            )}
        </main>
    );
}

function MessageSquarePlaceholder() {
    return (
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" className="text-slate-200 dark:text-slate-700">
            <rect width="56" height="56" rx="28" fill="currentColor"/>
            <path d="M14 18h28M14 26h20M14 34h14" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
    );
}