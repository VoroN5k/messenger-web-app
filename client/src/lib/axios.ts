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

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;


        const bypassUrls = ['/auth/login', '/auth/register', '/auth/refresh'];

        const isBypassUrl = bypassUrls.some(url => originalRequest.url?.includes(url));

        if (error.response?.status === 401 && !originalRequest._retry && !isBypassUrl) {
            originalRequest._retry = true;

            try {
                const { data } = await api.post('/auth/refresh');

                useAuthStore.getState().setAuth(useAuthStore.getState().user, data.accessToken);
                originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;

                return api(originalRequest);
            } catch (refreshError) {
                useAuthStore.getState().logout();

                if (window.location.pathname !== '/auth/login') {
                    window.location.href = '/auth/login';
                }

                return Promise.reject(refreshError);
            }
        }


        return Promise.reject(error);
    }
);

export default api;