import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';

const api = axios.create({
    baseURL: 'http://localhost:4000/api',
    withCredentials: true,
});

api.interceptors.request.use((config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// ── Single shared refresh lock ────────────────────────────────────────────────
// All refresh attempts (proactive, silent timer, 401 interceptor) go through
// this one function. If a refresh is already in-flight, callers await the same
// promise instead of firing a second request — which is what caused the
// "Security alert! Token reuse" loop when the computer woke up.

let refreshPromise: Promise<string | null> | null = null;



export async function refreshAccessToken(): Promise<string | null> {
    // If a refresh is already in-flight, return the same promise
    if (refreshPromise) return refreshPromise;

    if (typeof navigator !== 'undefined' && navigator.locks) {
        // Use a lock to ensure only one refresh at a time across tabs
        return navigator.locks.request('refresh_token_lock', async () => {

            return executeRefresh();
        })
    }
    return executeRefresh();
}

async function executeRefresh(): Promise<string | null> {
    refreshPromise = (async () => {
        try {
            const { data } = await axios.post(
                'http://localhost:4000/api/auth/refresh',
                {},
                { withCredentials: true },
            );
            const newToken: string = data.accessToken;
            const currentUser = useAuthStore.getState().user;

            if (!currentUser) throw new Error("Cross-tab sync error");

            useAuthStore.getState().setAuth(currentUser, newToken);
            return newToken;
        } catch {
            useAuthStore.getState().logout();
            if (typeof window !== 'undefined' && window.location.pathname !== '/auth/login') {
                window.location.href = '/auth/login';
            }
            return null;
        } finally {
            refreshPromise = null;
        }
    })();
    return refreshPromise;
}

// ── 401 interceptor ───────────────────────────────────────────────────────────
// Uses the shared refreshAccessToken() — no separate isRefreshing flag needed.

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