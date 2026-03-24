'use client';

import { useState, useEffect, useRef } from 'react';
import { ShieldCheck, ShieldOff, QrCode, Eye, EyeOff, Copy, Check, Loader2 } from 'lucide-react';
import api from '@/src/lib/axios';

type Phase = 'idle' | 'setup' | 'confirm' | 'disable';

interface SetupData {
    qrCodeDataUrl: string;
    manualEntry:   string;
}

function DigitInput({ onComplete }: { onComplete: (code: string) => void }) {
    const [digits, setDigits] = useState(['', '', '', '', '', '']);
    const refs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => { refs.current[0]?.focus(); }, []);

    const handleDigit = (idx: number, val: string) => {
        const clean = val.replace(/\D/g, '').slice(-1);
        const next = [...digits];
        next[idx] = clean;
        setDigits(next);
        if (clean && idx < 5) refs.current[idx + 1]?.focus();
        if (next.every(d => d)) onComplete(next.join(''));
    };

    const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
            const next = [...digits];
            next[idx - 1] = '';
            setDigits(next);
            refs.current[idx - 1]?.focus();
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasted.length === 6) {
            setDigits(pasted.split(''));
            onComplete(pasted);
        }
    };

    return (
        <div className="flex gap-2 justify-center" onPaste={handlePaste}>
            {digits.map((d, i) => (
                <input
                    key={i}
                    ref={el => { refs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={e => handleDigit(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    className={`w-10 h-12 text-center text-lg font-bold rounded-xl border-2 outline-none
                        transition-all dark:bg-slate-700 dark:text-slate-100
                        ${d
                        ? 'border-violet-400 bg-violet-50 dark:bg-violet-900/20'
                        : 'border-slate-200 dark:border-slate-600 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/30'}`}
                />
            ))}
        </div>
    );
}

export function TwoFactorSection() {
    const [enabled,   setEnabled]   = useState(false);
    const [loading,   setLoading]   = useState(true);
    const [phase,     setPhase]     = useState<Phase>('idle');
    const [setupData, setSetupData] = useState<SetupData | null>(null);
    const [error,     setError]     = useState('');
    const [success,   setSuccess]   = useState('');
    const [copied,    setCopied]    = useState(false);

    // disable form
    const [disableToken, setDisableToken] = useState('');
    const [disablePass,  setDisablePass]  = useState('');
    const [showPass,     setShowPass]     = useState(false);
    const [submitting,   setSubmitting]   = useState(false);

    useEffect(() => {
        api.get('/auth/2fa/status')
            .then(r => setEnabled(r.data.enabled))
            .finally(() => setLoading(false));
    }, []);

    const handleSetup = async () => {
        setError(''); setSubmitting(true);
        try {
            const { data } = await api.post('/auth/2fa/setup');
            setSetupData(data);
            setPhase('setup');
        } catch (e: any) {
            setError(e.response?.data?.message ?? 'Помилка');
        } finally { setSubmitting(false); }
    };

    const handleConfirm = async (token: string) => {
        setError(''); setSubmitting(true);
        try {
            await api.post('/auth/2fa/enable', { token });
            setEnabled(true);
            setPhase('idle');
            setSetupData(null);
            setSuccess('Двофакторна аутентифікація успішно увімкнена!');
            setTimeout(() => setSuccess(''), 4000);
        } catch (e: any) {
            const msg = e.response?.data?.message;
            setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Невірний код'));
        } finally { setSubmitting(false); }
    };

    const handleDisable = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!disableToken || !disablePass) return;
        setError(''); setSubmitting(true);
        try {
            await api.post('/auth/2fa/disable', { token: disableToken, password: disablePass });
            setEnabled(false);
            setPhase('idle');
            setDisableToken(''); setDisablePass('');
            setSuccess('Двофакторна аутентифікація вимкнена.');
            setTimeout(() => setSuccess(''), 4000);
        } catch (e: any) {
            const msg = e.response?.data?.message;
            setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Помилка'));
        } finally { setSubmitting(false); }
    };

    const copySecret = async () => {
        if (!setupData) return;
        await navigator.clipboard.writeText(setupData.manualEntry);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) {
        return (
            <div className="p-5 flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 size={14} className="animate-spin" />
                Завантаження...
            </div>
        );
    }

    return (
        <div className="divide-y divide-slate-50 dark:divide-slate-700/50">

            {/* Status row */}
            <div className="px-5 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center
                        ${enabled
                        ? 'bg-emerald-100 dark:bg-emerald-900/40'
                        : 'bg-slate-100 dark:bg-slate-700'}`}>
                        {enabled
                            ? <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400" />
                            : <ShieldOff  size={16} className="text-slate-400" />}
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                            Google Authenticator
                        </p>
                        <p className={`text-xs mt-0.5 ${enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                            {enabled ? '✓ Увімкнено' : 'Вимкнено'}
                        </p>
                    </div>
                </div>

                {phase === 'idle' && (
                    enabled ? (
                        <button
                            onClick={() => { setPhase('disable'); setError(''); }}
                            className="text-xs font-semibold text-red-500 border border-red-200
                                       dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/20
                                       px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                        >
                            Вимкнути
                        </button>
                    ) : (
                        <button
                            onClick={handleSetup}
                            disabled={submitting}
                            className="text-xs font-semibold text-violet-600 border border-violet-200
                                       dark:border-violet-800 hover:bg-violet-50 dark:hover:bg-violet-900/20
                                       px-3 py-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                        >
                            {submitting ? 'Завантаження...' : 'Увімкнути'}
                        </button>
                    )
                )}
            </div>

            {/* Success/Error banners */}
            {success && (
                <div className="px-5 py-3 bg-emerald-50 dark:bg-emerald-900/20 text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                    <Check size={13} />
                    {success}
                </div>
            )}
            {error && (
                <div className="px-5 py-3 bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400">
                    {error}
                </div>
            )}

            {/* ── Setup: QR Code ── */}
            {phase === 'setup' && setupData && (
                <div className="px-5 py-5 space-y-4">
                    <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">
                            Крок 1 — Відскануйте QR-код
                        </p>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            Відкрийте <span className="font-medium text-slate-600 dark:text-slate-300">Google Authenticator</span>,
                            натисніть «+» та відскануйте код нижче.
                        </p>
                    </div>

                    {/* QR Code */}
                    <div className="flex justify-center">
                        <div className="p-3 bg-white rounded-2xl shadow-md border border-slate-100">
                            <img src={setupData.qrCodeDataUrl} alt="QR Code" className="w-48 h-48" />
                        </div>
                    </div>

                    {/* Manual entry */}
                    <div>
                        <p className="text-xs text-slate-400 mb-1.5">
                            Або введіть ключ вручну (якщо камера недоступна):
                        </p>
                        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700
                                        border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5">
                            <code className="text-xs font-mono text-slate-600 dark:text-slate-300 flex-1 break-all select-all">
                                {setupData.manualEntry}
                            </code>
                            <button onClick={copySecret}
                                    className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-violet-600
                                               hover:bg-violet-50 dark:hover:bg-violet-900/30 cursor-pointer transition-all">
                                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                            </button>
                        </div>
                    </div>

                    {/* Step 2 */}
                    <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">
                            Крок 2 — Введіть код для підтвердження
                        </p>
                        <DigitInput onComplete={handleConfirm} />
                        {submitting && (
                            <div className="flex items-center justify-center gap-2 mt-3 text-slate-400 text-xs">
                                <Loader2 size={12} className="animate-spin" />Перевірка...
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => { setPhase('idle'); setSetupData(null); setError(''); }}
                        className="w-full text-xs text-slate-400 hover:text-slate-600 py-2 cursor-pointer transition-colors"
                    >
                        Скасувати
                    </button>
                </div>
            )}

            {/* ── Disable 2FA ── */}
            {phase === 'disable' && (
                <form onSubmit={handleDisable} className="px-5 py-5 space-y-4">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Вимкнення двофакторної аутентифікації
                    </p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                        Введіть поточний код з Google Authenticator та ваш пароль.
                    </p>

                    {/* 2FA code */}
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                            Код з Authenticator
                        </label>
                        <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={disableToken}
                            onChange={e => setDisableToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="000000"
                            autoFocus
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600
                                       text-sm text-center font-mono tracking-[0.3em] outline-none
                                       dark:bg-slate-700 dark:text-slate-200
                                       focus:ring-2 focus:ring-red-200 dark:focus:ring-red-900/30 focus:border-red-400"
                        />
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                            Пароль
                        </label>
                        <div className="relative">
                            <input
                                type={showPass ? 'text' : 'password'}
                                value={disablePass}
                                onChange={e => setDisablePass(e.target.value)}
                                placeholder="Ваш пароль"
                                className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-200
                                           dark:border-slate-600 text-sm outline-none
                                           dark:bg-slate-700 dark:text-slate-200
                                           focus:ring-2 focus:ring-red-200 dark:focus:ring-red-900/30 focus:border-red-400"
                            />
                            <button type="button" onClick={() => setShowPass(s => !s)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => { setPhase('idle'); setError(''); }}
                            className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600
                                       text-sm text-slate-600 dark:text-slate-400
                                       hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                        >
                            Скасувати
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || disableToken.length !== 6 || !disablePass}
                            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white
                                       text-sm font-semibold cursor-pointer
                                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                                       flex items-center justify-center gap-2"
                        >
                            {submitting
                                ? <><Loader2 size={13} className="animate-spin" />Вимкнення...</>
                                : 'Вимкнути 2FA'
                            }
                        </button>
                    </div>
                </form>
            )}

            {/* Info */}
            {phase === 'idle' && !enabled && (
                <div className="px-5 py-3">
                    <p className="text-xs text-slate-400 leading-relaxed">
                        Двофакторна аутентифікація додає додатковий захист: скидання Recovery PIN
                        та видалення акаунту потребуватимуть підтвердження через Google Authenticator.
                    </p>
                </div>
            )}
        </div>
    );
}