import { useState, useEffect, useCallback } from 'react';
import api from '@/src/lib/axios';
import { useAuthStore } from '@/src/store/useAuthStore';
import { FriendItem, Friendship } from '@/src/types/conversation.types';

export const useFriends = (socket: any) => {
    const [friends,         setFriends]         = useState<FriendItem[]>([]);
    const [pendingRequests, setPendingRequests]  = useState<Friendship[]>([]);
    const accessToken = useAuthStore((s) => s.accessToken);

    const fetchAll = useCallback(async () => {
        try {
            const [f, p] = await Promise.all([
                api.get<FriendItem[]>('/friends'),
                api.get<Friendship[]>('/friends/requests/pending'),
            ]);
            setFriends(f.data);
            setPendingRequests(p.data);
        } catch (e) {
            console.error('useFriends fetch:', e);
        }
    }, []);

    useEffect(() => {
        if (!accessToken) return;
        fetchAll();
    }, [accessToken, fetchAll]);

    useEffect(() => {
        if (!socket) return;

        const onRequest  = () => fetchAll();
        const onRespond  = () => fetchAll();
        const onStatus   = (data: { userId: number; isOnline: boolean }) => {
            setFriends((prev) =>
                prev.map((f) =>
                    f.friend.id === data.userId
                        ? { ...f, friend: { ...f.friend, isOnline: data.isOnline } }
                        : f,
                ),
            );
        };

        socket.on('friendRequestReceived',  onRequest);
        socket.on('friendRequestResponded', onRespond);
        socket.on('userStatusChanged',      onStatus);

        return () => {
            socket.off('friendRequestReceived',  onRequest);
            socket.off('friendRequestResponded', onRespond);
            socket.off('userStatusChanged',      onStatus);
        };
    }, [socket, fetchAll]);

    const respondToRequest = useCallback(async (
        friendshipId: number,
        action: 'ACCEPTED' | 'DECLINED',
    ) => {
        await api.post('/friends/respond', { friendshipId, action });
        await fetchAll();
    }, [fetchAll]);

    const removeFriend = useCallback(async (friendId: number) => {
        await api.delete(`/friends/${friendId}`);
        setFriends((prev) => prev.filter((f) => f.friend.id !== friendId));
    }, []);

    const sendRequest = useCallback(async (receiverId: number) => {
        await api.post('/friends/request', { receiverId });
    }, []);

    return {
        friends,
        pendingRequests,
        fetchAll,
        respondToRequest,
        removeFriend,
        sendRequest,
    };
};