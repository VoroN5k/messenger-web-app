import { useState, useEffect } from "react";
import api from "@/src/lib/axios";
import { User } from "@/src/types/auth.types";

export const useUsers = (
    currentUserId: string | number | undefined,
    isLoaded: boolean,
    socket: any,
) => {
    const [users, setUsers] = useState<User[]>([]);

    useEffect(() => {
        if (!isLoaded || !currentUserId) return;

        const controller = new AbortController();

        api.get("/users", { signal: controller.signal })
            .then((res) => {
                setUsers(res.data.filter((u: any) => String(u.id) !== String(currentUserId)));
            })
            .catch((e) => {
                if (e.name !== 'CanceledError') console.error("Failed to fetch users", e);
            });

        return () => controller.abort();
    }, [isLoaded, currentUserId]);

    useEffect(() => {
        if (!socket) return;
        const handleStatusChange = (data: { userId: number | string; isOnline: boolean }) => {
            setUsers((prev) =>
                prev.map((u) =>
                    String(u.id) === String(data.userId) ? { ...u, isOnline: data.isOnline } : u,
                ),
            );
        };
        socket.on("userStatusChanged", handleStatusChange);
        return () => { socket.off("userStatusChanged", handleStatusChange); };
    }, [socket]);

    return { users, setUsers };
};