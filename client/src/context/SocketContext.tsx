'use client';

import {createContext, ReactNode, useContext, useEffect, useState} from "react";
import {io, Socket} from "socket.io-client";
import {useAuthStore} from "@/src/store/useAuthStore";
import {refreshAccessToken} from "@/src/lib/axios";

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: ReactNode}) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const { accessToken, _hasHydrated } = useAuthStore();

    useEffect(() => {
        const newSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000', {
            autoConnect: false,
            transports: ['websocket'],
            path: '/rt',
        });

        newSocket.on('connect', () => console.log('Socket connected:', newSocket.id));
        newSocket.on('disconnect', () => console.log('Socket disconnected'));

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        }
    }, []);

    useEffect(() => {
        if (!socket || !_hasHydrated) return;

        if(accessToken) {
            socket.auth = { token: accessToken };
            if(socket.disconnected) {
                socket.connect();
            } else {
                socket.emit('updateToken', { token: accessToken });
            }
        } else {
            socket.disconnect();
        }
    }, [socket, accessToken, _hasHydrated]);

    useEffect(() => {
        if (!socket) return;

        const handlePushSubscription = () => {
            window.dispatchEvent(new Event('push-resubscribe'));
        };

        socket.on('pushResubscribe', handlePushSubscription);

        const handleTokenUpdated = async ({ success }: { success: boolean }) => {
            if (!success) {
                console.warn('[Socket] Token rejected, refreshing...');
                const newToken = await refreshAccessToken();
                if (newToken) {
                    socket.auth = { token: newToken };
                    socket.disconnect().connect();
                }
                // If no token, logout was triggered → accessToken→null → disconnect via effect
            }
        };

        const handleConnectError = async (err: Error) => {
            if (/auth|unauthorized|token/i.test(err.message)) {
                const newToken = await refreshAccessToken();
                if (newToken) {
                    socket.auth = { token: newToken };
                }
            }
        };

        socket.on('tokenUpdated', handleTokenUpdated);
        socket.on('connect_error', handleConnectError);
        return () => {
            socket.off('tokenUpdated', handleTokenUpdated);
            socket.off('connect_error', handleConnectError);
            socket.off('pushResubscribe', handlePushSubscription);
        };
    }, [socket]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
}

export const useSocket = () => useContext(SocketContext);