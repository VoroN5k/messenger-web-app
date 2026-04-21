'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import api from '@/src/lib/axios';
import { Loader2, KeyRound, Eye, EyeOff, CheckCircle, XCircle, ArrowLeft, AlertTriangle } from 'lucide-react';
import { GridLines, BackgroundOrbs, NoiseOverlay } from "@/src/components/ui/BackgroundFx";
import { CipherInput } from "@/src/components/ui/CipherInput";

// ── Індикатор надійності пароля ──
function CyberPasswordStrength({ password }: { password: string }) {
    if (!password) return null;
    const score = [
        password.length >= 8,
        /[A-Z]/.test(password),
        /[0-9]/.test(password),
        /[^A-Za-z0-9]/.test(password),
    ].filter(Boolean).length;

    const labels = ['WEAK', 'FAIR', 'GOOD', 'STRONG'];
    const colors = [
        'rgba(239,68,68,0.7)',
        'rgba(245,158,11,0.7)',
        'rgba(99,179,237,0.7)',
        'rgba(52,211,153,0.7)',
    ];
    const color = colors[score - 1] ?? colors[0];

    return (
        <div className="space-y-1.5 mt-2">
            <div className="flex gap-1">
                {[0,1,2,3].map(i => (
                    <div key={i} className="h-0.5 flex-1 rounded-full transition-all duration-300"
                         style={{ background: i < score ? color : 'rgba(109,40,217,0.15)' }} />
                ))}
            </div>
            <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono tracking-widest" style={{ color }}>
                    ENTROPY_{labels[score - 1] ?? 'ZERO'}
                </span>
                <span className="text-[9px] font-mono" style={{ color: 'rgba(100,116,139,0.4)' }}>
                    {password.length} chars
                </span>
            </div>
        </div>
    );
}

