import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/src/lib/axios';
import { Message, Reaction, ConversationType, QueuedMessage } from '@/src/types/conversation.types';
import { useE2E }          from './useE2E';
import { useOfflineQueue } from './useOfflineQueue';
import { parseMetadata }   from '@/src/lib/parseMetadata';
import { savePlaintext, loadPlaintext, saveMediaKey, loadMediaKey, consumePendingMediaKey } from '@/src/lib/cryptoDb';
import { b64Dec, unpackMediaKey, MEDIA_KEY_PREFIX } from '@/src/lib/mediaEncryption';

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

            const elapsed   = Date.now() - new Date(msg.createdAt).getTime();
            const remaining = destructAfterSeconds * 1000 - elapsed;

            if (remaining <= 0) {
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

    // Returns { payload, envelopes, senderDeviceId } for socket.emit
    const encryptDirect = useCallback(async (content: string): Promise<{
        payload: string;
        envelopes?: Array<{ deviceId: number; ciphertext: string }>;
        senderDeviceId?: number;
    }> => {
        if (e2e.myDeviceId && otherUserId) {
            const v3 = await e2e.encryptV3(content, otherUserId).catch(() => null);
            if (v3 && v3.envelopes.length > 0) {
                return { payload: v3.content, envelopes: v3.envelopes, senderDeviceId: e2e.myDeviceId };
            }
        }
        // Fall back to v2 DR
        const payload = await e2e.encrypt(content, otherUserId!);
        return { payload };
    }, [isDirect, otherUserId, e2e]);

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

    const looksEncrypted = (s?: string | null) =>
        !!s && s.length > 20 && (
            s.startsWith('v2:') || s.startsWith('v2g:') || s.startsWith('v3:') ||
            /^[A-Za-z0-9_\-]+$/.test(s)
        );

    // v1 ciphertext: encrypted but no versioned prefix
    const isLegacyCipher = (s: string) =>
        looksEncrypted(s) && !s.startsWith('v2:') && !s.startsWith('v2g:') && !s.startsWith('v3:');

    // Decrypts a replyTo reference: prefers plaintext cache (by id) over DR decrypt.
    // v3 reply content cannot be decrypted without envelopes, so cache is the only path.
    const resolveReplyContent = useCallback(async (
        replyTo: NonNullable<Message['replyTo']>,
        fallbackSenderId: number | string,
    ): Promise<string> => {
        if (replyTo.id) {
            const cached = await loadPlaintext(replyTo.id).catch(() => null);
            if (cached) return cached.content;
        }
        if (replyTo.content?.startsWith('v3:')) return replyTo.content; // no envelopes — can't decrypt
        return decryptContent(replyTo.content ?? '', fallbackSenderId).catch(() => replyTo.content ?? '');
    }, [decryptContent]);

    const decryptMessages = useCallback(async (raw: Message[]): Promise<Message[]> => {
        return Promise.all(raw.map(async msg => {
            let result = msg;

            // ── v3 multi-device: content is AES-GCM encrypted with a per-device DR key ──
            if (msg.content?.startsWith('v3:') && msg.senderDeviceId && msg.envelopes?.length) {
                if (msg.id) {
                    const cached = await loadPlaintext(msg.id).catch(() => null);
                    if (cached) {
                        result = { ...result, content: cached.content };
                        if (msg.fileUrl && cached.content.startsWith(MEDIA_KEY_PREFIX)) {
                            const packed = b64Dec(cached.content.slice(MEDIA_KEY_PREFIX.length));
                            const { key, iv } = unpackMediaKey(packed);
                            await saveMediaKey(msg.id, key, iv).catch(() => {});
                            return { ...result, content: '' };
                        }
                        return result;
                    }
                }
                try {
                    const plain = await e2e.decryptV3(msg.content, msg.senderDeviceId, msg.envelopes);
                    if (plain !== null) {
                        if (msg.id) savePlaintext(msg.id, plain).catch(() => {});
                        if (msg.fileUrl && plain.startsWith(MEDIA_KEY_PREFIX)) {
                            const packed = b64Dec(plain.slice(MEDIA_KEY_PREFIX.length));
                            const { key, iv } = unpackMediaKey(packed);
                            if (msg.id) await saveMediaKey(msg.id, key, iv).catch(() => {});
                            return { ...result, content: '' };
                        }
                        return { ...result, content: plain };
                    }
                } catch {}
                return { ...result, content: msg.fileUrl ? '' : '[🔒 Не вдалося розшифрувати]' };
            }

            // ── File message: content holds DR-wrapped AES media key (v2) ────
            if (msg.fileUrl && msg.content && looksEncrypted(msg.content)) {
                if (msg.id) {
                    const alreadyCached = await loadMediaKey(msg.id).catch(() => null);
                    if (!alreadyCached) {
                        try {
                            const decoded = await decryptContent(msg.content, msg.senderId);
                            if (decoded.startsWith(MEDIA_KEY_PREFIX)) {
                                const packed = b64Dec(decoded.slice(MEDIA_KEY_PREFIX.length));
                                const { key, iv } = unpackMediaKey(packed);
                                await saveMediaKey(msg.id, key, iv).catch(() => {});
                            }
                        } catch {}
                    }
                }
                return { ...result, content: '' };
            }

            if (msg.content && looksEncrypted(msg.content)) {
                // Signal DR is one-way: check local cache before touching the session
                if (msg.id) {
                    const cached = await loadPlaintext(msg.id).catch(() => null);
                    if (cached) {
                        result = { ...result, content: cached.content };
                        if (cached.isLegacy) result = { ...result, _isLegacy: true };
                        if (msg.replyTo?.content && looksEncrypted(msg.replyTo.content)) {
                            result = { ...result, replyTo: { ...result.replyTo!, content: await resolveReplyContent(msg.replyTo, msg.senderId) } };
                        }
                        return result;
                    }
                }
                const legacy = isLegacyCipher(msg.content);
                try {
                    const decrypted = await decryptContent(msg.content, msg.senderId);
                    if (msg.id && !decrypted.startsWith('[🔒')) {
                        savePlaintext(msg.id, decrypted, legacy).catch(() => {});
                    }
                    result = { ...result, content: decrypted };
                    if (legacy) result = { ...result, _isLegacy: true };
                } catch {
                    result = { ...result, content: '[🔒 Не вдалося розшифрувати]' };
                }
            }
            if (msg.replyTo?.content && looksEncrypted(msg.replyTo.content)) {
                result = { ...result, replyTo: { ...result.replyTo!, content: await resolveReplyContent(msg.replyTo, msg.senderId) } };
            }
            return result;
        }));
    }, [decryptContent, resolveReplyContent, e2e]);

    // Initial load
    useEffect(() => {
        if (!conversationId) {
            setMessages([]); setTypingUsers([]);
            setHasMore(true); setHasMoreNewer(false);
            setFirstUnreadId(null);
            return;
        }

        if (!e2e.isReady) return;

        setMessages([]); setTypingUsers([]);
        setHasMoreNewer(false); setFirstUnreadId(null);

        const ctrl = new AbortController();

        (async () => {
            try {
                if (isGroup && groupMemberIds?.length) {
                    await e2e.prefetchGroupSenderKeys(conversationId, groupMemberIds, socket);
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
    }, [conversationId, socket, e2e.isReady]);

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

    const clearUnreadDivider = useCallback(() => {
        setFirstUnreadId(null);
    }, []);

    // Socket events
    useEffect(() => {
        if (!socket) return;

        const onMessage = async (msg: Message) => {
            if (msg.conversationId !== conversationId) return;

            const isOwnEcho = String(msg.senderId) === String(currentUserId);
            let decryptedMsg = msg;

            if (isOwnEcho) {
                // Own echo: prefer plaintext from the optimistic message on this device.
                const rawCipher = msg.content;
                const optMsg = messagesRef.current.find(
                    m => !m.id && String(m.senderId) === String(currentUserId) && m._pendingCipher === rawCipher,
                ) ?? messagesRef.current.slice().reverse().find(
                    m => !m.id && String(m.senderId) === String(currentUserId),
                );

                let plaintext = rawCipher;
                if (optMsg) {
                    plaintext = optMsg.content;
                } else if (msg.id) {
                    // Different device of the same user — try local cache first
                    const cached = await loadPlaintext(msg.id).catch(() => null);
                    if (cached) {
                        plaintext = cached.content;
                    } else if (msg.content?.startsWith('v3:') && msg.senderDeviceId && msg.envelopes?.length) {
                        // Decrypt the per-device envelope intended for this device
                        const plain = await e2e.decryptV3(msg.content, msg.senderDeviceId, msg.envelopes).catch(() => null);
                        if (plain !== null) {
                            savePlaintext(msg.id, plain).catch(() => {});
                            plaintext = plain;
                        }
                    }
                }

                decryptedMsg = { ...msg, content: plaintext };
                if (msg.id && plaintext !== rawCipher) {
                    savePlaintext(msg.id, plaintext).catch(() => {});
                }
                // Persist media key from send-time for file messages
                if (msg.fileUrl && msg.id) {
                    const pending = consumePendingMediaKey(msg.fileUrl);
                    if (pending) {
                        await saveMediaKey(msg.id, pending.key, pending.iv).catch(() => {});
                    }
                    decryptedMsg = { ...decryptedMsg, content: '' };
                }
            } else {
                // ── v3 multi-device ───────────────────────────────────────────
                if (msg.content?.startsWith('v3:') && msg.senderDeviceId && msg.envelopes?.length) {
                    try {
                        const plain = await e2e.decryptV3(msg.content, msg.senderDeviceId, msg.envelopes);
                        if (plain !== null) {
                            if (msg.id) savePlaintext(msg.id, plain).catch(() => {});
                            if (msg.fileUrl && plain.startsWith(MEDIA_KEY_PREFIX)) {
                                const packed = b64Dec(plain.slice(MEDIA_KEY_PREFIX.length));
                                const { key, iv } = unpackMediaKey(packed);
                                if (msg.id) await saveMediaKey(msg.id, key, iv).catch(() => {});
                                decryptedMsg = { ...decryptedMsg, content: '' };
                            } else {
                                decryptedMsg = { ...decryptedMsg, content: plain };
                            }
                        } else {
                            decryptedMsg = { ...decryptedMsg, content: msg.fileUrl ? '' : '[🔒 Не вдалося розшифрувати]' };
                        }
                    } catch {
                        decryptedMsg = { ...decryptedMsg, content: msg.fileUrl ? '' : '[🔒 Не вдалося розшифрувати]' };
                    }
                // ── v2: file with encrypted media key in content ──────────────
                } else if (msg.fileUrl && msg.content && looksEncrypted(msg.content)) {
                    if (msg.id) {
                        const alreadyCached = await loadMediaKey(msg.id).catch(() => null);
                        if (!alreadyCached) {
                            try {
                                const decoded = await decryptContent(msg.content, msg.senderId);
                                if (decoded.startsWith(MEDIA_KEY_PREFIX)) {
                                    const packed = b64Dec(decoded.slice(MEDIA_KEY_PREFIX.length));
                                    const { key, iv } = unpackMediaKey(packed);
                                    await saveMediaKey(msg.id, key, iv).catch(() => {});
                                }
                            } catch {}
                        }
                    }
                    decryptedMsg = { ...decryptedMsg, content: '' };
                } else if (msg.content && looksEncrypted(msg.content)) {
                    const legacy = isLegacyCipher(msg.content);
                    try {
                        const decrypted = await decryptContent(msg.content, msg.senderId);
                        decryptedMsg = { ...decryptedMsg, content: decrypted };
                        if (legacy) decryptedMsg = { ...decryptedMsg, _isLegacy: true };
                        if (msg.id && !decrypted.startsWith('[🔒')) {
                            savePlaintext(msg.id, decrypted, legacy).catch(() => {});
                        }
                    } catch {
                        decryptedMsg = { ...decryptedMsg, content: '[🔒 Не вдалося розшифрувати]' };
                    }
                }
                if (msg.replyTo?.content && looksEncrypted(msg.replyTo.content)) {
                    const plain = await resolveReplyContent(msg.replyTo, msg.senderId);
                    decryptedMsg = { ...decryptedMsg, replyTo: { ...decryptedMsg.replyTo!, content: plain } };
                }
            }

            onDecryptedMessage?.(decryptedMsg);
            applyDestructTimers([decryptedMsg]);

            setMessages(prev => {
                if (decryptedMsg.id && prev.some(m => m.id === decryptedMsg.id)) return prev;

                if (isOwnEcho) {
                    // Match by ciphertext first, then fall back to last pending from me
                    const rawCipher = msg.content;
                    let idx = prev.findIndex(
                        m => !m.id && String(m.senderId) === String(currentUserId) && m._pendingCipher === rawCipher,
                    );
                    if (idx === -1) {
                        // Fallback: last unconfirmed optimistic from me (offline queue case)
                        for (let i = prev.length - 1; i >= 0; i--) {
                            if (!prev[i].id && String(prev[i].senderId) === String(currentUserId)) {
                                idx = i; break;
                            }
                        }
                    }
                    if (idx !== -1) {
                        const next = [...prev];
                        const opt  = next[idx];
                        if (opt._localBlobUrl) URL.revokeObjectURL(opt._localBlobUrl);
                        // For text messages: keep plaintext from optimistic (not the ciphertext).
                        // For file messages: content holds the media key envelope — clear it after echo.
                        const mergedContent = opt.fileUrl ? '' : opt.content;
                        next[idx] = { ...decryptedMsg, content: mergedContent, isPending: false, _queueId: undefined, _pendingCipher: undefined };
                        return next;
                    }
                    setHasMoreNewer(false);
                    return [...prev, decryptedMsg];
                }

                // Incoming message from peer — original matching logic
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
            if (!isOwnEcho) {
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

            const existingMsg = messagesRef.current.find(m => m.id === data.messageId);
            if (!existingMsg) return;

            const actualSenderId = data.senderId || existingMsg.senderId;

            let content = data.content;
            if (looksEncrypted(content) && actualSenderId) {
                try {
                    content = await decryptContent(content, actualSenderId);
                } catch {
                    console.error('[E2E] Помилка декриптації відредагованого повідомлення')
                }
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
    }, [socket, conversationId, currentUserId, decryptContent, applyDestructTimers, e2e]);

    // Offline queue
    const flushMessage = useCallback(async (msg: QueuedMessage): Promise<boolean> => {
        if (!socket?.connected) return false;
        try {
            const payload = await encryptContent(msg.content);
            socket.emit('sendMessage', { conversationId: msg.conversationId, content: payload, replyToId: msg.replyToId });
            return true;
        } catch { return false; }
    }, [socket, encryptContent]);

    const { queue: offlineQueue, isOnline, enqueue, flush } = useOfflineQueue(
        flushMessage,

        (failedMsg) => {
            setMessages(prev => prev.map(m =>
                m._queueId === failedMsg.queueId
                    ? { ...m, isPending: false, _sendFailed: true }
                    : m
            ));
        }
    );

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

        // Encrypt — if it fails we never show an optimistic message
        let payload: string;
        let envelopes: Array<{ deviceId: number; ciphertext: string }> | undefined;
        let senderDeviceId: number | undefined;
        try {
            if (isDirect && otherUserId) {
                const r = await encryptDirect(content);
                payload = r.payload;
                envelopes = r.envelopes;
                senderDeviceId = r.senderDeviceId;
            } else {
                payload = await encryptContent(content);
            }
        } catch (err) {
            console.error('[sendMessage] encrypt failed:', err);
            return;
        }

        // Add optimistic message with the ciphertext stored for echo matching
        setMessages(prev => [...prev, {
            content, senderId: currentUserId, conversationId,
            createdAt: new Date().toISOString(), deletedAt: null, editedAt: null,
            reactions: [], replyToId: replyToId ?? null, isRead: false,
            scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
            _queueId: tmpId, metadata: metadata ?? null,
            _pendingCipher: payload,
        }]);

        socket.emit('sendMessage', {
            conversationId,
            content: payload,
            replyToId,
            metadata,
            scheduledAt:    scheduledAt ? scheduledAt.toISOString() : undefined,
            senderDeviceId,
            envelopes,
        });

        socket.emit('typing', { conversationId, isTyping: false });
    }, [conversationId, currentUserId, socket, isOnline, enqueue, encryptContent, encryptDirect, isDirect, otherUserId]);

    const sendFileMessage = useCallback((payload: {
        fileUrl: string; fileName: string; fileType: string; fileSize: number;
        content?: string; metadata?: string; replyToId?: number; _localBlobUrl?: string;
        senderDeviceId?: number;
        envelopes?: Array<{ deviceId: number; ciphertext: string }>;
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
        jumpTarget, firstUnreadId, clearUnreadDivider,
        sendMessage, sendFileMessage, deleteMessage, editMessage,
        toggleReaction, notifyTyping,
        loadMoreMessages, loadNewerMessages, resetToLatest,
        jumpToMessage, clearJumpTarget,
        isOnline, offlineQueueCount: offlineQueue.length,
    };
};