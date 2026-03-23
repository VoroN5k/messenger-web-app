import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/src/lib/axios';
import { Message, Reaction, ConversationType, QueuedMessage } from '@/src/types/conversation.types';
import { useE2E } from './useE2E';
import { useOfflineQueue } from './useOfflineQueue';

export const useMessages = (
    conversationId:      number | undefined,
    currentUserId:       number | string | undefined,
    socket:              any,
    otherUserId?:        number,
    onDecryptedMessage?: (msg: Message) => void,
    conversationType?:   ConversationType,
    groupMemberIds?:     number[],
) => {
    const [messages,       setMessages]       = useState<Message[]>([]);
    const [typingUsers,    setTypingUsers]    = useState<{ userId: number; nickname: string }[]>([]);
    const [hasMore,        setHasMore]        = useState(true);
    const [hasMoreNewer,   setHasMoreNewer]   = useState(false);
    const [isLoadingMore,  setIsLoadingMore]  = useState(false);
    const [isLoadingNewer, setIsLoadingNewer] = useState(false);
    const [jumpTarget,     setJumpTarget]     = useState<number | null>(null);

    const messagesRef      = useRef<Message[]>([]);
    const typingTimers     = useRef<Map<number, NodeJS.Timeout>>(new Map());
    const typingTimeout    = useRef<NodeJS.Timeout | null>(null);
    const lastTypingSentAt = useRef<number>(0);
    const TYPING_THROTTLE_MS = 1500;

    const e2e = useE2E();

    const isGroup  = conversationType === 'GROUP';
    const isDirect = conversationType === 'DIRECT';

    useEffect(() => { messagesRef.current = messages; }, [messages]);

    const encryptContent = useCallback(async (content: string): Promise<string> => {
        if (isDirect && otherUserId)    return e2e.encrypt(content, otherUserId);
        if (isGroup  && conversationId) return e2e.encryptForGroup(content, conversationId);
        return content;
    }, [isDirect, isGroup, otherUserId, conversationId, e2e]);

    const decryptContent = useCallback(async (
        ciphertext: string,
        senderId: number | string,
    ): Promise<string> => {
        if (isDirect && otherUserId)    return e2e.decrypt(ciphertext, otherUserId);
        if (isGroup  && conversationId) return e2e.decryptFromGroup(ciphertext, conversationId, Number(senderId));
        return ciphertext;
    }, [isDirect, isGroup, otherUserId, conversationId, e2e]);

    const looksEncrypted = (s?: string | null) =>
        !!s && s.length > 20 && /^[A-Za-z0-9_\-]+$/.test(s);

    // Shared decrypt helper (used in all fetch paths)
    const decryptMessages = useCallback(async (raw: Message[]): Promise<Message[]> => {
        return Promise.all(
            raw.map(async (msg) => {
                let result = msg;
                if (msg.content && looksEncrypted(msg.content)) {
                    result = { ...result, content: await decryptContent(msg.content, msg.senderId) };
                }
                if (msg.replyTo?.content && looksEncrypted(msg.replyTo.content)) {
                    const plain = await decryptContent(msg.replyTo.content, msg.senderId);
                    result = { ...result, replyTo: { ...result.replyTo!, content: plain } };
                }
                return result;
            }),
        );
    }, [decryptContent]);

    // Initial load
    useEffect(() => {
        if (!conversationId) {
            setMessages([]);
            setTypingUsers([]);
            setHasMore(true);
            setHasMoreNewer(false);
            return;
        }

        setMessages([]);
        setTypingUsers([]);
        setHasMoreNewer(false);

        const ctrl = new AbortController();

        (async () => {
            try {
                if (isGroup && groupMemberIds?.length) {
                    await e2e.prefetchGroupSenderKeys(conversationId, groupMemberIds);
                }

                const res = await api.get(
                    `/conversations/${conversationId}/messages`,
                    { signal: ctrl.signal },
                );

                const decrypted = await decryptMessages(res.data);
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

    const deduplicateMessages = (msgs: Message[]): Message[] => {
        const seen = new Set<number | string>();
        return msgs.filter((m) => {
            const id = m.id ?? m._queueId;
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    };

    // Load older messages (scroll UP)
    const loadMoreMessages = useCallback(async () => {
        if (!conversationId || isLoadingMore || !hasMore || !messagesRef.current.length) return;
        setIsLoadingMore(true);
        try {
            const cursor = messagesRef.current[0].id;
            const res    = await api.get(
                `/conversations/${conversationId}/messages?cursor=${cursor}`,
            );
            if (res.data.length < 30) setHasMore(false);

            const decrypted = await decryptMessages(res.data);
            setMessages((prev) => deduplicateMessages([...decrypted, ...prev]));
        } catch (e) {
            console.error('loadMore:', e);
        } finally {
            setIsLoadingMore(false);
        }
    }, [conversationId, isLoadingMore, hasMore, decryptMessages]);

    // Load newer messages (scroll DOWN after jump)
    const loadNewerMessages = useCallback(async () => {
        if (!conversationId || isLoadingNewer || !hasMoreNewer || !messagesRef.current.length) return;
        setIsLoadingNewer(true);
        try {
            const lastId = messagesRef.current[messagesRef.current.length - 1].id;
            const res    = await api.get(
                `/conversations/${conversationId}/messages?after=${lastId}`,
            );

            if (!res.data.length) {
                setHasMoreNewer(false);
                return;
            }

            if (res.data.length < 30) setHasMoreNewer(false);

            const decrypted = await decryptMessages(res.data);
            setMessages((prev) => deduplicateMessages([...prev, ...decrypted]));
        } catch (e) {
            console.error('loadNewer:', e);
        } finally {
            setIsLoadingNewer(false);
        }
    }, [conversationId, isLoadingNewer, hasMoreNewer, decryptMessages]);

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
                const plain = await decryptContent(msg.replyTo.content, msg.senderId);
                decryptedMsg = { ...decryptedMsg, replyTo: { ...decryptedMsg.replyTo!, content: plain } };
            }

            onDecryptedMessage?.(decryptedMsg);

            setMessages((prev) => {
                if (decryptedMsg.id && prev.some(m => m.id === decryptedMsg.id)) return prev;

                const idx = prev.findIndex(
                    (m) =>
                        !m.id &&
                        String(m.senderId) === String(decryptedMsg.senderId) &&
                        (m.fileUrl ?? null) === (decryptedMsg.fileUrl ?? null) &&
                        (decryptedMsg.fileUrl ? true : m.content === decryptedMsg.content),
                );
                if (idx !== -1) {
                    const next = [...prev];
                    const optimistic = next[idx];
                    if (optimistic._localBlobUrl) {
                        URL.revokeObjectURL(optimistic._localBlobUrl);
                    }
                    next[idx] = { ...decryptedMsg, isPending: false, _queueId: undefined };
                    return next;
                }

                // New incoming message while in jump window → we're now at the live edge
                setHasMoreNewer(false);
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

    // sendMessage
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

        const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        setMessages((prev) => [
            ...prev,
            {
                content, senderId: currentUserId, conversationId,
                createdAt: new Date().toISOString(),
                deletedAt: null, editedAt: null, reactions: [],
                replyToId: replyToId ?? null, isRead: false,
                _queueId: tmpId,
            },
        ]);

        try {
            const payload = await encryptContent(content);
            socket.emit('sendMessage', { conversationId, content: payload, replyToId });
        } catch (err) {
            console.error('[sendMessage] encrypt failed:', err);
            setMessages((prev) => prev.filter(m => m._queueId !== tmpId));
        }

        socket.emit('typing', { conversationId, isTyping: false });
    }, [conversationId, currentUserId, socket, isOnline, enqueue, encryptContent]);

    const sendFileMessage = useCallback((payload: {
        fileUrl: string; fileName: string; fileType: string; fileSize: number;
        content?: string; metadata?: string; replyToId?: number; _localBlobUrl?: string;
    }) => {
        if (!conversationId || !socket || !currentUserId) return;

        const { _localBlobUrl, ...serverPayload } = payload;
        socket.emit('sendMessage', { conversationId, ...serverPayload });
        setMessages((prev) => [
            ...prev,
            {
                content: payload.content ?? '', senderId: currentUserId, conversationId,
                createdAt: new Date().toISOString(),
                deletedAt: null, editedAt: null, reactions: [],
                replyToId: payload.replyToId ?? null, isRead: false,
                ...serverPayload,
                _localBlobUrl,
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
        const now = Date.now();
        if (now - lastTypingSentAt.current < TYPING_THROTTLE_MS) return;
        lastTypingSentAt.current = now;
        socket.emit('typing', { conversationId, isTyping: true });
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => {
            socket.emit('typing', { conversationId, isTyping: false });
            lastTypingSentAt.current = 0;
        }, 2500);
    }, [socket, conversationId]);

    // Jump to message
    const jumpToMessage = useCallback(async (messageId: number) => {
        if (messagesRef.current.some((m) => m.id === messageId)) {
            setJumpTarget(messageId);
            return;
        }

        if (isGroup && conversationId && groupMemberIds?.length) {
            await e2e.prefetchGroupSenderKeys(conversationId, groupMemberIds).catch(() => {});
        }

        try {
            const res = await api.get(
                `/conversations/${conversationId}/messages?around=${messageId}`,
            );

            const decrypted = await decryptMessages(res.data);
            setMessages(decrypted);
            setHasMore(true);        // older messages exist above
            setHasMoreNewer(true);   // newer messages exist below the jump point
            setJumpTarget(messageId);
        } catch (e) {
            console.error('jumpToMessage:', e);
        }
    }, [conversationId, decryptMessages, isGroup, groupMemberIds, e2e]);

    const resetToLatest = useCallback(async () => {
        if (!conversationId) return;

        if (isGroup && groupMemberIds?.length) {
            await e2e.prefetchGroupSenderKeys(conversationId, groupMemberIds).catch(() => {});
        }

        try {
            const res = await api.get(`/conversations/${conversationId}/messages`);
            const decrypted = await decryptMessages(res.data);
            setMessages(decrypted);
            setHasMore(res.data.length >= 30);
            setHasMoreNewer(false);  // ← тепер на живому краї
            if (socket) socket.emit('markAsRead', { conversationId });
        } catch (e) {
            console.error('resetToLatest:', e);
        }
    }, [conversationId, decryptMessages, socket, isGroup, groupMemberIds, e2e]);

    const clearJumpTarget = useCallback(() => setJumpTarget(null), []);

    const forwardMessage = useCallback(async (messageId: number, targetConvId: number) => {
        try {
            await api.post('/conversations/forward', { messageId, targetConversationId: targetConvId });
        } catch (e) {
            console.error('forwardMessage:', e);
        }
    }, []);

    return {
        messages, typingUsers,
        hasMore, hasMoreNewer,
        isLoadingMore, isLoadingNewer,
        jumpTarget,
        sendMessage, sendFileMessage, deleteMessage, editMessage,
        toggleReaction, notifyTyping,
        loadMoreMessages, loadNewerMessages, resetToLatest,
        jumpToMessage, clearJumpTarget, forwardMessage,
        isOnline, offlineQueueCount: offlineQueue.length,
    };
};