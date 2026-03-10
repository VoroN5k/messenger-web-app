"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/src/store/useAuthStore";
import api from "@/src/lib/axios";
import { Loader2 } from "lucide-react";
import { jwtDecode } from "jwt-decode";
import {AuthResponse, JwtPayload, User} from "@/src/types/auth.types";

export const LoginForm = () => {
    const [isLoading, setIsLoading] = useState(false);
    const { register, handleSubmit, formState: { errors } } = useForm();
    const setAuth = useAuthStore((state) => state.setAuth);
    const router = useRouter();

    const onSubmit = async (data: any) => {
        setIsLoading(true);
        try {
            // На бекенді LoginDto очікує email та password
            const response = await api.post<AuthResponse>("/auth/login", data);
            const token = response.data.accessToken;

            const decoded: any = jwtDecode<JwtPayload>(token);

            const userFromToken: User ={
                id :decoded.sub,
                nickname: decoded.nickname,
                email: decoded.email,
                role: decoded.role
            }
            console.log("Backend response data: ", response.data);

            setAuth(userFromToken, token);

            window.location.href = "/chat";

        } catch (e: any) {
            const message = e.response?.data?.message || "Помилка входу";
            alert(message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
            <div className="mb-8 text-center">
                <h1 className="text-3xl font-bold text-gray-900">Вітаємо!</h1>
                <p className="text-gray-500 mt-2">Увійдіть у свій акаунт</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                        {...register("email", {
                            required: "Email обов'язковий",
                            pattern: { value: /^\S+@\S+$/i, message: "Невірний формат email" }
                        })}
                        type="email"
                        className={`w-full px-4 py-3 rounded-xl border ${errors.email ? 'border-red-500' : 'border-gray-200'} focus:ring-2 focus:ring-blue-500 outline-none transition-all`}
                        placeholder="john@doe.com"
                    />
                    {errors.email && <span className="text-red-500 text-xs mt-1">{errors.email.message as string}</span>}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
                    <input
                        {...register("password", { required: "Пароль обов'язковий" })}
                        type="password"
                        className={`w-full px-4 py-3 rounded-xl border ${errors.password ? 'border-red-500' : 'border-gray-200'} focus:ring-2 focus:ring-blue-500 outline-none transition-all`}
                        placeholder="••••••••"
                    />
                    {errors.password && <span className="text-red-500 text-xs mt-1">{errors.password.message as string}</span>}
                </div>

                <button
                    disabled={isLoading}
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center disabled:opacity-70"
                >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Увійти"}
                </button>
            </form>
        </div>
    );
};