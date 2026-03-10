import {useState, useEffect, useCallback, useRef} from "react";
import api from "@/src/lib/axios";

export const useChat = (selectedUserId: string | number | undefined, currentUserId: string | number | undefined, socket: any) => {
    const [messages, setMessages] = useState<any[]>([]);

    const [isTyping, setIsTyping] = useState(false);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);


    useEffect(() => {
        if (!selectedUserId) {
            setMessages([]);
            setIsTyping(false);
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

            if (String(newMessage.id) === String(selectedUserId)){
                setIsTyping(false);
            }
        };

        const handleTypingEvent = (data: { userId: number | string, isTyping: boolean}) => {
            if (String(data.userId) === String(selectedUserId)) {
                setIsTyping(data.isTyping);
            }
        };

        socket.on("onMessage", handleNewMessage);
        socket.on("onTyping", handleTypingEvent);

        return () => {
            socket.off("onMessage", handleNewMessage);
            socket.off("onTyping", handleTypingEvent);
        };
    }, [socket, selectedUserId]);


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

        socket.emit("typing", { toId: selectedUserId, isTyping: false });
    }, [selectedUserId, currentUserId, socket]);

    const notifyTyping = useCallback(() => {
        if (!socket || !selectedUserId) return;

        socket.emit("typing", { toId: selectedUserId, isTyping: true });

        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

        typingTimeoutRef.current = setInterval(() => {
            socket.emit("typing", { toId: selectedUserId, isTyping: false });
        }, 2000);
    }, [socket, selectedUserId]);

    return { messages, sendMessage, isTyping, notifyTyping };
};