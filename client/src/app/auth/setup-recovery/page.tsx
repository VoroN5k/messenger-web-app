'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, Eye, EyeOff, Check, Loader2, KeyRound, ArrowRight } from 'lucide-react';
import { useE2E } from '@/src/hooks/useE2E';
import { useAuthStore } from '@/src/store/useAuthStore';
import api from "@/src/lib/axios";
import { TwoFactorVerifyModal } from "@/src/components/auth/TwoFactorVerifyModal";

function PinStrength({ pin }: { pin: string }) {
    const score = [
        pin.length >= 6,
        pin.length >= 10,
        /[A-Z]/.test(pin),
        /[A-Z]/.test(pin),
        /[0-9]/.test(pin),
        /[^A-Za-z0-9]/.test(pin),
    ].filter(Boolean).length;

    const levels = [
        { label: 'Дуже слабкий', color: 'bg-red-500',     text: 'text-red-500'    },
        { label: 'Слабкий',      color: 'bg-orange-400',  text: 'text-orange-500' },
        { label: 'Середній',     color: 'bg-yellow-400',  text: 'text-yellow-500' },
        { label: 'Надійний',     color: 'bg-emerald-400', text: 'text-emerald-600'},
        { label: 'Відмінний',    color: 'bg-emerald-500', text: 'text-emerald-700'},
    ];
    const level = levels[Math.min(score, 4)];

    return (
        <div className="space-y-1.5 mt-2">
            <div className="flex gap-1">
                {[0,1,2,3,4].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300
                        ${i < score ? level.color : 'bg-slate-200'}`} />
                ))}
            </div>
            <p className={`text-xs font-medium ${level.text}`}>{level.label}</p>
        </div>
    );
}

export default function SetupRecoveryPage() {
    const router       = useRouter();
    const searchParams = useSearchParams();
    const isVerified   = searchParams.get('verified') === 'true';
    const isReset      = searchParams.get('reset') === 'true';

    const { user, _hasHydrated } = useAuthStore();
    const { isReady, setupRecovery } = useE2E();

    // All state declarations at the top
    const [pin,         setPin]         = useState('');
    const [confirm,     setConfirm]     = useState('');
    const [showPin,     setShowPin]     = useState(false);
    const [showConf,    setShowConf]    = useState(false);
    const [loading,     setLoading]     = useState(false);
    const [success,     setSuccess]     = useState(false);
    const [error,       setError]       = useState('');

    // 2FA state
    const [twoFACode,   setTwoFACode]   = useState('');
    const [show2FA,     setShow2FA]     = useState(false);
    const [twoFADone,   setTwoFADone]   = useState(false);
    const [checking2FA, setChecking2FA] = useState(false);

    // Redirect if not logged in
    useEffect(() => {
        if (_hasHydrated && !user) router.push('/auth/login');
    }, [user, _hasHydrated, router]);

    // For first-time setup (not reset) — 2FA not required
    useEffect(() => {
        if (!isReset) setTwoFADone(true);
    }, [isReset]);

    // For reset — check if 2FA is enabled
    useEffect(() => {
        if (!isReset || !user) return;
        setChecking2FA(true);
        api.get('/auth/2fa/status')
            .then(r => {
                if (r.data.enabled) setShow2FA(true);
                else                setTwoFADone(true);
            })
            .catch(() => setTwoFADone(true))
            .finally(() => setChecking2FA(false));
    }, [isReset, user]);

    // Auto-redirect after success
    useEffect(() => {
        if (!success) return;
        const t = setTimeout(() => router.push('/chat'), 2500);
        return () => clearTimeout(t);
    }, [success, router]);

    // 2FA verification
    const verify2FA = async (code: string): Promise<boolean> => {
        setTwoFACode(code);
        setShow2FA(false);
        setTwoFADone(true);
        return true;
    };

    const handleCancel2FA = () => {
        router.push('/chat');
    };

    // Form validation
    const validate = (): string => {
        if (pin.length < 6)   return 'Мінімум 6 символів';
        if (pin !== confirm)  return 'PIN-коди не збігаються';
        return '';
    };

    // Submit
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const err = validate();
        if (err) { setError(err); return; }
        if (!isReady) { setError('E2E ще не готовий, зачекайте секунду...'); return; }
        if (isReset && !twoFADone) { setError('Потрібне підтвердження 2FA'); return; }

        setLoading(true);
        setError('');
        try {
            await setupRecovery(pin, {
                isReset,
                twoFactorCode: twoFACode || undefined,
            });
            setSuccess(true);
        } catch (e: any) {
            const msg = e.response?.data?.message;
            setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Помилка збереження. Спробуйте ще раз.'));
            // If the 2FA code was wrong, show the modal again
            if (isReset && e.response?.status === 401) {
                setTwoFADone(false);
                setTwoFACode('');
                setShow2FA(true);
            }
        } finally {
            setLoading(false);
        }
    };

    // Render

    // Show 2FA modal (always rendered above everything else)
    if (show2FA) {
        return (
            <main className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-violet-50 p-4">
                <TwoFactorVerifyModal
                    title="Підтвердіть особу"
                    subtitle="Введіть код з Google Authenticator для скидання Recovery PIN"
                    onVerify={verify2FA}
                    onCancel={handleCancel2FA}
                />
            </main>
        );
    }

    // Show spinner while checking 2FA status
    if (checking2FA) {
        return (
            <main className="min-h-screen w-full flex items-center justify-center">
                <Loader2 size={28} className="animate-spin text-violet-500" />
            </main>
        );
    }

    return (
        <main className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-violet-50 p-4">
            <div className="w-full max-w-md">

                {success ? (
                    /* ── Success ── */
                    <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 text-center">
                        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
                            <Check size={36} className="text-emerald-500" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">Захист встановлено!</h1>
                        <p className="text-gray-500 text-sm leading-relaxed">
                            Ваш ключ шифрування захищений PIN-кодом і збережений на сервері.
                            Тепер ви зможете відновити доступ до переписки на будь-якому пристрої.
                        </p>
                        <p className="text-xs text-slate-400 mt-4">Переходимо до чату...</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">

                        {/* Header banner */}
                        <div className="bg-gradient-to-br from-violet-600 to-indigo-600 px-6 py-8 text-center">
                            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                                <Shield size={28} className="text-white" />
                            </div>
                            <h1 className="text-xl font-bold text-white">
                                {isReset ? 'Скинути Recovery PIN' : 'Захист ключів шифрування'}
                            </h1>
                            <p className="text-indigo-200 text-sm mt-1.5 leading-relaxed">
                                {isVerified
                                    ? 'Email підтверджено! Тепер встановіть PIN для захисту ваших зашифрованих повідомлень.'
                                    : 'Встановіть PIN для відновлення доступу до переписки на нових пристроях.'}
                            </p>
                        </div>

                        <div className="p-6">
                            {/* Info bullets */}
                            <div className="space-y-3 mb-6">
                                {[
                                    { icon: '🔐', text: 'Ваші повідомлення зашифровані наскрізно (E2E)' },
                                    { icon: '📱', text: 'PIN дозволяє відновити доступ з нового пристрою' },
                                    { icon: '🚫', text: 'Сервер зберігає тільки зашифрований ключ — PIN відомий тільки вам' },
                                ].map((item, i) => (
                                    <div key={i} className="flex items-start gap-3">
                                        <span className="text-lg shrink-0">{item.icon}</span>
                                        <p className="text-xs text-slate-600 leading-relaxed">{item.text}</p>
                                    </div>
                                ))}
                            </div>

                            {!isReady && (
                                <div className="flex items-center justify-center gap-2 py-4 text-slate-400 text-sm">
                                    <Loader2 size={16} className="animate-spin" />
                                    Генерація ключів...
                                </div>
                            )}

                            {isReady && (
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    {/* PIN input */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Recovery PIN
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showPin ? 'text' : 'password'}
                                                value={pin}
                                                onChange={e => { setPin(e.target.value); setError(''); }}
                                                placeholder="Мінімум 6 символів"
                                                autoFocus
                                                className={`w-full px-4 py-3 pr-10 rounded-xl border text-sm outline-none transition-all
                                                    ${error ? 'border-red-400' : 'border-gray-200 focus:ring-2 focus:ring-violet-200 focus:border-violet-400'}`}
                                            />
                                            <button type="button" onClick={() => setShowPin(s => !s)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                                                {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
                                            </button>
                                        </div>
                                        {pin && <PinStrength pin={pin} />}
                                    </div>

                                    {/* Confirm PIN */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Підтвердіть PIN
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showConf ? 'text' : 'password'}
                                                value={confirm}
                                                onChange={e => { setConfirm(e.target.value); setError(''); }}
                                                placeholder="Повторіть PIN"
                                                className={`w-full px-4 py-3 pr-10 rounded-xl border text-sm outline-none transition-all
                                                    ${confirm && confirm !== pin
                                                    ? 'border-red-400 focus:ring-2 focus:ring-red-100'
                                                    : 'border-gray-200 focus:ring-2 focus:ring-violet-200 focus:border-violet-400'}`}
                                            />
                                            <button type="button" onClick={() => setShowConf(s => !s)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                                                {showConf ? <EyeOff size={15} /> : <Eye size={15} />}
                                            </button>
                                        </div>
                                        {confirm && confirm !== pin && (
                                            <p className="text-xs text-red-500 mt-1">PIN-коди не збігаються</p>
                                        )}
                                    </div>

                                    {error && (
                                        <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>
                                    )}

                                    {/* Warning */}
                                    <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                                        <p className="text-xs text-amber-700 font-medium">⚠️ Запам'ятайте PIN!</p>
                                        <p className="text-xs text-amber-600 mt-0.5">
                                            Якщо ви забудете PIN, доступ до зашифрованих повідомлень буде втрачено назавжди.
                                        </p>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading || !pin || !confirm}
                                        className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed
                                                   text-white font-semibold py-3 rounded-xl transition-all
                                                   flex items-center justify-center gap-2 cursor-pointer"
                                    >
                                        {loading
                                            ? <><Loader2 size={16} className="animate-spin" />Захищаємо...</>
                                            : <><KeyRound size={16} />Встановити PIN<ArrowRight size={15} /></>
                                        }
                                    </button>

                                    {/* Skip option (only for non-first-time, non-reset) */}
                                    {!isVerified && !isReset && (
                                        <button
                                            type="button"
                                            onClick={() => router.push('/chat')}
                                            className="w-full text-xs text-slate-400 hover:text-slate-600 py-2 transition-colors cursor-pointer"
                                        >
                                            Пропустити (не рекомендовано)
                                        </button>
                                    )}
                                </form>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}