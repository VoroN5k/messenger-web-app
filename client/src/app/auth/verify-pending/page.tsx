'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/src/lib/axios';
import { Mail, ArrowLeft, RefreshCw, CheckCircle, Clock } from 'lucide-react';

const RESEND_COOLDOWN = 60; // seconds

export default function VerifyPendingPage() {
    const searchParams = useSearchParams();
    const email = searchParams.get('email') ?? '';

    const [sending,   setSending]   = useState(false);
    const [sent,      setSent]      = useState(false);
    const [error,     setError]     = useState('');
    const [cooldown,  setCooldown]  = useState(0);

    // Countdown timer
    useEffect(() => {
        if (cooldown <= 0) return;
        const id = setInterval(() => setCooldown(c => c - 1), 1000);
        return () => clearInterval(id);
    }, [cooldown]);

    const handleResend = async () => {
        if (!email || sending || cooldown > 0) return;
        setSending(true);
        setError('');
        setSent(false);
        try {
            await api.post('/auth/resend-verification', { email });
            setSent(true);
            setCooldown(RESEND_COOLDOWN);
        } catch (e: any) {
            const msg = e.response?.data?.message;
            setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Помилка. Спробуйте ще раз.'));
        } finally {
            setSending(false);
        }
    };

    return (
        <main className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-50 p-4">
            <div className="w-full max-w-md">
                <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">

                    {/* Icon */}
                    <div className="flex justify-center mb-6">
                        <div className="relative">
                            <div className="w-20 h-20 rounded-full bg-violet-100 flex items-center justify-center">
                                <Mail className="text-violet-500" size={36} />
                            </div>
                            {/* Pulse ring */}
                            <span className="absolute inset-0 rounded-full border-2 border-violet-300 animate-ping opacity-40" />
                        </div>
                    </div>

                    <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
                        Перевірте пошту
                    </h1>
                    <p className="text-gray-500 text-sm text-center leading-relaxed mb-6">
                        Ми надіслали лист підтвердження на{' '}
                        {email
                            ? <span className="font-medium text-gray-700">{email}</span>
                            : 'вашу адресу'}
                        . Натисніть посилання в листі, щоб активувати акаунт.
                    </p>

                    {/* Steps */}
                    <div className="space-y-3 mb-7">
                        {[
                            'Відкрийте лист від нас у вашій поштовій скриньці',
                            'Натисніть кнопку «Підтвердити Email»',
                            'Після підтвердження — увійдіть до акаунту',
                        ].map((step, i) => (
                            <div key={i} className="flex items-start gap-3">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-600 text-xs font-bold flex items-center justify-center mt-0.5">
                                    {i + 1}
                                </span>
                                <p className="text-sm text-gray-600">{step}</p>
                            </div>
                        ))}
                    </div>

                    {/* Spam hint */}
                    <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-6 flex items-start gap-2">
                        <Clock size={14} className="text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-700">
                            Не бачите листа? Перевірте папку <strong>Спам</strong> або{' '}
                            <strong>Промоакції</strong>. Лист може йти до 2 хвилин.
                        </p>
                    </div>

                    {/* Success message */}
                    {sent && (
                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 mb-4">
                            <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                            <p className="text-xs text-emerald-700">
                                Новий лист надіслано! Перевірте вашу поштову скриньку.
                            </p>
                        </div>
                    )}

                    {/* Error message */}
                    {error && (
                        <p className="text-xs text-red-500 text-center mb-4">{error}</p>
                    )}

                    {/* Resend button */}
                    <button
                        onClick={handleResend}
                        disabled={sending || cooldown > 0 || !email}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-violet-200
                                   text-violet-600 font-semibold text-sm
                                   hover:bg-violet-50 hover:border-violet-300
                                   disabled:opacity-50 disabled:cursor-not-allowed
                                   transition-all cursor-pointer"
                    >
                        {sending ? (
                            <><RefreshCw size={15} className="animate-spin" />Надсилаємо...</>
                        ) : cooldown > 0 ? (
                            <><Clock size={15} />Повторно через {cooldown}с</>
                        ) : (
                            <><RefreshCw size={15} />Надіслати ще раз</>
                        )}
                    </button>

                    {/* Login link */}
                    <div className="mt-5 pt-5 border-t border-gray-100 flex items-center justify-center gap-2">
                        <Link
                            href="/auth/login"
                            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <ArrowLeft size={13} />
                            Повернутись до входу
                        </Link>
                    </div>
                </div>

                <p className="text-center mt-6 text-xs text-gray-400">
                    Проблеми з підтвердженням?{' '}
                    <Link href="/auth/forgot-password" className="text-violet-600 hover:underline font-medium">
                        Відновити доступ
                    </Link>
                </p>
            </div>
        </main>
    );
}