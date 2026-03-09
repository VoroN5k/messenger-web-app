"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/src/store/useAuthStore";
import { useSocket } from "@/src/hooks/useSocket";
import { useUsers } from "@/src/hooks/useUsers";
import api from "@/src/lib/axios";
import Sidebar from "@/src/components/chat/SideBar";
import ChatArea from "@/src/components/chat/ChatArea";

export default function ChatPage() {
    const { user, logout } = useAuthStore();
    const socket = useSocket();

    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    const currentUserId = user?.id || user?.sub;


    useEffect(() => {
        if (user !== undefined) setIsLoaded(true);
    }, [user]);


    const { users } = useUsers(currentUserId, isLoaded);


    useEffect(() => {
        if (!socket) return;

        const handleError = (error: any) => {
            console.warn("Помилка WebSockets:", error);
            api.get('/auth/sessions').catch(() => {});
        };

        socket.on("auth_error", handleError);
        socket.on("connect_error", handleError);

        return () => {
            socket.off("auth_error", handleError);
            socket.off("connect_error", handleError);
        };
    }, [socket]);

    const handleLogout = async () => {
        try {
            await api.post("/auth/logout");
        } catch (error) {
            console.error("Failed to logout", error);
        } finally {
            logout();
            localStorage.removeItem('auth-storage');
            window.location.href = '/auth/login';
        }
    };

    if (!isLoaded) return null;

    return (
        <div className="flex h-screen bg-gray-100">
            <Sidebar
                currentUser={user}
                users={users}
                selectedUser={selectedUser}
                onSelectUser={setSelectedUser}
                onLogout={handleLogout}
            />

            <ChatArea
                currentUserId={currentUserId!} // Додав "!", щоб задовольнити TS, бо якщо дійде сюди, юзер точно є
                selectedUser={selectedUser}
                socket={socket}
            />
        </div>
    );
}