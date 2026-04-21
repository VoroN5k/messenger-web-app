'use client';

import {createContext, ReactNode, useContext, useEffect, useState} from "react";
import {io, Socket} from "socket.io-client";
import {useAuthStore} from "@/src/store/useAuthStore";

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

        const handleTokenUpdated = ({ success }: { success: boolean }) => {
            if (!success) {
                console.warn('[Socket] Token rejected, reconnecting...');
                socket.disconnect().connect();
            }
        };

        socket.on('tokenUpdated', handleTokenUpdated);
        return () => {
            socket.off('tokenUpdated', handleTokenUpdated);
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