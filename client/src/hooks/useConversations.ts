import {useState, useEffect, useCallback, useRef} from 'react';
import api from '@/src/lib/axios';
import { useAuthStore } from '@/src/store/useAuthStore';
import { Conversation, Message } from '@/src/types/conversation.types';
import {useE2E} from "@/src/hooks/useE2E";

export const useConversations = (socket: any, activeConversationId?: number) => {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [isLoading,     setIsLoading]     = useState(false);
    const accessToken = useAuthStore((s) => s.accessToken);
    const currentUserId = useAuthStore((s) => s.user?.id);

    const activeConvIdRef = useRef<number | undefined>(activeConversationId)
    useEffect(() => {
        activeConvIdRef.current = activeConversationId;
    }, [activeConversationId]);

    const convsRef = useRef<Conversation[]>([]);
    useEffect(() => {
        convsRef.current = conversations;
    }, [conversations]);

    const e2e = useE2E();

    // HELPER: decode lasMessage for one conversation (used on initial fetch)
    const decryptLastMessage = useCallback(async (conv: Conversation): Promise<Conversation> => {
        if (!conv.lastMessage?.content || !conv.lastMessage.content.trim()) return conv;

        const c = conv.lastMessage.content;
        const isCiphertext = c.length > 20 && /^[A-Za-z0-9_\-]+$/.test(c);
        if (!isCiphertext) return conv;

        try {
            let plain: string;

            if (conv.type === 'DIRECT') {
                const otherMember = conv.members.find(m => m.userId !== currentUserId);
                if (!otherMember) return conv;
                plain = await e2e.decrypt(c, otherMember.userId);
                if (plain === c) return conv;
            } else if (conv.type === 'GROUP') {
                plain = await e2e.decryptFromGroup(c, conv.id, Number(conv.lastMessage!.senderId));
                if (plain === c) return conv;
            } else {
                return conv;
            }

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

        const onMessage = async (msg: Message) => {
            const isOwnMessage = String(msg.senderId) === String(currentUserId);
            const isCiphertext = msg.content?.length > 20 && /^[A-Za-z0-9_\-]+$/.test(msg.content ?? '');

            // 1. Беремо бесіду з REF — це миттєво, синхронно і не залежить від черг React
            const targetConv = convsRef.current.find((c) => c.id === msg.conversationId);
            if (!targetConv) return;

            let plainContent = msg.content;

            // 2. Декриптація
            if (isCiphertext) {
                try {
                    if (targetConv.type === 'DIRECT') {
                        const otherMember = targetConv.members.find((m) => m.userId !== currentUserId);
                        if (otherMember) {
                            plainContent = await e2e.decrypt(msg.content, otherMember.userId);
                        }
                    } else if (targetConv.type === 'GROUP') {
                        plainContent = await e2e.decryptFromGroup(msg.content, targetConv.id, Number(msg.senderId));
                    }
                } catch (e) {
                    console.error('onMessage decrypt error:', e);
                }
            }

            // 3. Оновлення з урахуванням черговості
            setConversations((prev) =>
                prev.map((c) => {
                    if (c.id !== msg.conversationId) return c;

                    // ЗАХИСТ ВІД ПЕРЕГОНІВ (Race condition):
                    // Перевіряємо, чи це повідомлення новіше за те, що ВЖЕ лежить у state.
                    // Це важливо, бо довга декриптація старого повідомлення може закінчитись ПІЗНІШЕ за нове.
                    const isNewer = !c.lastMessage || new Date(msg.createdAt).getTime() >= new Date(c.lastMessage.createdAt).getTime();

                    return {
                        ...c,
                        lastMessage: isNewer ? {
                            id:        msg.id!,
                            content:   plainContent,
                            senderId:  Number(msg.senderId),
                            createdAt: msg.createdAt as string,
                            fileType:  msg.fileType ?? null,
                            fileUrl:   msg.fileUrl  ?? null,
                        } : c.lastMessage,
                        unreadCount: isOwnMessage || msg.conversationId === activeConvIdRef.current
                            ? c.unreadCount
                            : c.unreadCount + 1,
                        updatedAt: isNewer ? (msg.createdAt as string) : c.updatedAt,
                    };
                }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            );
        };

        const onEdited = async (data: {
            messageId: number;
            content: string;
            editedAt: string;
            conversationId: number;
            senderId?: number;
        }) => {
            // Теж дістаємо через REF
            const targetConv = convsRef.current.find((c) => c.id === data.conversationId);
            if (!targetConv || targetConv.lastMessage?.id !== data.messageId) return;

            const isCiphertext = data.content?.length > 20 && /^[A-Za-z0-9_\-]+$/.test(data.content);
            let plainContent = data.content;

            if (isCiphertext) {
                const actualSenderId = data.senderId || targetConv.lastMessage.senderId;
                try {
                    if (targetConv.type === 'DIRECT') {
                        const otherMember = targetConv.members.find((m) => m.userId !== currentUserId);
                        if (otherMember) {
                            plainContent = await e2e.decrypt(data.content, otherMember.userId);
                        }
                    } else if (targetConv.type === 'GROUP') {
                        plainContent = await e2e.decryptFromGroup(data.content, targetConv.id, Number(actualSenderId));
                    }
                } catch (e) {
                    console.error('onEdited decrypt error:', e);
                }
            }

            setConversations((prev) =>
                prev.map((c) =>
                    c.id !== data.conversationId ? c : {
                        ...c,
                        lastMessage: { ...c.lastMessage!, content: plainContent },
                    }
                )
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