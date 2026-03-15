'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/src/lib/axios';
import { Loader2, KeyRound, Eye, EyeOff, CheckCircle, XCircle, ArrowLeft } from 'lucide-react';

function PasswordStrength({ password }: { password: string }) {
    const score = [
        password.length >= 8,
        /[A-Z]/.test(password),
        /[0-9]/.test(password),
        /[^A-Za-z0-9]/.test(password),
    ].filter(Boolean).length;

    const levels = [
        { label: 'Дуже слабкий', color: 'bg-red-500',    text: 'text-red-500'    },
        { label: 'Слабкий',      color: 'bg-orange-400', text: 'text-orange-500' },
        { label: 'Середній',     color: 'bg-yellow-400', text: 'text-yellow-500' },
        { label: 'Сильний',      color: 'bg-emerald-400',text: 'text-emerald-500'},
        { label: 'Дуже сильний', color: 'bg-emerald-500',text: 'text-emerald-600'},
    ];
    const level = levels[score] ?? levels[0];

    return (
        <div className="space-y-1.5 mt-2">
            <div className="flex gap-1">
                {[0,1,2,3].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300
                        ${i < score ? level.color : 'bg-slate-200'}`} />
                ))}
            </div>
            <p className={`text-xs font-medium ${level.text}`}>{level.label}</p>
        </div>
    );
}

export default function ResetPasswordPage() {
    const searchParams = useSearchParams();
    const router       = useRouter();
    const token        = searchParams.get('token') ?? '';

    const [password,  setPassword]  = useState('');
    const [confirm,   setConfirm]   = useState('');
    const [showPass,  setShowPass]  = useState(false);
    const [showConf,  setShowConf]  = useState(false);
    const [loading,   setLoading]   = useState(false);
    const [success,   setSuccess]   = useState(false);
    const [error,     setError]     = useState('');

    // Redirect to login after successful reset
    useEffect(() => {
        if (!success) return;
        const t = setTimeout(() => router.push('/auth/login'), 3000);
        return () => clearTimeout(t);
    }, [success, router]);

    const validate = () => {
        if (!token)                  return 'Посилання недійсне або застаріле';
        if (password.length < 6)     return 'Пароль — мінімум 6 символів';
        if (password !== confirm)    return 'Паролі не збігаються';
        return '';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const err = validate();
        if (err) { setError(err); return; }

        setLoading(true);
        setError('');
        try {
            await api.post('/auth/reset-password', { token, newPassword: password });
            setSuccess(true);
        } catch (err: any) {
            const msg = err.response?.data?.message;
            setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Помилка. Спробуйте ще раз.'));
        } finally {
            setLoading(false);
        }
    };

    // ── Invalid / missing token ───────────────────────────────────────────────
    if (!token) {
        return (
            <main className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
                <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 max-w-md w-full text-center">
                    <div className="flex justify-center mb-4">
                        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                            <XCircle className="text-red-500" size={32} />
                        </div>
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Недійсне посилання</h1>
                    <p className="text-gray-500 text-sm mb-6">
                        Посилання для відновлення паролю недійсне або термін його дії минув.
                        Спробуйте запросити нове.
                    </p>
                    <Link
                        href="/auth/forgot-password"
                        className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
                    >
                        Запросити новий лист
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-50 p-4">
            <div className="w-full max-w-md">
                <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">

                    {success ? (
                        /* ── Success ── */
                        <div className="text-center">
                            <div className="flex justify-center mb-5">
                                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                                    <CheckCircle className="text-emerald-500" size={32} />
                                </div>
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 mb-2">Пароль змінено!</h1>
                            <p className="text-gray-500 text-sm mb-6">
                                Ваш пароль успішно оновлено. Зараз вас перенаправлять на сторінку входу...
                            </p>
                            <Link
                                href="/auth/login"
                                className="inline-flex items-center gap-2 text-sm text-violet-600 font-semibold hover:underline"
                            >
                                <ArrowLeft size={14} />
                                Увійти зараз
                            </Link>
                        </div>
                    ) : (
                        /* ── Form ── */
                        <>
                            <div className="mb-7">
                                <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center mb-4">
                                    <KeyRound className="text-violet-600" size={22} />
                                </div>
                                <h1 className="text-2xl font-bold text-gray-900">Новий пароль</h1>
                                <p className="text-gray-500 text-sm mt-1.5">
                                    Введіть новий пароль для вашого акаунту.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* New password */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Новий пароль
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPass ? 'text' : 'password'}
                                            value={password}
                                            onChange={e => { setPassword(e.target.value); setError(''); }}
                                            placeholder="мінімум 6 символів"
                                            autoFocus
                                            autoComplete="new-password"
                                            className="w-full px-4 py-3 pr-10 rounded-xl border border-gray-200 text-sm outline-none
                                                       focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all"
                                        />
                                        <button type="button" onClick={() => setShowPass(s => !s)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                                            {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                                        </button>
                                    </div>
                                    {password && <PasswordStrength password={password} />}
                                </div>

                                {/* Confirm */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Підтвердження паролю
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showConf ? 'text' : 'password'}
                                            value={confirm}
                                            onChange={e => { setConfirm(e.target.value); setError(''); }}
                                            placeholder="повторіть пароль"
                                            autoComplete="new-password"
                                            className={`w-full px-4 py-3 pr-10 rounded-xl border text-sm outline-none transition-all
                                                ${confirm && confirm !== password
                                                ? 'border-red-400 focus:ring-2 focus:ring-red-100'
                                                : 'border-gray-200 focus:ring-2 focus:ring-violet-200 focus:border-violet-400'
                                            }`}
                                        />
                                        <button type="button" onClick={() => setShowConf(s => !s)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                                            {showConf ? <EyeOff size={15} /> : <Eye size={15} />}
                                        </button>
                                    </div>
                                    {confirm && confirm !== password && (
                                        <p className="text-xs text-red-500 mt-1">Паролі не збігаються</p>
                                    )}
                                </div>

                                {/* Error */}
                                {error && (
                                    <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                                        <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                                        <p className="text-sm text-red-600">{error}</p>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading || !password || !confirm}
                                    className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed
                                               text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
                                >
                                    {loading ? (
                                        <><Loader2 size={16} className="animate-spin" />Збереження...</>
                                    ) : (
                                        'Встановити новий пароль'
                                    )}
                                </button>
                            </form>
                        </>
                    )}
                </div>

                {!success && (
                    <p className="text-center mt-6 text-sm text-gray-500">
                        <Link href="/auth/login" className="text-violet-600 font-semibold hover:underline inline-flex items-center gap-1">
                            <ArrowLeft size={12} />
                            Повернутись до входу
                        </Link>
                    </p>
                )}
            </div>
        </main>
    );
}