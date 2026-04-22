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
    if (refreshPromise) return refreshPromise;
    refreshPromise = _doRefresh().finally(() => {
        refreshPromise = null;
    });
    return refreshPromise;
}

const RETRY_DELAYS_MS = [2_000, 5_000, 8_000];

async function _doRefresh(): Promise<string | null> {
    const execute = async (): Promise<string | null> => {
        let lastStatus: number | null = null;

        for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
                const { data } = await axios.post(
                    `${apiUrl}/auth/refresh`,
                    {},
                    {
                        withCredentials: true,
                        timeout: 15_000,
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
                lastStatus = err?.response?.status ?? null;

                // Тільки 401/403 означають що токен справді невалідний
                // Все інше (network error, 502, 503, timeout) — сервер просто спить
                if (lastStatus === 401 || lastStatus === 403) {
                    break;
                }

                if (attempt < RETRY_DELAYS_MS.length) {
                    await new Promise(res => setTimeout(res, RETRY_DELAYS_MS[attempt]));
                    continue;
                }

                // Всі спроби вичерпано, але це НЕ auth помилка —
                // повертаємо null без logout (сервер недоступний тимчасово)
                console.warn('[Auth] Server unavailable after retries, staying logged in');
                return null;
            }
        }

        // Тільки сюди потрапляємо при 401/403 — справжній logout
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