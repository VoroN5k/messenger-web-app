"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/src/store/useAuthStore";
import { useSocket } from "@/src/hooks/useSocket";
import api from "@/src/lib/axios";
import { Send, User as UserIcon, LogOut } from "lucide-react";

export default function ChatPage() {
    const { user, logout } = useAuthStore();
    const socket = useSocket();
    const [users, setUsers] = useState<any[]>([]);
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [message, setMessage] = useState("");
    const [messages, setMessages] = useState<any[]>([]);

    // 1. Завантажуємо список контактів
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const res = await api.get("/users"); // Перевір цей ендпоінт на бекенді!
                setUsers(res.data.filter((u: any) => u.id !== user?.id));
            } catch (e) {
                console.error("Failed to fetch users");
            }
        };
        fetchUsers();
    }, [user]);

    // 2. Слухаємо вхідні повідомлення
    useEffect(() => {
        if (!socket) return;

        socket.on("onMessage", (newMessage) => {
            // Додаємо повідомлення в список, якщо воно від обраного юзера
            setMessages((prev) => [...prev, newMessage]);
        });

        return () => { socket.off("onMessage"); };
    }, [socket]);

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!message || !selectedUser || !socket) return;

        const messageData = {
            toId: selectedUser.id,
            text: message,
        };

        // Відправка через сокет
        socket.emit("sendMessage", messageData);

        // Додаємо собі в чат візуально (опціонально, бо сервер може повернути підтвердження)
        setMessages((prev) => [...prev, {
            text: message,
            senderId: user.id,
            createdAt: new Date().toISOString()
        }]);

        setMessage("");
    };

    return (
        <div className="flex h-screen bg-gray-100">
            {/* SIDEBAR */}
            <aside className="w-1/4 bg-white border-r border-gray-200 flex flex-col">
                <div className="p-4 bg-blue-600 text-white flex justify-between items-center">
                    <span className="font-bold">{user?.nickname}</span>
                    <button onClick={logout}><LogOut size={18}/></button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {users.map((u) => (
                        <div
                            key={u.id}
                            onClick={() => setSelectedUser(u)}
                            className={`p-4 border-b cursor-pointer hover:bg-gray-50 flex items-center gap-3 ${selectedUser?.id === u.id ? 'bg-blue-50' : ''}`}
                        >
                            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                                <UserIcon size={20} className="text-gray-500" />
                            </div>
                            <div>
                                <p className="font-medium">{u.nickname}</p>
                                <p className="text-xs text-gray-400">{u.isOnline ? 'online' : 'offline'}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </aside>

            {/* MAIN CHAT */}
            <main className="flex-1 flex flex-col">
                {selectedUser ? (
                    <>
                        <header className="p-4 bg-white border-b font-bold">
                            Чат з {selectedUser.nickname}
                        </header>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                            {messages.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.senderId === user.id ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`p-3 rounded-lg max-w-xs ${msg.senderId === user.id ? 'bg-blue-500 text-white' : 'bg-white border'}`}>
                                        {msg.text}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <form onSubmit={handleSendMessage} className="p-4 bg-white flex gap-2">
                            <input
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                className="flex-1 border rounded-full px-4 outline-none focus:border-blue-500"
                                placeholder="Напишіть повідомлення..."
                            />
                            <button className="bg-blue-600 text-white p-2 rounded-full"><Send size={20}/></button>
                        </form>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-400">
                        Оберіть когось, щоб почати спілкування
                    </div>
                )}
            </main>
        </div>
    );
}