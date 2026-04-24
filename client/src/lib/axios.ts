import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { jwtDecode } from 'jwt-decode';

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
    withCredentials: true,
});

api.interceptors.request.use(async (config) => {
    let token = useAuthStore.getState().accessToken;

    if(token) {
        try {
            const { exp } = jwtDecode<{ exp: number }>(token);
            // If token is expired or will expire in the next 10 seconds, refresh it now
            // before request, not after 401 response
            if (exp * 1000 < Date.now() + 10_000) {
                const refreshed = await refreshAccessToken();
                token = refreshed;
            }
        } catch {
            // skip ( jwtDecode failed, token is invalid - will be handled by response interceptor )
        }
    }
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
        // Retry включно з одним повтором після 401
        // (401 може бути транзієнтним при wakeup або race на RT rotation)
        const MAX_401_RETRIES = 1;
        let unauthorizedCount = 0;

        for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
                const { data } = await axios.post(
                    `${apiUrl}/auth/refresh`,
                    {},
                    { withCredentials: true, timeout: 15_000 },
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
                const status = err?.response?.status ?? null;

                if (status === 401 || status === 403) {
                    unauthorizedCount++;
                    // Даємо один шанс — 401 може бути через race на RT rotation
                    if (unauthorizedCount <= MAX_401_RETRIES && attempt < RETRY_DELAYS_MS.length) {
                        await new Promise(res => setTimeout(res, RETRY_DELAYS_MS[attempt]));
                        continue;
                    }
                    // Тільки після повторного 401
                    break;
                }

                if (attempt < RETRY_DELAYS_MS.length) {
                    await new Promise(res => setTimeout(res, RETRY_DELAYS_MS[attempt]));
                    continue;
                }

                console.warn('[Auth] Server unavailable after retries');
                return null;
            }
        }

        // логаут тільки тут
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
            await axios.post(`${apiUrl}/auth/logout`, {}, { withCredentials: true });
        } catch {}

        useAuthStore.getState().logout();
        localStorage.removeItem('auth-storage');

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