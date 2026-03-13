import { useState, useEffect, useCallback, useRef } from "react";
import api from "@/src/lib/axios";
import { Message, Reaction } from "@/src/types/chat.types";

export const useChat = (
    selectedUserId: string | number | undefined,
    currentUserId:  string | number | undefined,
    socket: any,
) => {
    const [messages,       setMessages]       = useState<Message[]>([]);
    const [isTyping,       setIsTyping]       = useState(false);
    const [hasMore,        setHasMore]        = useState(true);
    const [isLoadingMore,  setIsLoadingMore]  = useState(false);
    const [jumpTarget,     setJumpTarget]     = useState<number | null>(null);

    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const messagesRef      = useRef<Message[]>([]);

    // Синхронізуємо ref з state для jumpToMessage
    useEffect(() => { messagesRef.current = messages; }, [messages]);

    // ── Завантаження історії ──────────────────────────────────────────────────
    useEffect(() => {
        if (!selectedUserId) {
            setMessages([]); setIsTyping(false); setHasMore(true);
            return;
        }
        const controller = new AbortController();
        (async () => {
            try {
                const res = await api.get(`/chat/history/${selectedUserId}`, { signal: controller.signal });
                setMessages(res.data);
                setHasMore(res.data.length >= 20);
                if (socket) socket.emit('markAsRead', { senderId: selectedUserId });
            } catch (e: any) {
                if (e.name !== 'CanceledError') console.error('Failed to fetch chat history', e);
            }
        })();
        return () => controller.abort();
    }, [selectedUserId, socket]);

    // ── Пагінація ─────────────────────────────────────────────────────────────
    const loadMoreMessages = useCallback(async () => {
        if (!selectedUserId || isLoadingMore || !hasMore || messagesRef.current.length === 0) return;
        setIsLoadingMore(true);
        try {
            const res = await api.get(`/chat/history/${selectedUserId}?cursor=${messagesRef.current[0].id}`);
            if (res.data.length < 20) setHasMore(false);
            setMessages((prev) => [...res.data, ...prev]);
        } catch (e) {
            console.error('Failed to load older messages', e);
        } finally {
            setIsLoadingMore(false);
        }
    }, [selectedUserId, isLoadingMore, hasMore]);

    // ── Socket-події ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!socket) return;

        const handleNewMessage = (msg: Message) => {
            setMessages((prev) => [...prev, msg]);
            if (String(msg.senderId) === String(selectedUserId)) {
                setIsTyping(false);
                socket.emit('markAsRead', { senderId: selectedUserId });
            }
        };

        const handleMessageSent = (confirmed: Message) => {
            setMessages((prev) =>
                prev.map((m) =>
                    !m.id &&
                    m.content === confirmed.content &&
                    String(m.senderId) === String(confirmed.senderId) &&
                    (m.fileUrl ?? null) === (confirmed.fileUrl ?? null)
                        ? { isRead: m.isRead ?? false, ...confirmed }
                        : m,
                ),
            );
        };

        const handleMessagesRead = (data: { readerId: number | string; senderId: number | string }) => {
            if (String(data.readerId) === String(selectedUserId)) {
                setMessages((prev) =>
                    prev.map((m) => String(m.senderId) === String(currentUserId) ? { ...m, isRead: true } : m),
                );
            }
        };

        const handleMessageDeleted = (data: { messageId: number }) => {
            setMessages((prev) =>
                prev.map((m) => m.id === data.messageId ? { ...m, deletedAt: new Date().toISOString() } : m),
            );
        };

        const handleMessageEdited = (data: { messageId: number; content: string; updatedAt: string }) => {
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === data.messageId ? { ...m, content: data.content, editedAt: data.updatedAt } : m,
                ),
            );
        };

        const handleReactionToggled = (data: { messageId: number; reactions: Reaction[] }) => {
            setMessages((prev) =>
                prev.map((m) => m.id === data.messageId ? { ...m, reactions: data.reactions } : m),
            );
        };

        const handleTyping = (data: { userId: number | string; isTyping: boolean }) => {
            if (String(data.userId) === String(selectedUserId)) setIsTyping(data.isTyping);
        };

        socket.on('onMessage',       handleNewMessage);
        socket.on('messageSent',     handleMessageSent);
        socket.on('messagesRead',    handleMessagesRead);
        socket.on('messageDeleted',  handleMessageDeleted);
        socket.on('messageEdited',   handleMessageEdited);
        socket.on('reactionToggled', handleReactionToggled);
        socket.on('onTyping',        handleTyping);

        return () => {
            socket.off('onMessage',       handleNewMessage);
            socket.off('messageSent',     handleMessageSent);
            socket.off('messagesRead',    handleMessagesRead);
            socket.off('messageDeleted',  handleMessageDeleted);
            socket.off('messageEdited',   handleMessageEdited);
            socket.off('reactionToggled', handleReactionToggled);
            socket.off('onTyping',        handleTyping);
        };
    }, [socket, selectedUserId, currentUserId]);

    // ── Actions ───────────────────────────────────────────────────────────────
    const sendMessage = useCallback((content: string) => {
        if (!content.trim() || !selectedUserId || !currentUserId || !socket) return;
        socket.emit('sendMessage', { toId: selectedUserId, content });
        setMessages((prev) => [
            ...prev,
            { content, senderId: currentUserId, createdAt: new Date().toISOString(), isRead: false, deletedAt: null, editedAt: null, reactions: [] },
        ]);
        socket.emit('typing', { toId: selectedUserId, isTyping: false });
    }, [selectedUserId, currentUserId, socket]);

    const sendFileMessage = useCallback((payload: {
        fileUrl: string; fileName: string; fileType: string; fileSize: number; content?: string;
    }) => {
        if (!selectedUserId || !currentUserId || !socket) return;
        socket.emit('sendMessage', { toId: selectedUserId, ...payload });
        setMessages((prev) => [
            ...prev,
            { content: payload.content ?? '', senderId: currentUserId, createdAt: new Date().toISOString(), isRead: false, deletedAt: null, editedAt: null, reactions: [], ...payload },
        ]);
    }, [selectedUserId, currentUserId, socket]);

    const deleteMessage = useCallback((messageId: number) => {
        if (!socket) return;
        socket.emit('deleteMessage', { messageId });
    }, [socket]);

    const editMessage = useCallback((messageId: number, content: string) => {
        if (!socket || !content.trim()) return;
        socket.emit('editMessage', { messageId, content });
    }, [socket]);

    const toggleReaction = useCallback((messageId: number, emoji: string) => {
        if (!socket) return;
        socket.emit('toggleReaction', { messageId, emoji });
    }, [socket]);

    const notifyTyping = useCallback(() => {
        if (!socket || !selectedUserId) return;
        socket.emit('typing', { toId: selectedUserId, isTyping: true });
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            socket.emit('typing', { toId: selectedUserId, isTyping: false });
        }, 2000);
    }, [socket, selectedUserId]);

    // ── Jump to message (search) ──────────────────────────────────────────────
    const jumpToMessage = useCallback(async (messageId: number) => {
        const inList = messagesRef.current.some((m) => m.id === messageId);

        if (inList) {
            setJumpTarget(messageId);
        } else {
            try {
                const res = await api.get(`/chat/history/${selectedUserId}?around=${messageId}`);
                setMessages(res.data);
                setHasMore(true); // можна підвантажити ще
                setJumpTarget(messageId);
            } catch (e) {
                console.error('jumpToMessage failed', e);
            }
        }
    }, [selectedUserId]);

    const clearJumpTarget = useCallback(() => setJumpTarget(null), []);

    return {
        messages, sendMessage, sendFileMessage,
        deleteMessage, editMessage, toggleReaction,
        isTyping, notifyTyping,
        loadMoreMessages, hasMore, isLoadingMore,
        jumpTarget, jumpToMessage, clearJumpTarget,
    };
};