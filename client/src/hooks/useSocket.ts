import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from "@/src/store/useAuthStore";

export const useSocket = () => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const { accessToken } = useAuthStore();

    useEffect(() => {
        const newSocket = io("http://localhost:4000", {
            autoConnect: false,
            transports: ['websocket']
        });

        newSocket.on("connect", () => console.log("Socket connected:", newSocket.id));
        newSocket.on("disconnect", () => console.log("Socket disconnected"));

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, []);


    useEffect(() => {
        if (!socket) return;

        if (accessToken) {
            socket.auth = { token: accessToken };

            if (socket.disconnected) {
                socket.connect();
            } else {
                socket.emit('updateToken', { token: accessToken});
            }
        } else {
            socket.disconnect();
        }
    }, [socket, accessToken]);

    useEffect(() => {
        if (!socket) return;

        const handleTokenUpdated = ({ success }: { success: boolean }) => {
            if (!success) {
                // Токен не прийнятий сервером — форсуємо повний реконект
                console.warn('Token update rejected by server, reconnecting...');
                socket.disconnect().connect();
            }
        };

        socket.on('tokenUpdated', handleTokenUpdated);
        return () => { socket.off('tokenUpdated', handleTokenUpdated); };
    }, [socket]);

    return socket;
};