export default function ResetPasswordPage() {
    const t = useTranslations('auth.reset_password');
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
    const [mounted,   setMounted]   = useState(false);

    useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);

    useEffect(() => {
        if (!success) return;
        const t = setTimeout(() => router.push('/auth/login'), 3000);
        return () => clearTimeout(t);
    }, [success, router]);

    const validate = () => {
        if (!token) return 'Invalid or expired token.';
        if (password.length < 6) return t('password_min');
        if (password !== confirm) return t('confirm_mismatch');
        return '';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const err = validate();
        if (err) { setError(err); return; }

        setLoading(true); setError('');
        try {
            await api.post('/auth/reset-password', { token, newPassword: password });
            setSuccess(true);
        } catch (err: any) {
            const msg = err.response?.data?.message;
            setError(Array.isArray(msg) ? msg[0] : (msg ?? t('error_default')));
        } finally {
            setLoading(false);
        }
    };

    const EyeIcon = ({ show }: { show: boolean }) => show
        ? <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        : <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;

    // ── Стан: Токен відсутній ──
    if (!token && mounted) {
        return (
            <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: '#06040f', fontFamily: "'JetBrains Mono', monospace" }}>
                <GridLines /><NoiseOverlay />
                <div className="relative z-10 w-full max-w-md bg-[#0a0714] border border-red-500/30 p-8 rounded-2xl text-center shadow-[0_0_50px_rgba(239,68,68,0.1)]">
                    <XCircle className="text-red-500 mx-auto mb-4 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]" size={40} />
                    <h1 className="text-xl font-bold text-white mb-2 tracking-wide">[ERR_INVALID_TOKEN]</h1>
                    <p className="text-xs text-slate-400 mb-6 leading-relaxed">Посилання для відновлення паролю недійсне, пошкоджене або термін його дії минув.</p>
                    <Link href="/auth/forgot-password" className="inline-flex items-center justify-center w-full gap-2 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-xs uppercase tracking-widest hover:bg-red-500/20 transition-all">
                        Запросити новий токен
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex relative overflow-hidden"
             style={{ background: 'linear-gradient(160deg, #06040f 0%, #0a0714 50%, #080c1a 100%)', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
            <BackgroundOrbs /><GridLines /><NoiseOverlay />

            <div className="flex-1 flex items-center justify-center relative z-10 px-6 py-12">
                <div className="w-full max-w-md transition-all duration-700"
                     style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(20px)' }}>

                    <div className="flex justify-center mb-8">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-violet-500/20 border border-violet-500/40 shadow-[0_0_15px_rgba(109,40,217,0.4)]">
                            <KeyRound className="text-violet-300" size={20} />
                        </div>
                    </div>

                    <div className="relative rounded-2xl overflow-hidden" style={{
                        background: 'rgba(10,7,25,0.82)',
                        border: '1px solid rgba(109,40,217,0.18)',
                        backdropFilter: 'blur(24px)',
                        boxShadow: '0 0 60px rgba(109,40,217,0.08)',
                    }}>
                        <div className="absolute top-0 left-12 right-12 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.5), transparent)' }} />

                        {success ? (
                            /* ── Success ── */
                            <div className="p-8 text-center animate-in fade-in duration-500">
                                <div className="flex justify-center mb-5">
                                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                                        <CheckCircle className="text-emerald-400" size={32} />
                                    </div>
                                </div>
                                <h1 className="text-2xl font-bold mb-2 text-white">{t('success')}</h1>
                                <p className="text-xs text-slate-400 mb-6">{t('success')}</p>
                                <div className="w-full bg-slate-800/50 rounded-full h-1 mb-2 overflow-hidden">
                                    <div className="bg-emerald-500 h-full animate-[progress_3s_ease-in-out_forwards]" />
                                </div>
                                <p className="text-[10px] text-emerald-500/50 uppercase tracking-widest">Redirecting</p>
                            </div>
                        ) : (
                            /* ── Form ── */
                            <>
                                <div className="px-8 pt-8 pb-5 border-b border-violet-500/10">
                                    <div className="text-[10px] tracking-[0.3em] uppercase mb-2 text-violet-400/60">
                                        // set new credentials
                                    </div>
                                    <h1 className="text-2xl font-bold" style={{ background: 'linear-gradient(135deg, #f1f5f9 0%, #c4b5fd 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                        {t('title')}
                                    </h1>
                                </div>

                                <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
                                    <div>
                                        <CipherInput
                                            label={t('password_label')}
                                            type={showPass ? 'text' : 'password'}
                                            value={password}
                                            onChange={e => { setPassword(e.target.value); setError(''); }}
                                            placeholder={t('password_label')}
                                            rightSlot={
                                                <button type="button" onClick={() => setShowPass(s => !s)} className="transition-colors text-slate-400 hover:text-violet-400">
                                                    <EyeIcon show={showPass} />
                                                </button>
                                            }
                                        />
                                        <CyberPasswordStrength password={password} />
                                    </div>

                                    <CipherInput
                                        label={t('confirm_label')}
                                        type={showConf ? 'text' : 'password'}
                                        value={confirm}
                                        onChange={e => { setConfirm(e.target.value); setError(''); }}
                                        placeholder={t('confirm_label')}
                                        rightSlot={
                                            <button type="button" onClick={() => setShowConf(s => !s)} className="transition-colors text-slate-400 hover:text-violet-400">
                                                <EyeIcon show={showConf} />
                                            </button>
                                        }
                                    />

                                    {error && (
                                        <div className="flex items-start gap-2.5 rounded-lg px-4 py-3 bg-red-500/10 border border-red-500/20">
                                            <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
                                            <p className="text-[11px] text-red-400">{error}</p>
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={loading || !password || !confirm}
                                        className="w-full relative py-3.5 mt-2 rounded-xl text-xs tracking-widest uppercase text-white overflow-hidden group transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{
                                            background: 'linear-gradient(135deg, rgba(109,40,217,0.85) 0%, rgba(79,70,229,0.85) 100%)',
                                            border: '1px solid rgba(139,92,246,0.45)',
                                            boxShadow: '0 0 30px rgba(109,40,217,0.2)',
                                        }}
                                    >
                                        <span className="relative z-10 flex items-center justify-center gap-2.5">
                                            {loading ? <><Loader2 size={14} className="animate-spin" /> {t('submitting')}</> : t('submit')}
                                        </span>
                                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white/5" />
                                    </button>
                                </form>
                            </>
                        )}
                    </div>

                    {!success && (
                        <div className="mt-6 text-center">
                            <Link href="/auth/login" className="inline-flex items-center gap-2 text-[10px] tracking-widest uppercase text-slate-500 hover:text-violet-400 transition-colors">
                                <ArrowLeft size={12} /> {t('back_to_login')}
                            </Link>
                        </div>
                    )}
                </div>
            </div>
            <style jsx>{`
                @keyframes progress { 0% { width: 0%; } 100% { width: 100%; } }
            `}</style>
        </div>
    );
}