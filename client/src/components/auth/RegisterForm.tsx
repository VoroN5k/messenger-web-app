"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import api from "@/src/lib/axios";
import { Loader2, UserPlus, Mail, Lock, UserCircle } from "lucide-react";

export const RegisterForm = () => {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors }
    } = useForm();


    const password = watch("password");

    const onSubmit = async (data: any) => {
        setIsLoading(true);
        try {

            const response = await api.post("/auth/register", {
                ...data,
                meta: {
                    userAgent: window.navigator.userAgent,
                    ip: "127.0.0.1"
                }
            });

            alert("Реєстрація успішна! Тепер підтвердіть email у базі та увійдіть.");
            router.push("/auth//login");
        } catch (e: any) {
            const errorMsg = e.response?.data?.message || "Помилка при реєстрації";
            alert(Array.isArray(errorMsg) ? errorMsg[0] : errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
            <div className="mb-8 text-center">
                <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <UserPlus className="text-green-600" size={30} />
                </div>
                <h1 className="text-3xl font-bold text-gray-900">Створити акаунт</h1>
                <p className="text-gray-500 mt-2">Приєднуйтесь до нашого месенджера</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* NICKNAME */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                        <UserCircle size={16} /> Нікнейм
                    </label>
                    <input
                        {...register("nickname", {
                            required: "Нікнейм обов'язковий",
                            minLength: { value: 3, message: "Мінімум 3 символи" }
                        })}
                        className={`w-full px-4 py-3 rounded-xl border ${errors.nickname ? 'border-red-500' : 'border-gray-200'} focus:ring-2 focus:ring-green-500 outline-none transition-all`}
                        placeholder="super_chat_user"
                    />
                    {errors.nickname && <span className="text-red-500 text-xs mt-1">{errors.nickname.message as string}</span>}
                </div>

                {/* EMAIL */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                        <Mail size={16} /> Email
                    </label>
                    <input
                        {...register("email", {
                            required: "Email обов'язковий",
                            pattern: { value: /^\S+@\S+$/i, message: "Некоректний формат email" }
                        })}
                        type="email"
                        className={`w-full px-4 py-3 rounded-xl border ${errors.email ? 'border-red-500' : 'border-gray-200'} focus:ring-2 focus:ring-green-500 outline-none transition-all`}
                        placeholder="example@mail.com"
                    />
                    {errors.email && <span className="text-red-500 text-xs mt-1">{errors.email.message as string}</span>}
                </div>

                {/* PASSWORD */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                            <Lock size={16} /> Пароль
                        </label>
                        <input
                            {...register("password", {
                                required: "Пароль обов'язковий",
                                minLength: { value: 6, message: "Мінімум 6 символів" }
                            })}
                            type="password"
                            className={`w-full px-4 py-3 rounded-xl border ${errors.password ? 'border-red-500' : 'border-gray-200'} focus:ring-2 focus:ring-green-500 outline-none transition-all`}
                            placeholder="••••••"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                            <Lock size={16} /> Підтвердження
                        </label>
                        <input
                            {...register("confirmPassword", {
                                required: "Потрібно підтвердити пароль",
                                validate: (value) => value === password || "Паролі не збігаються"
                            })}
                            type="password"
                            className={`w-full px-4 py-3 rounded-xl border ${errors.confirmPassword ? 'border-red-500' : 'border-gray-200'} focus:ring-2 focus:ring-green-500 outline-none transition-all`}
                            placeholder="••••••"
                        />
                    </div>
                </div>
                {(errors.password || errors.confirmPassword) && (
                    <span className="text-red-500 text-xs mt-1">
            {(errors.password?.message || errors.confirmPassword?.message) as string}
          </span>
                )}

                <button
                    disabled={isLoading}
                    type="submit"
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl mt-4 transition-all flex items-center justify-center disabled:opacity-70"
                >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Зареєструватися"}
                </button>
            </form>
        </div>
    );
};