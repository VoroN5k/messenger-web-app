"use client";

import { useEffect, useState, useRef } from "react";
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


    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {

        // Zustand hydration
        if (user !== undefined) {
            setIsLoaded(true);
        }
    }, [user]);

    const currentUserId = user?.id || user?.sub;


    useEffect(() => {
        console.log("DEBUG: Повна структура юзера:", JSON.stringify(user, null, 2));

        console.log("DEBUG: useEffect для fetchUsers запущено");
        console.log("DEBUG: isLoaded:", isLoaded);
        console.log("DEBUG: currentUserId:", currentUserId);
        if (!isLoaded || !currentUserId) return;

        const fetchUsers = async () => {
            try {
                console.log("DEBUG: Виконую запит до /users...");
                const res = await api.get("/users");
                console.log("DEBUG: Відповідь від сервера:", res.data);
                setUsers(res.data.filter((u: any) => String(u.id) !== String(currentUserId)));
            } catch (e) {
                console.error("Failed to fetch users");
            }
        };

        fetchUsers();
    }, [isLoaded, currentUserId]);


    useEffect(() => {
        if (!socket) return;

        socket.on("onMessage", (newMessage) => {
            setMessages((prev) => [...prev, newMessage]);
        });

        socket.on("auth_error", (error) => {
            console.warn("Помилка авторизації WebSockets:", error);

            api.get('/auth/sessions').catch(() => {
            });
        });

        socket.on ("connect_error", (err) => {
            if (err.message.includes("jwt") || err.message.includes('Unauthorized')) {
                api.get('/auth/sessions').catch(() => {})
            }
        });

        return () => {
            socket.off("onMessage");
            socket.off("auth_error");
            socket.off("connect_error");
        };
    }, [socket]);

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim() || !selectedUser || !socket) return;

        const messageData = {
            toId: selectedUser.id,
            content: message, // Використовуємо content згідно з вашою структурою БД
        };

        socket.emit("sendMessage", messageData);


        setMessages((prev) => [...prev, {
            content: message,
            senderId: currentUserId,
            createdAt: new Date().toISOString()
        }]);

        setMessage("");
    };

    useEffect(() => {
        const fetchHistory = async () => {
            if (!selectedUser?.id) return;

            try {
                const res = await api.get(`/chat/history/${selectedUser.id}`);
                setMessages(res.data);
            } catch (error) {
                console.error("Failed to fetch chat history");
            }
        };

        fetchHistory();
    }, [selectedUser?.id]);

    const handleLogout = async () => {
        try {
            await api.post("/auth/logout");
        } catch (error) {
            console.error("Failed to logout", error);
        } finally {
            logout();

            localStorage.removeItem('auth-storage');

            window.location.href = '/auth/login'
        }
    };

    return (
        <div className="flex h-screen bg-gray-100">
            {/* SIDEBAR */}
            <aside className="w-1/4 bg-white border-r border-gray-200 flex flex-col">
                <div className="p-4 bg-blue-600 text-white flex justify-between items-center">
                    <span className="font-bold truncate">{user?.nickname}</span>
                    <button onClick={handleLogout} className="hover:text-gray-300 transition-colors">
                        <LogOut size={18}/>
                    </button>
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
                            {messages.map((msg, idx) => {
                                // Порівнюємо ID як рядки для надійності
                                const isMe = String(msg.senderId) === String(currentUserId);
                                return (
                                    <div key={idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`p-3 rounded-lg max-w-xs ${isMe ? 'bg-blue-500 text-white' : 'bg-white border'}`}>
                                            {/* ВИВІД КОНТЕНТУ З ПОЛЯ CONTENT */}
                                            {msg.content}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <form onSubmit={handleSendMessage} className="p-4 bg-white flex gap-2">
                            <input
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                className="flex-1 border rounded-full px-4 outline-none focus:border-blue-500"
                                placeholder="Напишіть повідомлення..."
                            />
                            <button type="submit" className="bg-blue-600 text-white p-2 rounded-full"><Send size={20}/></button>
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