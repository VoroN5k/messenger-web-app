import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/src/lib/axios';
import { Message, Reaction } from '@/src/types/conversation.types';
import {useE2E} from "./eseE2E";

export const useMessages = (
    conversationId: number | undefined,
    currentUserId:  number | string | undefined,
    socket:         any,
    otherUserId?: number,
) => {
    const [messages,      setMessages]      = useState<Message[]>([]);
    const [typingUsers,   setTypingUsers]   = useState<{ userId: number; nickname: string }[]>([]);
    const [hasMore,       setHasMore]       = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [jumpTarget,    setJumpTarget]    = useState<number | null>(null);

    const messagesRef     = useRef<Message[]>([]);
    const typingTimers    = useRef<Map<number, NodeJS.Timeout>>(new Map());
    const typingTimeout   = useRef<NodeJS.Timeout | null>(null);

    const e2e = useE2E();

    useEffect(() => { messagesRef.current = messages; }, [messages]);

    // ── Fetch initial messages ────────────────────────────────────────────────
    useEffect(() => {
        if (!conversationId) {
            setMessages([]);
            setTypingUsers([]);
            setHasMore(true);
            return;
        }

        const ctrl = new AbortController();

        (async () => {
            try {
                const res = await api.get(
                    `/conversations/${conversationId}/messages`,
                    { signal: ctrl.signal },
                );

                const decrypted = await Promise.all(
                    res.data.map(async (msg: Message) => {
                       if (!msg.content || !otherUserId) return msg;
                       const plain = await e2e.decrypt(msg.content, otherUserId);
                       return { ...msg, content: plain };
                    })
                );

                setMessages(decrypted);
                setHasMore(res.data.length >= 30);
                if (socket) socket.emit('markAsRead', { conversationId });
            } catch (e: any) {
                if (e.name !== 'CanceledError') console.error('useMessages fetch:', e);
            }
        })();

        return () => ctrl.abort();
    }, [conversationId, socket]);

    // ── Pagination ────────────────────────────────────────────────────────────
    const loadMoreMessages = useCallback(async () => {
        if (!conversationId || isLoadingMore || !hasMore || !messagesRef.current.length) return;
        setIsLoadingMore(true);
        try {
            const cursor = messagesRef.current[0].id;
            const res    = await api.get(
                `/conversations/${conversationId}/messages?cursor=${cursor}`,
            );
            if (res.data.length < 30) setHasMore(false);

            const decrypted = await Promise.all(
                res.data.map(async (msg: Message) => {
                    if (!msg.content || !otherUserId) return msg;
                    return { ...msg, content: await e2e.decrypt(msg.content, otherUserId) };
                })
            );

            setMessages((prev) => [...decrypted, ...prev]);
        } catch (e) {
            console.error('loadMore:', e);
        } finally {
            setIsLoadingMore(false);
        }
    }, [conversationId, isLoadingMore, hasMore]);

    // ── Socket events ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!socket) return;

        const onMessage = async (msg: Message) => {
            if (msg.conversationId !== conversationId) return;

            let decryptedMsg = msg;
            if (msg.content && otherUserId) {
                const plain = await e2e.decrypt(msg.content, otherUserId);
                decryptedMsg = { ...msg, content: plain };
            }

            setMessages((prev) => {
                const idx = prev.findIndex(
                    (m) =>
                        !m.id &&
                        m.content === decryptedMsg.content &&
                        String(m.senderId) === String(msg.senderId) &&
                        (m.fileUrl ?? null) === (msg.fileUrl ?? null),
                );
                if (idx !== -1) {
                    const next = [...prev];
                    next[idx]  = decryptedMsg;
                    return next;
                }
                return [...prev, decryptedMsg];
            });

            setTypingUsers((prev) =>
                prev.filter((t) => t.userId !== Number(msg.senderId)),
            );

            if (String(msg.senderId) !== String(currentUserId)) {
                socket.emit('markAsRead', { conversationId });
            }
        };

        const onDeleted = (data: { messageId: number; conversationId: number }) => {
            if (data.conversationId !== conversationId) return;
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === data.messageId
                        ? { ...m, deletedAt: new Date().toISOString() }
                        : m,
                ),
            );
        };

        const onEdited = (data: {
            messageId:      number;
            content:        string;
            editedAt:       string;
            conversationId: number;
        }) => {
            if (data.conversationId !== conversationId) return;
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === data.messageId
                        ? { ...m, content: data.content, editedAt: data.editedAt }
                        : m,
                ),
            );
        };

        const onReaction = (data: {
            messageId:      number;
            reactions:      Reaction[];
            conversationId: number;
        }) => {
            if (data.conversationId !== conversationId) return;
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === data.messageId ? { ...m, reactions: data.reactions } : m,
                ),
            );
        };

        // FIX 1: Коли інший юзер прочитав — ставимо isRead=true на наші повідомлення
        const onRead = (data: { userId: number; conversationId: number }) => {
            if (data.conversationId !== conversationId) return;
            // Позначаємо всі наші повідомлення як прочитані
            if (String(data.userId) !== String(currentUserId)) {
                setMessages((prev) =>
                    prev.map((m) =>
                        String(m.senderId) === String(currentUserId)
                            ? { ...m, isRead: true }
                            : m,
                    ),
                );
            }
        };

        const onTyping = (data: {
            userId:         number;
            nickname:       string;
            conversationId: number;
            isTyping:       boolean;
        }) => {
            if (data.conversationId !== conversationId) return;
            if (String(data.userId) === String(currentUserId)) return;

            if (data.isTyping) {
                setTypingUsers((prev) => {
                    if (prev.some((t) => t.userId === data.userId)) return prev;
                    return [...prev, { userId: data.userId, nickname: data.nickname }];
                });

                const existing = typingTimers.current.get(data.userId);
                if (existing) clearTimeout(existing);

                typingTimers.current.set(
                    data.userId,
                    setTimeout(() => {
                        setTypingUsers((prev) =>
                            prev.filter((t) => t.userId !== data.userId),
                        );
                        typingTimers.current.delete(data.userId);
                    }, 3500),
                );
            } else {
                const timer = typingTimers.current.get(data.userId);
                if (timer) { clearTimeout(timer); typingTimers.current.delete(data.userId); }
                setTypingUsers((prev) => prev.filter((t) => t.userId !== data.userId));
            }
        };

        socket.on('onMessage',        onMessage);
        socket.on('messageDeleted',   onDeleted);
        socket.on('messageEdited',    onEdited);
        socket.on('reactionToggled',  onReaction);
        socket.on('onTyping',         onTyping);
        socket.on('conversationRead', onRead);  // FIX 1

        return () => {
            socket.off('onMessage',        onMessage);
            socket.off('messageDeleted',   onDeleted);
            socket.off('messageEdited',    onEdited);
            socket.off('reactionToggled',  onReaction);
            socket.off('onTyping',         onTyping);
            socket.off('conversationRead', onRead);
        };
    }, [socket, conversationId, currentUserId]);

    // ── Actions ───────────────────────────────────────────────────────────────
    const sendMessage = useCallback(async (content: string, replyToId?: number) => {
        if (!content.trim() || !conversationId || !socket || !currentUserId) return;

        const payload = otherUserId
        ? await e2e.encrypt(content, otherUserId)
        : content;

        socket.emit('sendMessage', { conversationId, content: payload, replyToId });

        setMessages((prev) => [
            ...prev,
            {
                content,
                senderId:       currentUserId,
                conversationId,
                createdAt:      new Date().toISOString(),
                deletedAt:      null,
                editedAt:       null,
                reactions:      [],
                replyToId:      replyToId ?? null,
                isRead:         false,
            },
        ]);

        socket.emit('typing', { conversationId, isTyping: false });
    }, [conversationId, currentUserId, socket, otherUserId]);

    const sendFileMessage = useCallback((payload: {
        fileUrl:   string;
        fileName:  string;
        fileType:  string;
        fileSize:  number;
        content?:  string;
        replyToId?: number;
    }) => {
        if (!conversationId || !socket || !currentUserId) return;

        socket.emit('sendMessage', { conversationId, ...payload });

        setMessages((prev) => [
            ...prev,
            {
                content:        payload.content ?? '',
                senderId:       currentUserId,
                conversationId,
                createdAt:      new Date().toISOString(),
                deletedAt:      null,
                editedAt:       null,
                reactions:      [],
                replyToId:      payload.replyToId ?? null,
                isRead:         false,
                ...payload,
            },
        ]);
    }, [conversationId, currentUserId, socket]);

    const deleteMessage = useCallback((messageId: number) => {
        socket?.emit('deleteMessage', { messageId });
    }, [socket]);

    const editMessage = useCallback((messageId: number, content: string) => {
        socket?.emit('editMessage', { messageId, content });
    }, [socket]);

    const toggleReaction = useCallback((messageId: number, emoji: string) => {
        socket?.emit('toggleReaction', { messageId, emoji });
    }, [socket]);

    const notifyTyping = useCallback(() => {
        if (!socket || !conversationId) return;
        socket.emit('typing', { conversationId, isTyping: true });
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => {
            socket.emit('typing', { conversationId, isTyping: false });
        }, 2500);
    }, [socket, conversationId]);

    const jumpToMessage = useCallback(async (messageId: number) => {
        if (messagesRef.current.some((m) => m.id === messageId)) {
            setJumpTarget(messageId);
        } else {
            try {
                const res = await api.get(
                    `/conversations/${conversationId}/messages?around=${messageId}`,
                );
                setMessages(res.data);
                setHasMore(true);
                setJumpTarget(messageId);
            } catch (e) {
                console.error('jumpToMessage:', e);
            }
        }
    }, [conversationId]);

    const clearJumpTarget = useCallback(() => setJumpTarget(null), []);

    return {
        messages,
        typingUsers,
        hasMore,
        isLoadingMore,
        jumpTarget,
        sendMessage,
        sendFileMessage,
        deleteMessage,
        editMessage,
        toggleReaction,
        notifyTyping,
        loadMoreMessages,
        jumpToMessage,
        clearJumpTarget,
    };
};