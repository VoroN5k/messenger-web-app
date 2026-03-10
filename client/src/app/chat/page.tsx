"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/src/store/useAuthStore";
import { useSocket } from "@/src/hooks/useSocket";
import { useUsers } from "@/src/hooks/useUsers";
import api from "@/src/lib/axios";
import Sidebar from "@/src/components/chat/SideBar";
import ChatArea from "@/src/components/chat/ChatArea";
import {User} from "@/src/types/auth.types";

export default function ChatPage() {
    const { user, logout, setAuth } = useAuthStore();
    const socket = useSocket();

    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    const currentUserId = user?.id;

    useEffect(() => {
        if (user !== undefined) setIsLoaded(true);
    }, [user]);

    const { users } = useUsers(currentUserId, isLoaded, socket);

    // 1. РЕЗЕРВНИЙ ЗАХИСТ
    useEffect(() => {
        if (!socket) return;

        const handleError = (error: any) => {
            console.warn("Помилка WebSockets (тригеримо Axios):", error);
            api.get('/auth/sessions').catch(() => {});
        };

        socket.on("auth_error", handleError);
        socket.on("connect_error", handleError);

        return () => {
            socket.off("auth_error", handleError);
            socket.off("connect_error", handleError);
        };
    }, [socket]);

    // SILENT REFRESH
    useEffect(() => {

        const refreshIntervalTime = 14 * 60 * 1000;

        const refreshInterval = setInterval(async () => {
            try {
                console.log("🔄 Фонове оновлення токена...");

                // Звертаємось до нашого бекенду за новим токеном
                const response = await api.post('/auth/refresh');
                const newAccessToken = response.data.accessToken;

                setAuth(user, newAccessToken);

                console.log("Token has been refreshed silently");
            } catch (error) {
                console.error("Error while refreshing token:", error);
            }
        }, refreshIntervalTime);

        // Очищаємо інтервал при виході з чату
        return () => clearInterval(refreshInterval);
    }, [user, setAuth]);

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
                currentUserId={currentUserId!}
                selectedUser={selectedUser}
                socket={socket}
            />
        </div>
    );
}