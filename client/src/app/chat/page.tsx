"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/src/store/useAuthStore";
import { useSocket } from "@/src/hooks/useSocket";
import { useUsers } from "@/src/hooks/useUsers";
import api from "@/src/lib/axios";
import Sidebar from "@/src/components/chat/SideBar";
import ChatArea from "@/src/components/chat/ChatArea";
import {User} from "@/src/types/auth.types";
import {jwtDecode} from "jwt-decode";

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
        let timeoutId: ReturnType<typeof setTimeout>;

        const scheduleRefresh = (token: string | null) => {
            clearTimeout(timeoutId);
            if (!token) return;

            try {
                const { exp } = jwtDecode<{ exp: number }>(token);
                const msUntilExpiry = exp * 1000 - Date.now();
                // Оновлюємо за 60 секунд до закінчення, але не раніше ніж через 5 секунд
                const refreshIn = Math.max(msUntilExpiry - 60_000, 5_000);

                timeoutId = setTimeout(async () => {
                    try {
                        const response = await api.post('/auth/refresh');
                        useAuthStore.getState().setAuth(
                            useAuthStore.getState().user,
                            response.data.accessToken,
                        );
                    } catch {
                    }
                }, refreshIn);
            } catch {
            }
        };

        scheduleRefresh(useAuthStore.getState().accessToken);

        const unsubscribe = useAuthStore.subscribe(
            (state) => state.accessToken,
            (token) => scheduleRefresh(token),
        );

        return () => {
            clearTimeout(timeoutId);
            unsubscribe();
        };
    }, []);

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