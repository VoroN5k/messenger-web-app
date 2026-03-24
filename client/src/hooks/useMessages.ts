import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/src/lib/axios';
import { Message, Reaction, ConversationType, QueuedMessage } from '@/src/types/conversation.types';
import { useE2E }          from './useE2E';
import { useOfflineQueue } from './useOfflineQueue';
import { parseMetadata }   from '@/src/lib/parseMetadata';

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
    const [firstUnreadId,  setFirstUnreadId]  = useState<number | null>(null);

    const messagesRef      = useRef<Message[]>([]);
    const typingTimers     = useRef<Map<number, NodeJS.Timeout>>(new Map());
    const typingTimeout    = useRef<NodeJS.Timeout | null>(null);
    const lastTypingSentAt = useRef<number>(0);
    const TYPING_THROTTLE_MS = 1500;

    // Self-destruct timers map: messageId → timeoutId
    const destructTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

    const e2e = useE2E();

    const isGroup  = conversationType === 'GROUP';
    const isDirect = conversationType === 'DIRECT';

    useEffect(() => { messagesRef.current = messages; }, [messages]);

    // Self-destruct: schedule deletion for a message
    const scheduleDestruct = useCallback((msg: Message, delayMs: number) => {
        if (!msg.id) return;
        if (destructTimers.current.has(msg.id)) return; // already scheduled
        const tid = setTimeout(() => {
            socket?.emit('deleteMessage', { messageId: msg.id });
            setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, deletedAt: new Date().toISOString() } : m));
            destructTimers.current.delete(msg.id!);
        }, delayMs);
        destructTimers.current.set(msg.id, tid);
    }, [socket]);

    // Apply self-destruct to a list of messages (call after decrypt)
    const applyDestructTimers = useCallback((msgs: Message[]) => {
        for (const msg of msgs) {
            if (!msg.id || !msg.metadata || msg.deletedAt) continue;
            const { destructAfterSeconds } = parseMetadata(msg.metadata);
            if (!destructAfterSeconds) continue;
            // Only start timer for receiver (sender sees it indefinitely until sent)
            if (String(msg.senderId) === String(currentUserId)) continue;
            const elapsed = Date.now() - new Date(msg.createdAt).getTime();
            const remaining = destructAfterSeconds * 1000 - elapsed;
            if (remaining <= 0) {
                // Already expired — mark deleted immediately
                socket?.emit('deleteMessage', { messageId: msg.id });
            } else {
                scheduleDestruct(msg, remaining);
            }
        }
    }, [currentUserId, scheduleDestruct, socket]);

    // Clean up destruct timers when conversation changes
    useEffect(() => {
        return () => {
            for (const tid of destructTimers.current.values()) clearTimeout(tid);
            destructTimers.current.clear();
        };
    }, [conversationId]);

    const encryptContent = useCallback(async (content: string): Promise<string> => {
        if (isDirect && otherUserId)    return e2e.encrypt(content, otherUserId);
        if (isGroup  && conversationId) return e2e.encryptForGroup(content, conversationId);
        return content;
    }, [isDirect, isGroup, otherUserId, conversationId, e2e]);

    const decryptContent = useCallback(async (ciphertext: string, senderId: number | string): Promise<string> => {
        if (isDirect && otherUserId)    return e2e.decrypt(ciphertext, otherUserId);
        if (isGroup  && conversationId) return e2e.decryptFromGroup(ciphertext, conversationId, Number(senderId));
        return ciphertext;
    }, [isDirect, isGroup, otherUserId, conversationId, e2e]);

    const looksEncrypted = (s?: string | null) => !!s && s.length > 20 && /^[A-Za-z0-9_\-]+$/.test(s);

    const decryptMessages = useCallback(async (raw: Message[]): Promise<Message[]> => {
        return Promise.all(raw.map(async msg => {
            let result = msg;
            if (msg.content && looksEncrypted(msg.content)) {
                result = { ...result, content: await decryptContent(msg.content, msg.senderId) };
            }
            if (msg.replyTo?.content && looksEncrypted(msg.replyTo.content)) {
                const plain = await decryptContent(msg.replyTo.content, msg.senderId);
                result = { ...result, replyTo: { ...result.replyTo!, content: plain } };
            }
            return result;
        }));
    }, [decryptContent]);

    // Initial load
    useEffect(() => {
        if (!conversationId) {
            setMessages([]); setTypingUsers([]);
            setHasMore(true); setHasMoreNewer(false);
            setFirstUnreadId(null);
            return;
        }

        setMessages([]); setTypingUsers([]);
        setHasMoreNewer(false); setFirstUnreadId(null);

        const ctrl = new AbortController();

        (async () => {
            try {
                if (isGroup && groupMemberIds?.length) {
                    await e2e.prefetchGroupSenderKeys(conversationId, groupMemberIds);
                }

                const res = await api.get(`/conversations/${conversationId}/messages`, { signal: ctrl.signal });

                // Handle both old array format and new { messages, meta } format
                const rawData = Array.isArray(res.data) ? res.data : res.data.messages;
                const meta    = Array.isArray(res.data) ? null : res.data.meta;

                const decrypted = await decryptMessages(rawData);
                setMessages(decrypted);
                setHasMore(rawData.length >= 30);

                // Set firstUnreadId from server meta
                if (meta?.firstUnreadId) setFirstUnreadId(meta.firstUnreadId);

                // Apply self-destruct timers
                applyDestructTimers(decrypted);

                if (socket) socket.emit('markAsRead', { conversationId });
                if (decrypted.length > 0) onDecryptedMessage?.(decrypted[decrypted.length - 1]);
            } catch (e: any) {
                if (e.name !== 'CanceledError') console.error('useMessages fetch:', e);
            }
        })();

        return () => ctrl.abort();
    }, [conversationId, socket]);

    const deduplicateMessages = (msgs: Message[]): Message[] => {
        const seen = new Set<number | string>();
        return msgs.filter(m => {
            const id = m.id ?? m._queueId;
            if (!id || seen.has(id)) return false;
            seen.add(id); return true;
        });
    };

    // Load older messages
    const loadMoreMessages = useCallback(async () => {
        if (!conversationId || isLoadingMore || !hasMore || !messagesRef.current.length) return;
        setIsLoadingMore(true);
        try {
            const cursor = messagesRef.current[0].id;
            const res    = await api.get(`/conversations/${conversationId}/messages?cursor=${cursor}`);
            const data   = Array.isArray(res.data) ? res.data : res.data.messages;
            if (data.length < 30) setHasMore(false);
            const decrypted = await decryptMessages(data);
            setMessages(prev => deduplicateMessages([...decrypted, ...prev]));
        } catch (e) {
            console.error('loadMore:', e);
        } finally {
            setIsLoadingMore(false);
        }
    }, [conversationId, isLoadingMore, hasMore, decryptMessages]);

    // Load newer messages
    const loadNewerMessages = useCallback(async () => {
        if (!conversationId || isLoadingNewer || !hasMoreNewer || !messagesRef.current.length) return;
        setIsLoadingNewer(true);
        try {
            const lastId = messagesRef.current[messagesRef.current.length - 1].id;
            const res    = await api.get(`/conversations/${conversationId}/messages?after=${lastId}`);
            const data   = Array.isArray(res.data) ? res.data : res.data.messages;
            if (!data.length) { setHasMoreNewer(false); return; }
            if (data.length < 30) setHasMoreNewer(false);
            const decrypted = await decryptMessages(data);
            setMessages(prev => deduplicateMessages([...prev, ...decrypted]));
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
            applyDestructTimers([decryptedMsg]);

            setMessages(prev => {
                if (decryptedMsg.id && prev.some(m => m.id === decryptedMsg.id)) return prev;
                const idx = prev.findIndex(m =>
                    !m.id &&
                    String(m.senderId) === String(decryptedMsg.senderId) &&
                    (m.fileUrl ?? null) === (decryptedMsg.fileUrl ?? null) &&
                    (decryptedMsg.fileUrl ? true : m.content === decryptedMsg.content),
                );
                if (idx !== -1) {
                    const next = [...prev];
                    const opt  = next[idx];
                    if (opt._localBlobUrl) URL.revokeObjectURL(opt._localBlobUrl);
                    next[idx] = { ...decryptedMsg, isPending: false, _queueId: undefined };
                    return next;
                }
                setHasMoreNewer(false);
                return [...prev, decryptedMsg];
            });

            setTypingUsers(prev => prev.filter(t => t.userId !== Number(msg.senderId)));
            if (String(msg.senderId) !== String(currentUserId)) {
                socket.emit('markAsRead', { conversationId });
            }
        };

        // Scheduled message confirmed (only sender gets this)
        const onMessageScheduled = async (msg: Message) => {
            if (msg.conversationId !== conversationId) return;
            let decryptedMsg = msg;
            if (msg.content && looksEncrypted(msg.content)) {
                decryptedMsg = { ...decryptedMsg, content: await decryptContent(msg.content, msg.senderId) };
            }
            setMessages(prev => {
                if (prev.some(m => m.id === decryptedMsg.id)) return prev;
                return [...prev, decryptedMsg];
            });
        };

        const onDeleted = (data: { messageId: number; conversationId: number }) => {
            if (data.conversationId !== conversationId) return;
            setMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, deletedAt: new Date().toISOString() } : m));
        };

        const onEdited = async (data: { messageId: number; content: string; editedAt: string; conversationId: number; senderId?: number }) => {
            if (data.conversationId !== conversationId) return;
            let content = data.content;
            if (looksEncrypted(content) && data.senderId) {
                try { content = await decryptContent(content, data.senderId); } catch {}
            }
            setMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, content, editedAt: data.editedAt } : m));
        };

        const onReaction = (data: { messageId: number; reactions: Reaction[]; conversationId: number }) => {
            if (data.conversationId !== conversationId) return;
            setMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, reactions: data.reactions } : m));
        };

        const onRead = (data: { userId: number; conversationId: number }) => {
            if (data.conversationId !== conversationId) return;
            if (String(data.userId) !== String(currentUserId)) {
                setMessages(prev => prev.map(m => String(m.senderId) === String(currentUserId) ? { ...m, isRead: true } : m));
            }
        };

        const onTyping = (data: { userId: number; nickname: string; conversationId: number; isTyping: boolean }) => {
            if (data.conversationId !== conversationId) return;
            if (String(data.userId) === String(currentUserId)) return;
            if (data.isTyping) {
                setTypingUsers(prev => {
                    if (prev.some(t => t.userId === data.userId)) return prev;
                    return [...prev, { userId: data.userId, nickname: data.nickname }];
                });
                const existing = typingTimers.current.get(data.userId);
                if (existing) clearTimeout(existing);
                typingTimers.current.set(data.userId, setTimeout(() => {
                    setTypingUsers(prev => prev.filter(t => t.userId !== data.userId));
                    typingTimers.current.delete(data.userId);
                }, 3500));
            } else {
                const timer = typingTimers.current.get(data.userId);
                if (timer) { clearTimeout(timer); typingTimers.current.delete(data.userId); }
                setTypingUsers(prev => prev.filter(t => t.userId !== data.userId));
            }
        };

        socket.on('onMessage',          onMessage);
        socket.on('messageScheduled',   onMessageScheduled);
        socket.on('messageDeleted',     onDeleted);
        socket.on('messageEdited',      onEdited);
        socket.on('reactionToggled',    onReaction);
        socket.on('onTyping',           onTyping);
        socket.on('conversationRead',   onRead);

        return () => {
            socket.off('onMessage',         onMessage);
            socket.off('messageScheduled',  onMessageScheduled);
            socket.off('messageDeleted',    onDeleted);
            socket.off('messageEdited',     onEdited);
            socket.off('reactionToggled',   onReaction);
            socket.off('onTyping',          onTyping);
            socket.off('conversationRead',  onRead);
        };
    }, [socket, conversationId, currentUserId, decryptContent, applyDestructTimers]);

    // Offline queue
    const flushMessage = useCallback(async (msg: QueuedMessage): Promise<boolean> => {
        if (!socket?.connected) return false;
        try {
            const payload = await encryptContent(msg.content);
            socket.emit('sendMessage', { conversationId: msg.conversationId, content: payload, replyToId: msg.replyToId });
            return true;
        } catch { return false; }
    }, [socket, encryptContent]);

    const { queue: offlineQueue, isOnline, enqueue, flush } = useOfflineQueue(flushMessage);

    useEffect(() => {
        if (!socket) return;
        const onConnect = () => flush();
        socket.on('connect', onConnect);
        return () => { socket.off('connect', onConnect); };
    }, [socket, flush]);

    // sendMessage
    const sendMessage = useCallback(async (
        content: string,
        replyToId?: number,
        scheduledAt?: Date | null,
        destructAfterSeconds?: number | null,
    ) => {
        if (!content.trim() || !conversationId || !currentUserId) return;

        const canSend = !!socket?.connected && isOnline;

        // Build metadata if we have self-destruct
        const metadata = destructAfterSeconds
            ? JSON.stringify({ destructAfterSeconds })
            : undefined;

        if (!canSend && !scheduledAt) {
            const queueId = enqueue({ conversationId, content, replyToId, createdAt: new Date().toISOString(), senderId: currentUserId, otherUserId });
            setMessages(prev => [...prev, {
                content, senderId: currentUserId, conversationId,
                createdAt: new Date().toISOString(), deletedAt: null, editedAt: null,
                reactions: [], replyToId: replyToId ?? null, isRead: false,
                isPending: true, _queueId: queueId, metadata: metadata ?? null,
            }]);
            return;
        }

        const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        setMessages(prev => [...prev, {
            content, senderId: currentUserId, conversationId,
            createdAt: new Date().toISOString(), deletedAt: null, editedAt: null,
            reactions: [], replyToId: replyToId ?? null, isRead: false,
            scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
            _queueId: tmpId, metadata: metadata ?? null,
        }]);

        try {
            const payload = await encryptContent(content);
            socket.emit('sendMessage', {
                conversationId,
                content: payload,
                replyToId,
                metadata,
                scheduledAt: scheduledAt ? scheduledAt.toISOString() : undefined,
            });
        } catch (err) {
            console.error('[sendMessage] encrypt failed:', err);
            setMessages(prev => prev.filter(m => m._queueId !== tmpId));
        }

        socket.emit('typing', { conversationId, isTyping: false });
    }, [conversationId, currentUserId, socket, isOnline, enqueue, encryptContent, otherUserId]);

    const sendFileMessage = useCallback((payload: {
        fileUrl: string; fileName: string; fileType: string; fileSize: number;
        content?: string; metadata?: string; replyToId?: number; _localBlobUrl?: string;
    }) => {
        if (!conversationId || !socket || !currentUserId) return;
        const { _localBlobUrl, ...serverPayload } = payload;
        socket.emit('sendMessage', { conversationId, ...serverPayload });
        setMessages(prev => [...prev, {
            content: payload.content ?? '', senderId: currentUserId, conversationId,
            createdAt: new Date().toISOString(), deletedAt: null, editedAt: null,
            reactions: [], replyToId: payload.replyToId ?? null, isRead: false,
            ...serverPayload, _localBlobUrl,
        }]);
    }, [conversationId, currentUserId, socket]);

    const deleteMessage  = useCallback((messageId: number) => { socket?.emit('deleteMessage', { messageId }); }, [socket]);

    const editMessage    = useCallback(async (messageId: number, content: string) => {
        if (!socket) return;
        const payload = await encryptContent(content);
        socket.emit('editMessage', { messageId, content: payload });
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content, editedAt: new Date().toISOString() } : m));
    }, [socket, encryptContent]);

    const toggleReaction = useCallback((messageId: number, emoji: string) => { socket?.emit('toggleReaction', { messageId, emoji }); }, [socket]);

    const notifyTyping   = useCallback(() => {
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
        if (messagesRef.current.some(m => m.id === messageId)) { setJumpTarget(messageId); return; }
        if (isGroup && conversationId && groupMemberIds?.length) {
            await e2e.prefetchGroupSenderKeys(conversationId, groupMemberIds).catch(() => {});
        }
        try {
            const res   = await api.get(`/conversations/${conversationId}/messages?around=${messageId}`);
            const data  = Array.isArray(res.data) ? res.data : res.data.messages;
            const decrypted = await decryptMessages(data);
            setMessages(decrypted);
            setHasMore(true); setHasMoreNewer(true); setJumpTarget(messageId);
        } catch (e) { console.error('jumpToMessage:', e); }
    }, [conversationId, decryptMessages, isGroup, groupMemberIds, e2e]);

    const resetToLatest = useCallback(async () => {
        if (!conversationId) return;
        if (isGroup && groupMemberIds?.length) await e2e.prefetchGroupSenderKeys(conversationId, groupMemberIds).catch(() => {});
        try {
            const res  = await api.get(`/conversations/${conversationId}/messages`);
            const data = Array.isArray(res.data) ? res.data : res.data.messages;
            const decrypted = await decryptMessages(data);
            setMessages(decrypted);
            setHasMore(data.length >= 30); setHasMoreNewer(false);
            if (socket) socket.emit('markAsRead', { conversationId });
        } catch (e) { console.error('resetToLatest:', e); }
    }, [conversationId, decryptMessages, socket, isGroup, groupMemberIds, e2e]);

    const clearJumpTarget = useCallback(() => setJumpTarget(null), []);

    return {
        messages, typingUsers,
        hasMore, hasMoreNewer,
        isLoadingMore, isLoadingNewer,
        jumpTarget, firstUnreadId,
        sendMessage, sendFileMessage, deleteMessage, editMessage,
        toggleReaction, notifyTyping,
        loadMoreMessages, loadNewerMessages, resetToLatest,
        jumpToMessage, clearJumpTarget,
        isOnline, offlineQueueCount: offlineQueue.length,
    };
};