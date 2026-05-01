'use client';

import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "@/src/store/useAuthStore";
import { refreshAccessToken } from "@/src/lib/axios";

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
    const [socket, setSocket] = useState<Socket | null>(null);

    useEffect(() => {
        const newSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000', {
            autoConnect: false,
            transports: ['websocket'],
            path: '/rt',
        });

        newSocket.on('connect',    () => console.log('Socket connected:', newSocket.id));
        newSocket.on('disconnect', () => console.log('Socket disconnected'));

        setSocket(newSocket);
        return () => { newSocket.disconnect(); };
    }, []);

    // Manage connection reactively — using Zustand's imperative subscribe so that
    // token changes (silent refresh every ~14 min) never trigger a React re-render
    // of SocketProvider, preventing the Sidebar / ChatArea cascade.
    useEffect(() => {
        if (!socket) return;

        const connect = (token: string) => {
            socket.auth = { token };
            if (socket.disconnected) socket.connect();
            else socket.emit('updateToken', { token });
        };

        // Apply current store state immediately
        const { accessToken, _hasHydrated } = useAuthStore.getState();
        if (_hasHydrated && accessToken) {
            socket.auth = { token: accessToken };
            socket.connect();
        }

        // When hydration completes (fires once on app start)
        const unsubHydrated = useAuthStore.subscribe(
            (s) => s._hasHydrated,
            (hydrated) => {
                if (!hydrated) return;
                const token = useAuthStore.getState().accessToken;
                if (token) connect(token);
            },
        );

        // When accessToken changes (silent refresh, login, logout)
        const unsubToken = useAuthStore.subscribe(
            (s) => s.accessToken,
            (token) => {
                if (!useAuthStore.getState()._hasHydrated) return;
                if (token) connect(token);
                else socket.disconnect();
            },
        );

        return () => { unsubHydrated(); unsubToken(); };
    }, [socket]);

    useEffect(() => {
        if (!socket) return;

        const handlePushSubscription = () => {
            window.dispatchEvent(new Event('push-resubscribe'));
        };

        const handleTokenUpdated = async ({ success }: { success: boolean }) => {
            if (!success) {
                console.warn('[Socket] Token rejected, refreshing...');
                const newToken = await refreshAccessToken();
                if (newToken) {
                    socket.auth = { token: newToken };
                    socket.disconnect().connect();
                }
            }
        };

        const handleConnectError = async (err: Error) => {
            if (/auth|unauthorized|token/i.test(err.message)) {
                const currentToken = useAuthStore.getState().accessToken;
                if (currentToken) {
                    socket.auth = { token: currentToken };
                } else {
                    const newToken = await refreshAccessToken();
                    if (newToken) socket.auth = { token: newToken };
                }
            }
        };

        socket.on('pushResubscribe', handlePushSubscription);
        socket.on('tokenUpdated',    handleTokenUpdated);
        socket.on('connect_error',   handleConnectError);

        return () => {
            socket.off('pushResubscribe', handlePushSubscription);
            socket.off('tokenUpdated',    handleTokenUpdated);
            socket.off('connect_error',   handleConnectError);
        };
    }, [socket]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
}

export const useSocket = () => useContext(SocketContext);
