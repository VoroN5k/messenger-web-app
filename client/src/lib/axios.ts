import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
    withCredentials: true,
});

api.interceptors.request.use((config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
    // Встановлюємо refreshPromise СИНХРОННО до будь-яких await —
    // це унеможливлює race condition коли два виклики одночасно
    // проходять перевірку `if (refreshPromise)`
    if (refreshPromise) return refreshPromise;

    refreshPromise = _doRefresh().finally(() => {
        refreshPromise = null;
    });

    return refreshPromise;
}

async function _doRefresh(): Promise<string | null> {
    const execute = async (): Promise<string | null> => {
        try {
            const { data } = await axios.post(
                'http://localhost:4000/api/auth/refresh',
                {},
                { withCredentials: true },
            );
            const newToken: string = data.accessToken;
            const currentUser = useAuthStore.getState().user;

            if (!currentUser) throw new Error('No user in store after refresh');

            useAuthStore.getState().setAuth(currentUser, newToken);
            return newToken;
        } catch {
            useAuthStore.getState().logout();
            if (typeof window !== 'undefined' && window.location.pathname !== '/auth/login') {
                window.location.href = '/auth/login';
            }
            return null;
        }
    };

    if (typeof navigator !== 'undefined' && navigator.locks) {
        return navigator.locks.request('refresh_token_lock', execute);
    }
    return execute();
}

const bypassUrls = ['/auth/login', '/auth/register', '/auth/refresh'];

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        const isBypassUrl = bypassUrls.some((url) => originalRequest.url?.includes(url));

        if (error.response?.status === 401 && !originalRequest._retry && !isBypassUrl) {
            originalRequest._retry = true;

            const newToken = await refreshAccessToken();
            if (!newToken) return Promise.reject(error);

            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
        }

        return Promise.reject(error);
    },
);

export default api;