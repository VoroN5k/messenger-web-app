import React, { useState, useRef, useEffect, UIEvent } from "react";
import { Send, Loader2 } from "lucide-react";
import { useChat } from "@/src/hooks/useChat";
import { User } from "@/src/types/auth.types";
import { Message } from "@/src/types/chat.types";
import { Socket } from "socket.io-client";

interface ChatAreaProps {
    currentUserId: string | number;
    selectedUser: User | null;
    socket: Socket | null;
}

const formatTime = (dateString: string | Date) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
};

const formatDateSeparator = (dateString: string | Date) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return "Сьогодні";
    } else if (date.toDateString() === yesterday.toDateString()) {
        return "Вчора";
    } else {
        return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
    }
};

export default function ChatArea({ currentUserId, selectedUser, socket }: ChatAreaProps) {
    const [inputValue, setInputValue] = useState("");

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const lastMessageIdRef = useRef<string | number | null>(null);

    const {
        messages, sendMessage, isTyping, notifyTyping,
        loadMoreMessages, hasMore, isLoadingMore
    } = useChat(selectedUser?.id, currentUserId, socket);

    useEffect(() => {
        if (messages.length === 0) return;

        const lastMessage = messages[messages.length - 1];
        const lastMessageId = lastMessage.id || (lastMessage.createdAt as string);

        if (lastMessageId !== lastMessageIdRef.current || isTyping) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            lastMessageIdRef.current = lastMessageId;
        }

    }, [messages, isTyping]);

    const handleScroll = async (e: UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        if (target.scrollTop <= 1 && hasMore && !isLoadingMore) {
            const previousScrollHeight = target.scrollHeight;
            await loadMoreMessages();
            requestAnimationFrame(() => {
                const newScrollHeight = target.scrollHeight;
                target.scrollTop = newScrollHeight - previousScrollHeight;
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

    if (!selectedUser) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-50 text-slate-400 font-medium">
                Оберіть когось, щоб почати спілкування
            </div>
        );
    }

    return (
        <main className="flex-1 flex flex-col bg-slate-50">
            {/* Шапка чату */}
            <header className="px-6 py-4 bg-white border-b border-gray-100 flex items-center justify-between shadow-sm z-10">
                <div>
                    <h2 className="font-semibold text-gray-800 text-lg leading-tight">{selectedUser.nickname}</h2>
                    <p className={`text-xs font-medium mt-0.5 ${selectedUser.isOnline ? 'text-violet-500' : 'text-slate-400'}`}>
                        {selectedUser.isOnline ? 'В мережі' : 'Офлайн'}
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

                    const showDateSeparator = idx === 0 ||
                        new Date(msg.createdAt).toDateString() !== new Date(messages[idx - 1].createdAt).toDateString();

                    return (
                        <React.Fragment key={msg.id ? `msg-${msg.id}` : `temp-${idx}-${msg.createdAt}`}>
                            {showDateSeparator && (
                                <div className="flex justify-center my-6">
                                    <span className="bg-violet-100/50 text-violet-600 font-medium text-xs px-4 py-1.5 rounded-full">
                                        {formatDateSeparator(msg.createdAt)}
                                    </span>
                                </div>
                            )}

                            <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`px-4 py-2.5 max-w-md break-words flex flex-col shadow-sm
                                    ${isMe
                                    ? 'bg-indigo-500 text-white rounded-2xl rounded-br-sm'
                                    : 'bg-white border border-slate-200 text-slate-700 rounded-2xl rounded-bl-sm'}`}
                                >
                                    <span className="leading-relaxed">{msg.content}</span>

                                    <span className={`text-[10px] self-end mt-1 font-medium select-none
                                        ${isMe ? 'text-indigo-100' : 'text-slate-400'}`}>
                                        {formatTime(msg.createdAt)}
                                    </span>
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