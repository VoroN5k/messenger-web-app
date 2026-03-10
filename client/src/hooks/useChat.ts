import { useState, useEffect, useCallback, useRef } from "react";
import api from "@/src/lib/axios";
import {Message} from "@/src/types/chat.types";


export const useChat = (selectedUserId: string | number | undefined, currentUserId: string | number | undefined, socket: any) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isTyping, setIsTyping] = useState(false);

    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!selectedUserId) {
            setMessages([]);
            setIsTyping(false);
            setHasMore(true);
            return;
        }

        const fetchInitialHistory = async () => {
            try {

                const res = await api.get(`/chat/history/${selectedUserId}`);
                setMessages(res.data);

                if (res.data.length < 20) {
                    setHasMore(false);
                } else {
                    setHasMore(true);
                }
            } catch (error) {
                console.error("Failed to fetch chat history", error);
            }
        };

        fetchInitialHistory();
    }, [selectedUserId]);

    const loadMoreMessages = useCallback(async () => {
        if (!selectedUserId || isLoadingMore || !hasMore || messages.length === 0) return;

        setIsLoadingMore(true);
        try {
            const oldestMessageId = messages[0].id;

            const res = await api.get(`/chat/history/${selectedUserId}?cursor=${oldestMessageId}`);
            const olderMessages = res.data;

            if (olderMessages.length < 20) {
                setHasMore(false);
            }

            setMessages((prev) => [...olderMessages, ...prev]);
        } catch (error) {
            console.error("Failed to load older messages", error);
        } finally {
            setIsLoadingMore(false);
        }
    }, [selectedUserId, isLoadingMore, hasMore, messages]);

    useEffect(() => {
        if (!socket) return;

        const handleNewMessage = (newMessage: any) => {
            setMessages((prev) => [...prev, newMessage]);
            if (String(newMessage.senderId) === String(selectedUserId)) {
                setIsTyping(false);
            }
        };

        const handleTypingEvent = (data: { userId: number | string, isTyping: boolean }) => {
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
        if (!content.trim() || !selectedUserId || !currentUserId || !socket) return;

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

        typingTimeoutRef.current = setTimeout(() => {
            socket.emit("typing", { toId: selectedUserId, isTyping: false });
        }, 2000);
    }, [socket, selectedUserId]);


    return {
        messages,
        sendMessage,
        isTyping,
        notifyTyping,
        loadMoreMessages,
        hasMore,
        isLoadingMore
    };
};