'use client';

import { useState } from 'react';
import Link from 'next/link';
import api from '@/src/lib/axios';
import { Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
    const [email,   setEmail]   = useState('');
    const [loading, setLoading] = useState(false);
    const [sent,    setSent]    = useState(false);
    const [error,   setError]   = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) { setError("Введіть email"); return; }
        setLoading(true);
        setError('');
        try {
            await api.post('/auth/forgot-password', { email: email.trim() });
            setSent(true);
        } catch (err: any) {
            // Server always returns 200 to prevent enumeration,
            // but handle network errors gracefully
            const msg = err.response?.data?.message;
            setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Помилка. Спробуйте ще раз.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-50 p-4">
            <div className="w-full max-w-md">

                {sent ? (
                    /* ── Success state ── */
                    <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 text-center">
                        <div className="flex justify-center mb-5">
                            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                                <CheckCircle className="text-emerald-500" size={32} />
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">Лист надіслано!</h1>
                        <p className="text-gray-500 text-sm leading-relaxed mb-6">
                            Якщо акаунт з адресою <span className="font-medium text-gray-700">{email}</span> існує,
                            ми надіслали інструкції для відновлення паролю. Перевірте папку "Спам", якщо лист не прийшов.
                        </p>
                        <Link
                            href="/auth/login"
                            className="inline-flex items-center gap-2 text-sm text-violet-600 font-semibold hover:underline"
                        >
                            <ArrowLeft size={14} />
                            Повернутись до входу
                        </Link>
                    </div>
                ) : (
                    /* ── Form ── */
                    <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
                        <Link
                            href="/auth/login"
                            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 transition-colors mb-6"
                        >
                            <ArrowLeft size={14} />
                            Назад до входу
                        </Link>

                        <div className="mb-7">
                            <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center mb-4">
                                <Mail className="text-violet-600" size={22} />
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900">Забули пароль?</h1>
                            <p className="text-gray-500 text-sm mt-1.5">
                                Введіть email від вашого акаунту, і ми надішлемо посилання для відновлення.
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => { setEmail(e.target.value); setError(''); }}
                                    placeholder="your@email.com"
                                    autoFocus
                                    className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all
                                        ${error
                                        ? 'border-red-400 focus:ring-2 focus:ring-red-100'
                                        : 'border-gray-200 focus:ring-2 focus:ring-violet-200 focus:border-violet-400'
                                    }`}
                                />
                                {error && (
                                    <p className="text-xs text-red-500 mt-1.5">{error}</p>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={loading || !email.trim()}
                                className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed
                                           text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                                {loading ? (
                                    <><Loader2 size={16} className="animate-spin" />Надсилаємо...</>
                                ) : (
                                    'Надіслати посилання'
                                )}
                            </button>
                        </form>
                    </div>
                )}

                <p className="text-center mt-6 text-sm text-gray-500">
                    Згадали пароль?{' '}
                    <Link href="/auth/login" className="text-violet-600 font-semibold hover:underline">
                        Увійти
                    </Link>
                </p>
            </div>
        </main>
    );
}