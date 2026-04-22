import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';

const RETRY_DELAYS_MS = [1_000, 3_000, 6_000]; // 1s, 3s, 6s

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
        let lastError: unknown;

        for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
                const { data } = await axios.post(
                    `${apiUrl}/auth/refresh`,
                    {},
                    {
                        withCredentials: true,
                        timeout: 12_000, // явний таймаут на cold start
                    },
                );

                const newToken: string = data.accessToken;
                const currentUser = useAuthStore.getState().user;

                if (currentUser) {
                    useAuthStore.getState().setAuth(currentUser, newToken);
                } else {
                    useAuthStore.setState({ accessToken: newToken });
                }
                return newToken;

            } catch (err: any) {
                lastError = err;

                const status = err?.response?.status;
                // 401/403 — токен справді невалідний, retry не допоможе
                if (status === 401 || status === 403) break;

                // Остання спроба
                if (attempt === RETRY_DELAYS_MS.length) break;

                // Сервер спить — чекаємо і пробуємо ще
                await new Promise(res => setTimeout(res, RETRY_DELAYS_MS[attempt]));
            }
        }

        // Всі спроби вичерпано
        useAuthStore.getState().logout();
        if (typeof window !== 'undefined' && window.location.pathname !== '/auth/login') {
            window.location.href = '/auth/login';
        }
        return null;
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