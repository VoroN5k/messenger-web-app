"use client";

import { useEffect, useState } from "react";
import { useAuthStore }           from "@/src/store/useAuthStore";
import { useSocket }              from "@/src/hooks/useSocket";
import { useUsers }               from "@/src/hooks/useUsers";
import { usePushNotifications }   from "@/src/hooks/usePushNotifications";
import api                        from "@/src/lib/axios";
import Sidebar                    from "@/src/components/chat/SideBar";
import ChatArea                   from "@/src/components/chat/ChatArea";
import { User }                   from "@/src/types/auth.types";
import { jwtDecode }              from "jwt-decode";
import { Bell, BellOff, X }       from "lucide-react";

export default function ChatPage() {
    const { user, logout }   = useAuthStore();
    const socket             = useSocket();

    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [isLoaded,     setIsLoaded]     = useState(false);
    // Банер з пропозицією увімкнути сповіщення
    const [showBanner,   setShowBanner]   = useState(false);

    const currentUserId = user?.id;

    useEffect(() => {
        if (user !== undefined) setIsLoaded(true);
    }, [user]);



    const { users } = useUsers(currentUserId, isLoaded, socket);

    const { isSupported, permission, requestPermission } = usePushNotifications(!!user);

    // Показуємо банер один раз якщо дозвіл ще не запитувався
    useEffect(() => {
        if (!isSupported) return;
        if (typeof window === 'undefined') return;

        const dismissed = localStorage.getItem('push-banner-dismissed');
        if (dismissed) return;

        const timer = setTimeout(() => {
            if (Notification.permission === 'default') {
                setShowBanner(true);
            }
        }, 3000);

        return () => clearTimeout(timer);
    }, [isSupported]);

    const handleEnableNotifications = async () => {
        setShowBanner(false);
        await requestPermission();
    };

    const handleDismissBanner = () => {
        setShowBanner(false);
        localStorage.setItem('push-banner-dismissed', '1');
    };

    // Резервний захист WebSocket
    useEffect(() => {
        if (!socket) return;
        const handleError = () => { api.get('/auth/sessions').catch(() => {}); };
        socket.on("auth_error",     handleError);
        socket.on("connect_error",  handleError);
        return () => {
            socket.off("auth_error",    handleError);
            socket.off("connect_error", handleError);
        };
    }, [socket]);

    // Silent Refresh
    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout>;

        const scheduleRefresh = (token: string | null) => {
            clearTimeout(timeoutId);
            if (!token) return;
            try {
                const { exp } = jwtDecode<{ exp: number }>(token);
                const refreshIn = Math.max(exp * 1000 - Date.now() - 60_000, 5_000);
                timeoutId = setTimeout(async () => {
                    try {
                        const response = await api.post('/auth/refresh');
                        useAuthStore.getState().setAuth(
                            useAuthStore.getState().user,
                            response.data.accessToken,
                        );
                    } catch {}
                }, refreshIn);
            } catch {}
        };

        scheduleRefresh(useAuthStore.getState().accessToken);
        const unsubscribe = useAuthStore.subscribe(
            (s) => s.accessToken,
            (token) => scheduleRefresh(token),
        );
        return () => { clearTimeout(timeoutId); unsubscribe(); };
    }, []);

    const handleLogout = async () => {
        try { await api.post("/auth/logout"); } catch {}
        logout();
        localStorage.removeItem('auth-storage');
        window.location.href = '/auth/login';
    };

    if (!isLoaded) return null;

    return (
        <div className="flex h-screen bg-gray-100 flex-col">

            {/* ── Банер дозволу на сповіщення ── */}
            {showBanner && (
                <div className="flex items-center justify-between gap-3 px-5 py-3 bg-indigo-600 text-white text-sm z-50">
                    <div className="flex items-center gap-2">
                        <Bell size={16} className="shrink-0" />
                        <span>Увімкніть сповіщення, щоб не пропускати нові повідомлення</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={handleEnableNotifications}
                            className="bg-white text-indigo-600 font-semibold px-3 py-1 rounded-lg hover:bg-indigo-50 transition-colors cursor-pointer text-xs"
                        >
                            Увімкнути
                        </button>
                        <button
                            onClick={handleDismissBanner}
                            className="text-indigo-200 hover:text-white transition-colors cursor-pointer"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden">
                <Sidebar
                    currentUser={user}
                    users={users}
                    selectedUser={selectedUser}
                    onSelectUser={setSelectedUser}
                    onLogout={handleLogout}
                    pushPermission={permission}
                    onTogglePush={permission === 'granted' ? undefined : requestPermission}
                />
                <ChatArea
                    currentUserId={currentUserId!}
                    selectedUser={selectedUser}
                    socket={socket}
                />
            </div>
        </div>
    );
}