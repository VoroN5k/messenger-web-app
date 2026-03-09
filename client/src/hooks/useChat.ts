import { useState, useEffect, useCallback } from "react";
import api from "@/src/lib/axios";

export const useChat = (selectedUserId: string | number | undefined, currentUserId: string | number | undefined, socket: any) => {
    const [messages, setMessages] = useState<any[]>([]);


    useEffect(() => {
        if (!selectedUserId) {
            setMessages([]);
            return;
        }

        const fetchHistory = async () => {
            try {
                const res = await api.get(`/chat/history/${selectedUserId}`);
                setMessages(res.data);
            } catch (error) {
                console.error("Failed to fetch chat history");
            }
        };

        fetchHistory();
    }, [selectedUserId]);


    useEffect(() => {
        if (!socket) return;

        const handleNewMessage = (newMessage: any) => {
            setMessages((prev) => [...prev, newMessage]);
        };

        socket.on("onMessage", handleNewMessage);

        return () => {
            socket.off("onMessage", handleNewMessage);
        };
    }, [socket]);


    const sendMessage = useCallback((content: string) => {
        if (!content.trim() || !selectedUserId || !socket) return;

        socket.emit("sendMessage", {
            toId: selectedUserId,
            content: content,
        });


        setMessages((prev) => [...prev, {
            content: content,
            senderId: currentUserId,
            createdAt: new Date().toISOString()
        }]);
    }, [selectedUserId, currentUserId, socket]);

    return { messages, sendMessage };
};