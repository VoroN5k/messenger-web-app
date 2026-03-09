import { useState, useEffect } from "react";
import api from "@/src/lib/axios";

export const useUsers = (currentUserId: string | number | undefined, isLoaded: boolean) => {
    const [users, setUsers] = useState<any[]>([]);

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

    return { users, setUsers };
};