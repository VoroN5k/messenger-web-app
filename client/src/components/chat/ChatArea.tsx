import { useState, useRef, useEffect, UIEvent } from "react";
import { Send, Loader2 } from "lucide-react"; // Додав Loader2 для спінера
import { useChat } from "@/src/hooks/useChat";
import { User } from "@/src/types/auth.types";
import { Socket } from "socket.io-client";

interface ChatAreaProps {
    currentUserId: string | number;
    selectedUser: User | null;
    socket: Socket | null;
}

export default function ChatArea({ currentUserId, selectedUser, socket }: ChatAreaProps) {
    const [inputValue, setInputValue] = useState("");

    // 1. ДВА РЕФИ: один для низу чату, інший для самого контейнера зі скролом
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // 2. ДІСТАЄМО НОВІ ФУНКЦІЇ З ХУКА (loadMoreMessages, hasMore, isLoadingMore)
    const {
        messages, sendMessage, isTyping, notifyTyping,
        loadMoreMessages, hasMore, isLoadingMore
    } = useChat(selectedUser?.id, currentUserId, socket);

    // Скролимо вниз ТІЛЬКИ коли не підвантажуємо стару історію
    useEffect(() => {
        if (!isLoadingMore) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isTyping, isLoadingMore]);

    const handleScroll = async (e: UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;

        // Якщо доскролили до верху (scrollTop <= 1)
        if (target.scrollTop <= 1 && hasMore && !isLoadingMore) {
            // Запам'ятовуємо висоту до завантаження
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
            <div className="flex-1 flex items-center justify-center text-gray-400">
                Оберіть когось, щоб почати спілкування
            </div>
        );
    }

    return (
        <main className="flex-1 flex flex-col">
            <header className="p-4 bg-white border-b font-bold">
                Чат з {selectedUser.nickname}
            </header>

            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50"
            >
                {isLoadingMore && (
                    <div className="flex justify-center py-2">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                    </div>
                )}

                {messages.map((msg, idx) => {
                    const isMe = String(msg.senderId) === String(currentUserId);
                    return (
                        <div key={msg.id || idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div className={`p-3 rounded-lg max-w-xs break-words ${isMe ? 'bg-blue-500 text-white' : 'bg-white border'}`}>
                                {msg.content}
                            </div>
                        </div>
                    );
                })}

                {isTyping && (
                    <div className="flex justify-start animate-pulse">
                        <div className="p-3 rounded-lg bg-gray-200 text-gray-500 text-sm italic shadow-sm">
                            {selectedUser.nickname} друкує...
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-4 bg-white flex gap-2">
                <input
                    value={inputValue}
                    onChange={handleInputChange}
                    className="flex-1 border rounded-full px-4 outline-none focus:border-blue-500"
                    placeholder="Напишіть повідомлення..."
                />
                <button type="submit" className="bg-blue-600 text-white p-2 rounded-full disabled:opacity-50" disabled={!inputValue.trim()}>
                    <Send size={20}/>
                </button>
            </form>
        </main>
    );
}