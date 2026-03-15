import { useState, useEffect, useCallback } from 'react';
import api from '@/src/lib/axios';
import { useAuthStore } from '@/src/store/useAuthStore';
import { Conversation, Message } from '@/src/types/conversation.types';
import {useE2E} from "@/src/hooks/eseE2E";

export const useConversations = (socket: any) => {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [isLoading,     setIsLoading]     = useState(false);
    const accessToken = useAuthStore((s) => s.accessToken);
    const currentUserId = useAuthStore((s) => s.user?.id);

    const e2e = useE2E();

    // HELPER: decode lasMessage for one conversation (used on initial fetch)
    const decryptLastMessage = useCallback(async (conv: Conversation): Promise<Conversation> => {
        if (
            conv.type !== 'DIRECT' ||
            !conv.lastMessage?.content ||
            !conv.lastMessage.content.trim()
        ) return conv;

        const otherMember = conv.members.find(m => m.userId !== currentUserId);
        if (!otherMember) return conv;

        const c = conv.lastMessage.content;
        const isCiphertext = c.length > 20 && /^[A-Za-z0-9_\-]+$/.test(c);
        if (!isCiphertext) return conv;

        try {
            const plain = await e2e.decrypt(c, otherMember.userId);
            // Якщо decrypt повернув той самий ciphertext (E2E ще не готовий) — не оновлюємо
            if (plain === c) return conv;
            return { ...conv, lastMessage: { ...conv.lastMessage, content: plain } };
        } catch {
            return conv;
        }
    }, [currentUserId, e2e]);

    const fetchConversations = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await api.get<Conversation[]>('/conversations');
            const decrypted = await Promise.all(res.data.map(decryptLastMessage));
            setConversations(decrypted);
        } catch (e) {
            console.error('fetchConversations:', e);
        } finally {
            setIsLoading(false);
        }
    }, [decryptLastMessage]);

    // ── 1. Завантажуємо одразу коли є токен (не чекаємо E2E) ─────────────────
    useEffect(() => {
        if (!accessToken) return;
        fetchConversations();
    }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── 2. Коли E2E готовий — ре-декриптуємо lastMessages ────────────────────
    useEffect(() => {
        if (!e2e.isReady || !accessToken) return;
        fetchConversations();
    }, [e2e.isReady]);

    useEffect(() => {
        if (!socket) return;

        const onMessage = (msg: Message) => {
            const isOwnMessage = String(msg.senderId) === String(currentUserId);

            let displayContent = msg.content;
            const isCiphertext = msg.content?.length > 20 && /^[A-Za-z0-9_\-]+$/.test(msg.content ?? '');

            if (isCiphertext) {

                setConversations((prev) => {
                    const conv = prev.find(c => c.id === msg.conversationId);
                    const otherMember = conv?.members.find(m => m.userId !== currentUserId);
                    if (otherMember) {
                        e2e.decrypt(msg.content, otherMember.userId).then(plain => {
                            setConversations(prevConvs =>
                                prevConvs
                                    .map(c => c.id !== msg.conversationId ? c : {
                                        ...c,
                                        lastMessage: {
                                            id:        msg.id!,
                                            content:   plain,
                                            senderId:  Number(msg.senderId),
                                            createdAt: msg.createdAt as string,
                                            fileType:  msg.fileType ?? null,
                                            fileUrl:   msg.fileUrl  ?? null,
                                        },
                                        unreadCount: isOwnMessage ? c.unreadCount : c.unreadCount + 1,
                                        updatedAt:   msg.createdAt as string,
                                    })
                                    .sort((a, b) =>
                                        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                                    ),
                            );
                        });
                    }
                    return prev;
                });
                return;
            }

            setConversations((prev) =>
                prev
                    .map((c) =>
                        c.id !== msg.conversationId ? c : {
                            ...c,
                            lastMessage: {
                                id:        msg.id!,
                                content:   displayContent,
                                senderId:  Number(msg.senderId),
                                createdAt: msg.createdAt as string,
                                fileType:  msg.fileType ?? null,
                                fileUrl:   msg.fileUrl  ?? null,
                            },
                            unreadCount: isOwnMessage ? c.unreadCount : c.unreadCount + 1,
                            updatedAt:   msg.createdAt as string,
                        },
                    )
                    .sort((a, b) =>
                        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                    ),
            );
        }

        const onEdited = (data: {
            messageId: number;
            content: string;
            editedAt: string;
            conversationId: number;
        }) => {
            setConversations((prev) =>
                prev.map((c) => {
                    if (c.id !== data.conversationId) return c;
                    if (c.lastMessage?.id !== data.messageId) return c;

                    if (c.type === 'DIRECT') {
                        const otherMember = c.members.find(m => m.userId !== currentUserId);
                        if (otherMember) {
                            e2e.decrypt(data.content, otherMember.userId)
                                .then(plain => {
                                    setConversations(prev2 =>
                                    prev2.map(c2 =>
                                    c2.id !== data.conversationId ? c2 :
                                    c2.lastMessage?.id !== data.messageId ? c2 : {
                                        ...c2,
                                        lastMessage: { ...c2.lastMessage!, content: plain },
                                    }
                                )
                            );
                        })
                            .catch(() => {})
                    }
                        return c;
                }
                    return {
                    ...c,
                    lastMessage: { ...c.lastMessage!, content: data.content },
                    };
                })
            );
        };

        const onUserStatus = (data: { userId: number; isOnline: boolean }) => {
            setConversations((prev) =>
                prev.map((c) => {
                    if (c.type !== 'DIRECT') return c;
                    if (!c.members.some((m) => m.userId === data.userId)) return c;
                    return {
                        ...c,
                        isOnline: data.isOnline,
                        members:  c.members.map((m) =>
                            m.userId === data.userId
                                ? { ...m, user: { ...m.user, isOnline: data.isOnline } }
                                : m,
                        ),
                    };
                }),
            );
        };

        const onRead = (data: { userId: number; conversationId: number }) => {
            // Don't reset OUR unread here — handled by markConversationRead
            // But update for other users if needed in future
        };

        const onAdded = () => fetchConversations();

        const onPinned = (data: { conversationId: number; pinnedMessageId: number; pinnedMessage: any }) => {
            setConversations(prev => prev.map(c =>
                c.id !== data.conversationId ? c : {
                    ...c,
                    pinnedMessageId: data.pinnedMessageId,
                    pinnedMessage:   data.pinnedMessage,
                }
            ));
        };

        const onUnpinned = (data: { conversationId: number }) => {
            setConversations(prev => prev.map(c =>
                c.id !== data.conversationId ? c : { ...c, pinnedMessageId: null, pinnedMessage: null }
            ));
        };

        socket.on('onMessage',           onMessage);
        socket.on('messageEdited',       onEdited);
        socket.on('userStatusChanged',   onUserStatus);
        socket.on('conversationRead',    onRead);
        socket.on('addedToConversation', onAdded);
        socket.on('messagePinned', onPinned);
        socket.on('messageUnpinned', onUnpinned);

        return () => {
            socket.off('onMessage',           onMessage);
            socket.off('messageEdited',       onEdited);
            socket.off('userStatusChanged',   onUserStatus);
            socket.off('conversationRead',    onRead);
            socket.off('addedToConversation', onAdded);
            socket.off('messagePinned', onPinned);
            socket.off('messageUnpinned', onUnpinned);
        };
    }, [socket, fetchConversations]);

    const markConversationRead = useCallback((conversationId: number) => {
        setConversations((prev) =>
            prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
        );
    }, []);

    const addConversation = useCallback((conv: Conversation) => {
        setConversations((prev) => {
            if (prev.some((c) => c.id === conv.id)) return prev;
            return [conv, ...prev];
        });
    }, []);

    const updateConversation = useCallback((updated: Partial<Conversation> & { id: number }) => {
        setConversations((prev) =>
            prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)),
        );
    }, []);

    return {
        conversations,
        isLoading,
        fetchConversations,
        markConversationRead,
        addConversation,
        updateConversation,
    };
};