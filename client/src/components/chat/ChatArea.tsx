import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { useChat } from "@/src/hooks/useChat";

interface ChatAreaProps {
    currentUserId: string | number;
    selectedUser: any;
    socket: any;
}

export default function ChatArea({ currentUserId, selectedUser, socket }: ChatAreaProps) {
    const [inputValue, setInputValue] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const { messages, sendMessage, isTyping, notifyTyping } = useChat(selectedUser?.id, currentUserId, socket);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessage(inputValue);
        setInputValue(""); // Очищаємо інпут
    };

    // НОВИЙ ОБРОБНИК: реагує на кожну букву
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

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                {messages.map((msg, idx) => {
                    const isMe = String(msg.senderId) === String(currentUserId);
                    return (
                        <div key={idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>

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
                <button type="submit" className="bg-blue-600 text-white p-2 rounded-full">
                    <Send size={20}/>
                </button>
            </form>
        </main>
    );
}