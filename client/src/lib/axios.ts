import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';

const api = axios.create({
    baseURL: 'http://localhost:4000/api',
    withCredentials: true,
});

api.interceptors.request.use((config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// ── Дедуплікація refresh ──────────────────────────────────────────────────────
// Якщо кілька запитів одночасно отримують 401, робимо лише ОДИН refresh,
// а всі інші запити ставимо в чергу і відновлюємо після отримання нового токена.
let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

const processQueue = (token: string) => {
    refreshQueue.forEach((cb) => cb(token));
    refreshQueue = [];
};

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        const bypassUrls = ['/auth/login', '/auth/register', '/auth/refresh'];
        const isBypassUrl = bypassUrls.some((url) => originalRequest.url?.includes(url));

        if (error.response?.status === 401 && !originalRequest._retry && !isBypassUrl) {

            // Якщо refresh вже виконується — ставимо запит у чергу
            if (isRefreshing) {
                return new Promise<string>((resolve) => {
                    refreshQueue.push((token) => resolve(token));
                }).then((token) => {
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return api(originalRequest);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const { data } = await api.post('/auth/refresh');
                const newToken: string = data.accessToken;

                useAuthStore.getState().setAuth(useAuthStore.getState().user, newToken);

                // Відновлюємо всі запити, що чекали
                processQueue(newToken);

                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                return api(originalRequest);
            } catch (refreshError) {
                refreshQueue = [];
                useAuthStore.getState().logout();
                if (typeof window !== 'undefined' && window.location.pathname !== '/auth/login') {
                    window.location.href = '/auth/login';
                }
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    },
);

export default api;