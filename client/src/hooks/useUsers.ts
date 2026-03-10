import { useState, useEffect } from "react";
import api from "@/src/lib/axios";
import {User} from "@/src/types/auth.types";

export const useUsers = (currentUserId: string | number | undefined, isLoaded: boolean, socket: any) => {
    const [users, setUsers] = useState<User[]>([]);

    useEffect(() => {
        if (!isLoaded || !currentUserId) return;

        const fetchUsers = async () => {
            try {
                const res = await api.get("/users");
                setUsers(res.data.filter((u: any) => String(u.id) !== String(currentUserId)));
            } catch (e) {
                console.error("Failed to fetch users");
            }
        };

        fetchUsers();
    }, [isLoaded, currentUserId]);

    useEffect(() => {
        if (!socket) return;

        const handleStatusChange = (data: { userId: number | string; isOnline: boolean}) =>{
            console.log("Status changed for user:", data.userId, "isOnline:", data.isOnline);

            setUsers((prevUsers) =>
                prevUsers.map((user) =>
                    String(user.id) === String(data.userId)
                    ? { ...user, isOnline: data.isOnline}
                    : user
                )
            );
        }

        socket.on("userStatusChanged", handleStatusChange);

        return () => {
            socket.off("userStatusChanged", handleStatusChange);
        }
    }, [socket]);

    return { users, setUsers };
};