import React, { useState, useRef, useEffect, UIEvent } from 'react';
import { Send, Loader2, Trash2, Pencil, Check, X, SmilePlus } from 'lucide-react';
import { useChat } from '@/src/hooks/useChat';
import { User } from '@/src/types/auth.types';
import { Message, Reaction } from '@/src/types/chat.types';
import { Socket } from 'socket.io-client';
import { EmojiPicker } from './EmojiPicker';

interface ChatAreaProps {
    currentUserId: string | number;
    selectedUser: User | null;
    socket: Socket | null;
}

const EDIT_WINDOW_MS = 15 * 60 * 1000;

const formatTime = (d: string | Date) =>
    new Date(d).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

const formatDateSeparator = (d: string | Date) => {
    const date = new Date(d);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Сьогодні';
    if (date.toDateString() === yesterday.toDateString()) return 'Вчора';
    return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
};

// ─── Статус повідомлення ──────────────────────────────────────────────────────
const CHECK_PATH = 'M1.5 5L5 8.5L12.5 1';

const MessageStatus = ({ message }: { message: Message }) => {
    const isPending = !message.id;
    const isRead = message.isRead === true;
    const color = isRead ? '#a5b4fc' : 'rgba(255,255,255,0.5)';

    if (isPending) {
        return (
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-label="Надсилається" className="inline-block shrink-0">
                <path d={CHECK_PATH} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }
    return (
        <svg width="19" height="10" viewBox="0 0 19 10" fill="none" aria-label={isRead ? 'Прочитано' : 'Доставлено'} className="inline-block shrink-0">
            <path d={CHECK_PATH} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5.5 5L9 8.5L16.5 1" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};

// ─── Реакції під повідомленням ─────────────────────────────────────────────────
interface ReactionsRowProps {
    reactions: Reaction[];
    currentUserId: string | number;
    onToggle: (emoji: string) => void;
}

const ReactionsRow = ({ reactions, currentUserId, onToggle }: ReactionsRowProps) => {
    if (!reactions || reactions.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {reactions.map((r) => {
                const iMine = r.userIds.some((id) => String(id) === String(currentUserId));
                return (
                    <button
                        key={r.emoji}
                        onClick={() => onToggle(r.emoji)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all cursor-pointer select-none
                            ${iMine
                            ? 'bg-indigo-100 border-indigo-300 text-indigo-700 hover:bg-indigo-200'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                        title={iMine ? 'Натисніть, щоб прибрати реакцію' : 'Натисніть, щоб додати реакцію'}
                    >
                        <span className="text-sm leading-none">{r.emoji}</span>
                        <span>{r.count}</span>
                    </button>
                );
            })}
        </div>
    );
};
// ─────────────────────────────────────────────────────────────────────────────

export default function ChatArea({ currentUserId, selectedUser, socket }: ChatAreaProps) {
    const [inputValue, setInputValue] = useState('');
    const [hoveredMsgKey, setHoveredMsgKey] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
    const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
    const [editingContent, setEditingContent] = useState('');
    const [pickerMsgKey, setPickerMsgKey] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const lastMessageIdRef = useRef<string | number | null>(null);
    const editInputRef = useRef<HTMLInputElement>(null);

    const { messages, sendMessage, deleteMessage, editMessage, toggleReaction, isTyping, notifyTyping, loadMoreMessages, hasMore, isLoadingMore } =
        useChat(selectedUser?.id, currentUserId, socket);

    // Фокус на edit input
    useEffect(() => {
        if (editingMessageId !== null) {
            editInputRef.current?.focus();
            const len = editInputRef.current?.value.length ?? 0;
            editInputRef.current?.setSelectionRange(len, len);
        }
    }, [editingMessageId]);

    // Scroll to bottom
    useEffect(() => {
        if (messages.length === 0) return;
        const last = messages[messages.length - 1];
        const lastId = last.id ?? (last.createdAt as string);
        if (lastId !== lastMessageIdRef.current || isTyping) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            lastMessageIdRef.current = lastId;
        }
    }, [messages, isTyping]);

    // Escape закриває edit
    useEffect(() => {
        if (editingMessageId === null) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelEdit(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [editingMessageId]);

    // Click-outside закриває confirm delete
    useEffect(() => {
        if (confirmDeleteId === null) return;
        const handler = () => setConfirmDeleteId(null);
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, [confirmDeleteId]);

    const handleScroll = async (e: UIEvent<HTMLDivElement>) => {
        const t = e.currentTarget;
        if (t.scrollTop <= 1 && hasMore && !isLoadingMore) {
            const prev = t.scrollHeight;
            await loadMoreMessages();
            requestAnimationFrame(() => { t.scrollTop = t.scrollHeight - prev; });
        }
    };

    // ─── Handlers ────────────────────────────────────────────────────────────────
    const handleSend = (e: React.FormEvent) => { e.preventDefault(); sendMessage(inputValue); setInputValue(''); };

    const handleDeleteClick = (e: React.MouseEvent, id: number) => { e.stopPropagation(); setConfirmDeleteId(id); };
    const handleConfirmDelete = (e: React.MouseEvent, id: number) => { e.stopPropagation(); deleteMessage(id); setConfirmDeleteId(null); };

    const startEdit = (msg: Message) => {
        if (!msg.id || msg.deletedAt) return;
        if (Date.now() - new Date(msg.createdAt).getTime() > EDIT_WINDOW_MS) return;
        setEditingMessageId(msg.id);
        setEditingContent(msg.content);
        setConfirmDeleteId(null);
        setPickerMsgKey(null);
    };
    const cancelEdit = () => { setEditingMessageId(null); setEditingContent(''); };
    const submitEdit = (id: number) => {
        if (editingContent.trim()) { editMessage(id, editingContent.trim()); cancelEdit(); }
    };

    const handleTogglePicker = (msgKey: string) => {
        setPickerMsgKey((prev) => (prev === msgKey ? null : msgKey));
    };
    // ─────────────────────────────────────────────────────────────────────────────

    if (!selectedUser) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-50 text-slate-400 font-medium">
                Оберіть когось, щоб почати спілкування
            </div>
        );
    }

    return (
        <main className="flex-1 flex flex-col bg-slate-50">
            <header className="px-6 py-4 bg-white border-b border-gray-100 flex items-center shadow-sm z-10">
                <div>
                    <h2 className="font-semibold text-gray-800 text-lg leading-tight">{selectedUser.nickname}</h2>
                    <p className={`text-xs font-medium mt-0.5 ${selectedUser.isOnline ? 'text-violet-500' : 'text-slate-400'}`}>
                        {selectedUser.isOnline ? 'В мережі' : 'Офлайн'}
                    </p>
                </div>
            </header>

            <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-6 py-6 space-y-1">
                {isLoadingMore && (
                    <div className="flex justify-center py-2">
                        <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                    </div>
                )}

                {messages.map((msg: Message, idx: number) => {
                    const isMe = String(msg.senderId) === String(currentUserId);
                    const isDeleted = !!msg.deletedAt;
                    const isEdited = !!msg.editedAt && !isDeleted;
                    const msgKey = msg.id ? `msg-${msg.id}` : `temp-${idx}-${msg.createdAt}`;
                    const isHovered = hoveredMsgKey === msgKey;
                    const isConfirming = msg.id !== undefined && confirmDeleteId === msg.id;
                    const isEditing = msg.id !== undefined && editingMessageId === msg.id;
                    const isPickerOpen = pickerMsgKey === msgKey;

                    const canEdit = isMe && !isDeleted && !!msg.id &&
                        Date.now() - new Date(msg.createdAt).getTime() <= EDIT_WINDOW_MS;

                    const showActions = isHovered || isConfirming || isPickerOpen;

                    const showDateSeparator =
                        idx === 0 ||
                        new Date(msg.createdAt).toDateString() !== new Date(messages[idx - 1].createdAt).toDateString();

                    const reactions = msg.reactions ?? [];

                    return (
                        <React.Fragment key={msgKey}>
                            {showDateSeparator && (
                                <div className="flex justify-center my-4">
                                    <span className="bg-violet-100/50 text-violet-600 font-medium text-xs px-4 py-1.5 rounded-full">
                                        {formatDateSeparator(msg.createdAt)}
                                    </span>
                                </div>
                            )}

                            {/* Зовнішня обгортка: вирівнювання + відступи */}
                            <div
                                className={`flex flex-col mb-1 ${isMe ? 'items-end' : 'items-start'}`}
                                onMouseEnter={() => setHoveredMsgKey(msgKey)}
                                onMouseLeave={() => setHoveredMsgKey(null)}
                            >
                                {/* Рядок: кнопки дій + бульбашка */}
                                <div className={`flex items-end gap-2 ${isMe ? 'flex-row' : 'flex-row-reverse'}`}>

                                    {/* ── Панель дій (для всіх повідомлень з id) ── */}
                                    {!isDeleted && msg.id && !isEditing && (
                                        <div className={`flex items-center gap-1 transition-opacity duration-150
                                            ${showActions ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>

                                            {/* Кнопка emoji-реакцій — для всіх повідомлень */}
                                            <div className="relative">
                                                <button
                                                    onClick={() => handleTogglePicker(msgKey)}
                                                    className={`p-1.5 rounded-full transition-all cursor-pointer
                                                        ${isPickerOpen
                                                        ? 'text-indigo-500 bg-indigo-50'
                                                        : 'text-slate-400 hover:text-indigo-500 hover:bg-indigo-50'
                                                    }`}
                                                    title="Додати реакцію"
                                                >
                                                    <SmilePlus size={14} />
                                                </button>

                                                {isPickerOpen && (
                                                    <EmojiPicker
                                                        align={isMe ? 'right' : 'left'}
                                                        onSelect={(emoji) => {
                                                            toggleReaction(msg.id!, emoji);
                                                        }}
                                                        onClose={() => setPickerMsgKey(null)}
                                                    />
                                                )}
                                            </div>

                                            {/* Edit + Delete — тільки для власних */}
                                            {isMe && (
                                                <>
                                                    {isConfirming ? (
                                                        <div
                                                            className="flex items-center gap-1.5 bg-white border border-red-100 rounded-xl px-2.5 py-1.5 shadow-md"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <span className="text-xs text-slate-500 whitespace-nowrap">Видалити?</span>
                                                            <button
                                                                onClick={(e) => handleConfirmDelete(e, msg.id!)}
                                                                className="text-xs font-semibold text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                                                            >
                                                                Так
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                                                                className="text-xs font-semibold text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                                                            >
                                                                Ні
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {canEdit && (
                                                                <button
                                                                    onClick={() => startEdit(msg)}
                                                                    className="p-1.5 rounded-full text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 transition-all cursor-pointer"
                                                                    title="Редагувати"
                                                                >
                                                                    <Pencil size={14} />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={(e) => handleDeleteClick(e, msg.id!)}
                                                                className="p-1.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                                                                title="Видалити"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* ── Бульбашка повідомлення ── */}
                                    <div
                                        className={`px-4 py-2.5 max-w-md break-words flex flex-col shadow-sm
                                            ${isMe
                                            ? 'bg-indigo-500 text-white rounded-2xl rounded-br-sm'
                                            : 'bg-white border border-slate-200 text-slate-700 rounded-2xl rounded-bl-sm'
                                        }
                                            ${isDeleted ? 'opacity-60' : ''}
                                            ${isEditing ? 'ring-2 ring-indigo-300 ring-offset-1' : ''}`}
                                        onDoubleClick={() => canEdit && !isEditing && startEdit(msg)}
                                    >
                                        {isDeleted ? (
                                            <span className={`text-sm italic ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
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
                                                    placeholder="Введіть текст..."
                                                />
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button onClick={() => submitEdit(msg.id!)} className="p-1 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer" title="Зберегти (Enter)">
                                                        <Check size={13} />
                                                    </button>
                                                    <button onClick={cancelEdit} className="p-1 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer" title="Скасувати (Esc)">
                                                        <X size={13} />
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="leading-relaxed">{msg.content}</span>
                                        )}

                                        {/* Час + (ред.) + статус */}
                                        {!isEditing && (
                                            <div className="flex items-center gap-1 self-end mt-1">
                                                {isEdited && (
                                                    <span className={`text-[10px] italic select-none leading-none ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                        ред.
                                                    </span>
                                                )}
                                                <span className={`text-[10px] font-medium select-none leading-none ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                    {formatTime(msg.createdAt)}
                                                </span>
                                                {isMe && !isDeleted && <MessageStatus message={msg} />}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* ── Реакції під бульбашкою ── */}
                                <ReactionsRow
                                    reactions={reactions}
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

            <form onSubmit={handleSend} className="p-4 bg-white border-t border-gray-100 flex gap-3 items-end">
                <input
                    value={inputValue}
                    onChange={(e) => { setInputValue(e.target.value); notifyTyping(); }}
                    className="flex-1 bg-slate-50 border-transparent rounded-2xl px-5 py-3 text-gray-700 outline-none focus:bg-white focus:border-violet-200 focus:ring-4 focus:ring-violet-50 transition-all"
                    placeholder="Напишіть повідомлення..."
                />
                <button
                    type="submit"
                    disabled={!inputValue.trim()}
                    className="bg-violet-500 hover:bg-violet-600 text-white p-3 h-[50px] w-[50px] rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 shrink-0 cursor-pointer"
                >
                    <Send size={18} className="ml-0.5" />
                </button>
            </form>
        </main>
    );
}