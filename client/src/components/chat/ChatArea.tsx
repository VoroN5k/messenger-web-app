import React, { useState, useRef, useEffect, UIEvent } from "react";
import { Send, Loader2, Trash2, Pencil, Check, X } from "lucide-react";
import { useChat } from "@/src/hooks/useChat";
import { User } from "@/src/types/auth.types";
import { Message } from "@/src/types/chat.types";
import { Socket } from "socket.io-client";

interface ChatAreaProps {
    currentUserId: string | number;
    selectedUser: User | null;
    socket: Socket | null;
}

const EDIT_WINDOW_MS = 15 * 60 * 1000;

const formatTime = (dateString: string | Date) => {
    return new Date(dateString).toLocaleTimeString("uk-UA", {
        hour: "2-digit",
        minute: "2-digit",
    });
};

const formatDateSeparator = (dateString: string | Date) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Сьогодні";
    if (date.toDateString() === yesterday.toDateString()) return "Вчора";
    return date.toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
};

// ─── Статус повідомлення ─────────────────────────────────────────────────────
const CHECK_PATH = "M1.5 5L5 8.5L12.5 1";

const MessageStatus = ({ message }: { message: Message }) => {
    const isPending = !message.id;
    const isRead = message.isRead === true;
    const color = isRead ? "#a5b4fc" : "rgba(255,255,255,0.5)";

    if (isPending) {
        return (
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-label="Надсилається" className="inline-block shrink-0">
                <path d={CHECK_PATH} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }

    return (
        <svg width="19" height="10" viewBox="0 0 19 10" fill="none" aria-label={isRead ? "Прочитано" : "Доставлено"} className="inline-block shrink-0">
            <path d={CHECK_PATH} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5.5 5L9 8.5L16.5 1" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};
// ─────────────────────────────────────────────────────────────────────────────

export default function ChatArea({ currentUserId, selectedUser, socket }: ChatAreaProps) {
    const [inputValue, setInputValue] = useState("");
    const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

    // Стан редагування
    const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
    const [editingContent, setEditingContent] = useState("");
    const editInputRef = useRef<HTMLInputElement>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const lastMessageIdRef = useRef<string | number | null>(null);

    const {
        messages,
        sendMessage,
        deleteMessage,
        editMessage,
        isTyping,
        notifyTyping,
        loadMoreMessages,
        hasMore,
        isLoadingMore,
    } = useChat(selectedUser?.id, currentUserId, socket);

    // Фокус на поле редагування при відкритті
    useEffect(() => {
        if (editingMessageId !== null) {
            editInputRef.current?.focus();
            // Курсор в кінець рядка
            const len = editInputRef.current?.value.length ?? 0;
            editInputRef.current?.setSelectionRange(len, len);
        }
    }, [editingMessageId]);

    // Скрол до низу при нових повідомленнях
    useEffect(() => {
        if (messages.length === 0) return;
        const lastMessage = messages[messages.length - 1];
        const lastMessageId = lastMessage.id ?? (lastMessage.createdAt as string);

        if (lastMessageId !== lastMessageIdRef.current || isTyping) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            lastMessageIdRef.current = lastMessageId;
        }
    }, [messages, isTyping]);

    // Закриваємо підтвердження видалення кліком поза ним
    useEffect(() => {
        if (confirmDeleteId === null) return;
        const handler = () => setConfirmDeleteId(null);
        document.addEventListener("click", handler);
        return () => document.removeEventListener("click", handler);
    }, [confirmDeleteId]);

    // Скасування редагування по Escape
    useEffect(() => {
        if (editingMessageId === null) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") cancelEdit();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [editingMessageId]);

    const handleScroll = async (e: UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        if (target.scrollTop <= 1 && hasMore && !isLoadingMore) {
            const previousScrollHeight = target.scrollHeight;
            await loadMoreMessages();
            requestAnimationFrame(() => {
                target.scrollTop = target.scrollHeight - previousScrollHeight;
            });
        }
    };

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessage(inputValue);
        setInputValue("");
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
        notifyTyping();
    };

    // ─── Delete ───────────────────────────────────────────────────────────────
    const handleDeleteClick = (e: React.MouseEvent, messageId: number) => {
        e.stopPropagation();
        setConfirmDeleteId(messageId);
    };

    const handleConfirmDelete = (e: React.MouseEvent, messageId: number) => {
        e.stopPropagation();
        deleteMessage(messageId);
        setConfirmDeleteId(null);
    };

    // ─── Edit ─────────────────────────────────────────────────────────────────
    const startEdit = (msg: Message) => {
        if (!msg.id || msg.deletedAt) return;

        // Перевіряємо вікно на клієнті (доп. перевірка є на сервері)
        const ageMs = Date.now() - new Date(msg.createdAt).getTime();
        if (ageMs > EDIT_WINDOW_MS) return;

        setEditingMessageId(msg.id);
        setEditingContent(msg.content);
        setConfirmDeleteId(null); // закрити підтвердження видалення якщо відкрите
    };

    const cancelEdit = () => {
        setEditingMessageId(null);
        setEditingContent("");
    };

    const submitEdit = (messageId: number) => {
        const trimmed = editingContent.trim();
        if (!trimmed) return;

        editMessage(messageId, trimmed);
        cancelEdit();
    };

    const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, messageId: number) => {
        if (e.key === "Enter") {
            e.preventDefault();
            submitEdit(messageId);
        }
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
        <main className="flex-1 flex flex-col bg-slate-50">
            <header className="px-6 py-4 bg-white border-b border-gray-100 flex items-center justify-between shadow-sm z-10">
                <div>
                    <h2 className="font-semibold text-gray-800 text-lg leading-tight">
                        {selectedUser.nickname}
                    </h2>
                    <p className={`text-xs font-medium mt-0.5 ${selectedUser.isOnline ? "text-violet-500" : "text-slate-400"}`}>
                        {selectedUser.isOnline ? "В мережі" : "Офлайн"}
                    </p>
                </div>
            </header>

            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-6 py-6 space-y-6"
            >
                {isLoadingMore && (
                    <div className="flex justify-center py-2">
                        <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                    </div>
                )}

                {messages.map((msg: Message, idx: number) => {
                    const isMe = String(msg.senderId) === String(currentUserId);
                    const isDeleted = !!msg.deletedAt;
                    const isEdited = !!msg.updatedAt && !isDeleted;
                    const msgKey = msg.id ? `msg-${msg.id}` : `temp-${idx}-${msg.createdAt}`;
                    const isHovered = hoveredMessageId === msgKey;
                    const isConfirming = msg.id !== undefined && confirmDeleteId === msg.id;
                    const isEditing = msg.id !== undefined && editingMessageId === msg.id;

                    // Чи дозволено редагувати (15 хв вікно, тільки свої, не видалені)
                    const ageMs = Date.now() - new Date(msg.createdAt).getTime();
                    const canEdit = isMe && !isDeleted && !!msg.id && ageMs <= EDIT_WINDOW_MS;

                    const showDateSeparator =
                        idx === 0 ||
                        new Date(msg.createdAt).toDateString() !==
                        new Date(messages[idx - 1].createdAt).toDateString();

                    return (
                        <React.Fragment key={msgKey}>
                            {showDateSeparator && (
                                <div className="flex justify-center my-6">
                                    <span className="bg-violet-100/50 text-violet-600 font-medium text-xs px-4 py-1.5 rounded-full">
                                        {formatDateSeparator(msg.createdAt)}
                                    </span>
                                </div>
                            )}

                            <div
                                className={`flex items-end gap-2 ${isMe ? "justify-end" : "justify-start"}`}
                                onMouseEnter={() => setHoveredMessageId(msgKey)}
                                onMouseLeave={() => setHoveredMessageId(null)}
                                onDoubleClick={() => canEdit && startEdit(msg)}
                            >
                                {/* ── Панель дій (delete + edit) ── */}
                                {isMe && !isDeleted && msg.id && !isEditing && (
                                    <div className={`flex items-center gap-1 transition-opacity duration-150 ${isHovered || isConfirming ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
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
                                                        title="Редагувати (або двічі клацніть)"
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => handleDeleteClick(e, msg.id!)}
                                                    className="p-1.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                                                    title="Видалити повідомлення"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* ── Бульбашка повідомлення ── */}
                                <div
                                    className={`px-4 py-2.5 max-w-md break-words flex flex-col shadow-sm
                                        ${isMe
                                        ? "bg-indigo-500 text-white rounded-2xl rounded-br-sm"
                                        : "bg-white border border-slate-200 text-slate-700 rounded-2xl rounded-bl-sm"
                                    }
                                        ${isDeleted ? "opacity-60" : ""}
                                        ${isEditing ? "ring-2 ring-indigo-300 ring-offset-1" : ""}
                                    `}
                                >
                                    {isDeleted ? (
                                        <span className={`text-sm italic ${isMe ? "text-indigo-200" : "text-slate-400"}`}>
                                            Повідомлення видалено
                                        </span>
                                    ) : isEditing ? (
                                        // ── Inline edit input ──
                                        <div className="flex items-center gap-2 min-w-[200px]">
                                            <input
                                                ref={editInputRef}
                                                value={editingContent}
                                                onChange={(e) => setEditingContent(e.target.value)}
                                                onKeyDown={(e) => handleEditKeyDown(e, msg.id!)}
                                                maxLength={4000}
                                                className="flex-1 bg-transparent text-white placeholder-indigo-300 outline-none text-sm leading-relaxed min-w-0"
                                                placeholder="Введіть текст..."
                                            />
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    onClick={() => submitEdit(msg.id!)}
                                                    className="p-1 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer"
                                                    title="Зберегти (Enter)"
                                                >
                                                    <Check size={13} />
                                                </button>
                                                <button
                                                    onClick={cancelEdit}
                                                    className="p-1 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer"
                                                    title="Скасувати (Esc)"
                                                >
                                                    <X size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="leading-relaxed">{msg.content}</span>
                                    )}

                                    {/* ── Час + мітка "(ред.)" + статус ── */}
                                    {!isEditing && (
                                        <div className="flex items-center gap-1 self-end mt-1">
                                            {isEdited && (
                                                <span className={`text-[10px] select-none leading-none italic ${isMe ? "text-indigo-200" : "text-slate-400"}`}>
                                                    ред.
                                                </span>
                                            )}
                                            <span className={`text-[10px] font-medium select-none leading-none ${isMe ? "text-indigo-200" : "text-slate-400"}`}>
                                                {formatTime(msg.createdAt)}
                                            </span>
                                            {isMe && !isDeleted && <MessageStatus message={msg} />}
                                        </div>
                                    )}
                                </div>
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

            <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-gray-100 flex gap-3 items-end">
                <input
                    value={inputValue}
                    onChange={handleInputChange}
                    className="flex-1 bg-slate-50 border-transparent rounded-2xl px-5 py-3 text-gray-700 outline-none focus:bg-white focus:border-violet-200 focus:ring-4 focus:ring-violet-50 transition-all"
                    placeholder="Напишіть повідомлення..."
                />
                <button
                    type="submit"
                    className="bg-violet-500 hover:bg-violet-600 text-white p-3 h-[50px] w-[50px] rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 shrink-0 cursor-pointer"
                    disabled={!inputValue.trim()}
                >
                    <Send size={18} className="ml-0.5" />
                </button>
            </form>
        </main>
    );
}