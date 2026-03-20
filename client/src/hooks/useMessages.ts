import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/src/lib/axios';
import { Message, Reaction, ConversationType, ConversationMember } from '@/src/types/conversation.types';
import { useE2E } from './useE2E';
import { useOfflineQueue } from './useOfflineQueue';
import { QueuedMessage } from '@/src/types/conversation.types';

export const useMessages = (
    conversationId:      number | undefined,
    currentUserId:       number | string | undefined,
    socket:              any,
    otherUserId?:        number,
    onDecryptedMessage?: (msg: Message) => void,
    conversationType?:   ConversationType,
    // Список userId учасників групи — потрібен для prefetch sender keys
    groupMemberIds?:     number[],
) => {
    const [messages,      setMessages]      = useState<Message[]>([]);
    const [typingUsers,   setTypingUsers]   = useState<{ userId: number; nickname: string }[]>([]);
    const [hasMore,       setHasMore]       = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [jumpTarget,    setJumpTarget]    = useState<number | null>(null);

    const messagesRef   = useRef<Message[]>([]);
    const typingTimers  = useRef<Map<number, NodeJS.Timeout>>(new Map());
    const typingTimeout = useRef<NodeJS.Timeout | null>(null);

    const e2e = useE2E();

    const isGroup  = conversationType === 'GROUP';
    const isDirect = conversationType === 'DIRECT';

    useEffect(() => { messagesRef.current = messages; }, [messages]);

    //Encrypt
    const encryptContent = useCallback(async (content: string): Promise<string> => {
        if (isDirect && otherUserId)    return e2e.encrypt(content, otherUserId);
        if (isGroup  && conversationId) return e2e.encryptForGroup(content, conversationId);
        return content;
    }, [isDirect, isGroup, otherUserId, conversationId, e2e]);

    // Decrypt — тепер приймає senderId для групових повідомлень
    const decryptContent = useCallback(async (
        ciphertext: string,
        senderId: number | string,
    ): Promise<string> => {
        if (isDirect && otherUserId) return e2e.decrypt(ciphertext, otherUserId);
        if (isGroup  && conversationId) return e2e.decryptFromGroup(ciphertext, conversationId, Number(senderId));
        return ciphertext;
    }, [isDirect, isGroup, otherUserId, conversationId, e2e]);

    const looksEncrypted = (s?: string | null) =>
        !!s && s.length > 20 && /^[A-Za-z0-9_\-]+$/.test(s);

    //Fetch initial messages
    useEffect(() => {
        if (!conversationId) {
            setMessages([]);
            setTypingUsers([]);
            setHasMore(true);
            return;
        }

        setMessages([]);
        setTypingUsers([]);

        const ctrl = new AbortController();

        (async () => {
            try {
                // Для групи — prefetch всіх sender keys перед завантаженням повідомлень
                if (isGroup && groupMemberIds?.length) {
                    await e2e.prefetchGroupSenderKeys(conversationId, groupMemberIds);
                }

                const res = await api.get(
                    `/conversations/${conversationId}/messages`,
                    { signal: ctrl.signal },
                );

                const decrypted = await Promise.all(
                    res.data.map(async (msg: Message) => {
                        let result = msg;
                        if (msg.content && looksEncrypted(msg.content)) {
                            result = { ...result, content: await decryptContent(msg.content, msg.senderId) };
                        }
                        if (msg.replyTo?.content && looksEncrypted(msg.replyTo.content)) {
                            const replyPlain = await decryptContent(msg.replyTo.content, msg.senderId);
                            result = { ...result, replyTo: { ...result.replyTo!, content: replyPlain } };
                        }
                        return result;
                    })
                );

                setMessages(decrypted);
                setHasMore(res.data.length >= 30);
                if (socket) socket.emit('markAsRead', { conversationId });

                if (decrypted.length > 0) {
                    onDecryptedMessage?.(decrypted[decrypted.length - 1]);
                }
            } catch (e: any) {
                if (e.name !== 'CanceledError') console.error('useMessages fetch:', e);
            }
        })();

        return () => ctrl.abort();
    }, [conversationId, socket]);

    // Pagination
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
                    let result = msg;
                    if (msg.content && looksEncrypted(msg.content)) {
                        result = { ...result, content: await decryptContent(msg.content, msg.senderId) };
                    }
                    if (msg.replyTo?.content && looksEncrypted(msg.replyTo.content)) {
                        const replyPlain = await decryptContent(msg.replyTo.content, msg.senderId);
                        result = { ...result, replyTo: { ...result.replyTo!, content: replyPlain } };
                    }
                    return result;
                })
            );

            setMessages((prev) => [...decrypted, ...prev]);
        } catch (e) {
            console.error('loadMore:', e);
        } finally {
            setIsLoadingMore(false);
        }
    }, [conversationId, isLoadingMore, hasMore, decryptContent]);

    // Socket events
    useEffect(() => {
        if (!socket) return;

        const onMessage = async (msg: Message) => {
            if (msg.conversationId !== conversationId) return;

            let decryptedMsg = msg;
            if (msg.content && looksEncrypted(msg.content)) {
                decryptedMsg = { ...decryptedMsg, content: await decryptContent(msg.content, msg.senderId) };
            }
            if (msg.replyTo?.content && looksEncrypted(msg.replyTo.content)) {
                const replyPlain = await decryptContent(msg.replyTo.content, msg.senderId);
                decryptedMsg = { ...decryptedMsg, replyTo: { ...decryptedMsg.replyTo!, content: replyPlain } };
            }

            onDecryptedMessage?.(decryptedMsg);

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
                    next[idx] = { ...decryptedMsg, isPending: false, _queueId: undefined };
                    return next;
                }
                return [...prev, decryptedMsg];
            });

            setTypingUsers((prev) => prev.filter((t) => t.userId !== Number(msg.senderId)));

            if (String(msg.senderId) !== String(currentUserId)) {
                socket.emit('markAsRead', { conversationId });
            }
        };

        const onDeleted = (data: { messageId: number; conversationId: number }) => {
            if (data.conversationId !== conversationId) return;
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === data.messageId ? { ...m, deletedAt: new Date().toISOString() } : m,
                ),
            );
        };

        const onEdited = async (data: {
            messageId: number; content: string; editedAt: string;
            conversationId: number; senderId?: number;
        }) => {
            if (data.conversationId !== conversationId) return;
            let content = data.content;
            if (looksEncrypted(content) && data.senderId) {
                try { content = await decryptContent(content, data.senderId); } catch {}
            }
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === data.messageId ? { ...m, content, editedAt: data.editedAt } : m,
                ),
            );
        };

        const onReaction = (data: {
            messageId: number; reactions: Reaction[]; conversationId: number;
        }) => {
            if (data.conversationId !== conversationId) return;
            setMessages((prev) =>
                prev.map((m) => m.id === data.messageId ? { ...m, reactions: data.reactions } : m),
            );
        };

        const onRead = (data: { userId: number; conversationId: number }) => {
            if (data.conversationId !== conversationId) return;
            if (String(data.userId) !== String(currentUserId)) {
                setMessages((prev) =>
                    prev.map((m) =>
                        String(m.senderId) === String(currentUserId) ? { ...m, isRead: true } : m,
                    ),
                );
            }
        };

        const onTyping = (data: {
            userId: number; nickname: string; conversationId: number; isTyping: boolean;
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
                        setTypingUsers((prev) => prev.filter((t) => t.userId !== data.userId));
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
        socket.on('conversationRead', onRead);

        return () => {
            socket.off('onMessage',        onMessage);
            socket.off('messageDeleted',   onDeleted);
            socket.off('messageEdited',    onEdited);
            socket.off('reactionToggled',  onReaction);
            socket.off('onTyping',         onTyping);
            socket.off('conversationRead', onRead);
        };
    }, [socket, conversationId, currentUserId, decryptContent]);

    // Offline queue
    const flushMessage = useCallback(async (msg: QueuedMessage): Promise<boolean> => {
        if (!socket?.connected) return false;
        try {
            const payload = await encryptContent(msg.content);
            socket.emit('sendMessage', {
                conversationId: msg.conversationId,
                content:        payload,
                replyToId:      msg.replyToId,
            });
            return true;
        } catch {
            return false;
        }
    }, [socket, encryptContent]);

    const { queue: offlineQueue, isOnline, enqueue, flush } = useOfflineQueue(flushMessage);

    useEffect(() => {
        if (!socket) return;
        const onConnect = () => flush();
        socket.on('connect', onConnect);
        return () => { socket.off('connect', onConnect); };
    }, [socket, flush]);

    // Actions
    const sendMessage = useCallback(async (content: string, replyToId?: number) => {
        if (!content.trim() || !conversationId || !currentUserId) return;

        const canSend = !!socket?.connected && isOnline;

        if (!canSend) {
            const queueId = enqueue({
                conversationId, content, replyToId,
                createdAt: new Date().toISOString(),
                senderId:  currentUserId,
                otherUserId,
            });
            setMessages((prev) => [
                ...prev,
                {
                    content, senderId: currentUserId, conversationId,
                    createdAt: new Date().toISOString(),
                    deletedAt: null, editedAt: null, reactions: [],
                    replyToId: replyToId ?? null, isRead: false,
                    isPending: true, _queueId: queueId,
                },
            ]);
            return;
        }

        const payload = await encryptContent(content);
        socket.emit('sendMessage', { conversationId, content: payload, replyToId });

        setMessages((prev) => [
            ...prev,
            {
                content, senderId: currentUserId, conversationId,
                createdAt: new Date().toISOString(),
                deletedAt: null, editedAt: null, reactions: [],
                replyToId: replyToId ?? null, isRead: false,
            },
        ]);

        socket.emit('typing', { conversationId, isTyping: false });
    }, [conversationId, currentUserId, socket, isOnline, enqueue, encryptContent]);

    const sendFileMessage = useCallback((payload: {
        fileUrl: string; fileName: string; fileType: string; fileSize: number;
        content?: string; metadata?: string; replyToId?: number;
    }) => {
        if (!conversationId || !socket || !currentUserId) return;
        socket.emit('sendMessage', { conversationId, ...payload });
        setMessages((prev) => [
            ...prev,
            {
                content: payload.content ?? '', senderId: currentUserId, conversationId,
                createdAt: new Date().toISOString(),
                deletedAt: null, editedAt: null, reactions: [],
                replyToId: payload.replyToId ?? null, isRead: false,
                ...payload,
            },
        ]);
    }, [conversationId, currentUserId, socket]);

    const deleteMessage = useCallback((messageId: number) => {
        socket?.emit('deleteMessage', { messageId });
    }, [socket]);

    const editMessage = useCallback(async (messageId: number, content: string) => {
        if (!socket) return;
        const payload = await encryptContent(content);
        socket.emit('editMessage', { messageId, content: payload });
        setMessages((prev) =>
            prev.map((m) =>
                m.id === messageId ? { ...m, content, editedAt: new Date().toISOString() } : m,
            ),
        );
    }, [socket, encryptContent]);

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

    const forwardMessage = useCallback(async (messageId: number, targetConvId: number) => {
        try {
            await api.post('/conversations/forward', { messageId, targetConversationId: targetConvId });
        } catch (e) {
            console.error('forwardMessage:', e);
        }
    }, []);

    return {
        messages, typingUsers, hasMore, isLoadingMore, jumpTarget,
        sendMessage, sendFileMessage, deleteMessage, editMessage,
        toggleReaction, notifyTyping, loadMoreMessages,
        jumpToMessage, clearJumpTarget, forwardMessage,
        isOnline, offlineQueueCount: offlineQueue.length,
    };
};