import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';

const api = axios.create({
    baseURL: 'http://localhost:4000/api',
});

api.interceptors.request.use(
    (config) => {
        // Дістаємо стан
        const state = useAuthStore.getState();
        const token = state.accessToken;

        console.log("Axios Interceptor - Token found:", !!token);

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

export default api;
