import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {User} from "@/src/types/auth.types";

interface AuthState {
    user: User | null;
    accessToken: string | null;
    _hasHydrated: boolean; // Прапорець стану
    setAuth: (user: any, token: string) => void;
    setHasHydrated: (state: boolean) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            accessToken: null,
            _hasHydrated: false,
            setAuth: (user, token) => set({ user, accessToken: token }),
            setHasHydrated: (state) => set({ _hasHydrated: state }),
            logout: () => set({ user: null, accessToken: null }),
        }),
        {
            name: 'auth-storage',
            onRehydrateStorage: () => (state) => {
                state?.setHasHydrated(true);
            }
        }
    )
);