import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
    user: any | null;
    accessToken: string | null;
    setAuth: (user: any, token: string) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            accessToken: null,
            setAuth: (user, token) => {
                console.log("Setting auth in Zustand:", { user, token });
                set({ user: user, accessToken: token})
            },
            logout: () => set({ user: null, accessToken: null }),
        }),
        { name: 'auth-storage' } // Save token in storage automatically
    )
)