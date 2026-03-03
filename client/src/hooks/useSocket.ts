import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import {useAuthStore} from "@/src/store/useAuthStore";

export const useSocket = () => {
    const socketRef = useRef<Socket | null>(null);
    const { accessToken } = useAuthStore();

    useEffect(() => {
        if (!accessToken) return;

        socketRef.current = io("http://localhost:4000", {
            auth: {token: accessToken},
            transports: ['websocket']
        });

        socketRef.current.on("connect", () => {
            console.log("Connected to Socket Server with ID: ", socketRef.current?.id);
        });

        socketRef.current.on("connect_error", (err) => {
            console.error("Socket Connection Error:", err.message);
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                console.log("Disconnected from Socket Server");
                socketRef.current = null;
            }
        };
    }, [accessToken]);

    return socketRef.current;
}