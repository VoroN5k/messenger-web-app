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

        // Якщо помилка 401 і ми ще не намагалися оновити токен
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {

                const { data } = await api.post('/auth/refresh');


                useAuthStore.getState().setAuth(useAuthStore.getState().user, data.accessToken);

                // Повторюємо оригінальний запит із новим токеном
                originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
                return api(originalRequest);
            } catch (refreshError) {

                useAuthStore.getState().logout();
                window.location.href = '/auth/login';
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }
);

export default api;