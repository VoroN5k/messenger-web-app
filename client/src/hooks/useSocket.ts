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
                socket.disconnect().connect();
            }
        } else {

            socket.disconnect();
        }
    }, [socket, accessToken]);

    return socket;
};