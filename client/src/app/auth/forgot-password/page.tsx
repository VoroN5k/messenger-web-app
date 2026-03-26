'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/src/lib/axios';
import { Loader2, Mail, ArrowLeft, CheckCircle, AlertTriangle, ShieldAlert } from 'lucide-react';
import { GridLines, BackgroundOrbs, NoiseOverlay } from "@/src/components/ui/BackgroundFx";
import { CipherInput } from "@/src/components/ui/CipherInput";

export default function ForgotPasswordPage() {
    const [email,   setEmail]   = useState('');
    const [loading, setLoading] = useState(false);
    const [sent,    setSent]    = useState(false);
    const [error,   setError]   = useState('');
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) { setError("Ідентифікатор обов'язковий"); return; }
        setLoading(true); setError('');
        try {
            await api.post('/auth/forgot-password', { email: email.trim() });
            setSent(true);
        } catch (err: any) {
            const msg = err.response?.data?.message;
            setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Помилка передачі пакету.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex relative overflow-hidden"
             style={{ background: 'linear-gradient(160deg, #06040f 0%, #0a0714 50%, #080c1a 100%)', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
            <BackgroundOrbs />
            <GridLines />
            <NoiseOverlay />

            {/* ── Left panel (Info) ── */}
            <div className="hidden lg:flex flex-col justify-between w-[400px] shrink-0 relative z-10 p-12"
                 style={{ borderRight: '1px solid rgba(109,40,217,0.12)' }}>
                <Link href="/" className="flex items-center gap-2.5 group">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-all group-hover:scale-105" style={{
                        background: 'rgba(109,40,217,0.2)', border: '1px solid rgba(139,92,246,0.4)',
                        boxShadow: '0 0 12px rgba(109,40,217,0.3)',
                    }}>
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="rgba(196,181,253,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <span className="text-sm font-semibold tracking-tight" style={{
                        background: 'linear-gradient(135deg, #e2d9f3 0%, #a78bfa 100%)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>
                        CIPHER<span style={{ WebkitTextFillColor: 'rgba(139,92,246,0.6)' }}>MSG</span>
                    </span>
                </Link>

                <div className="space-y-8">
                    <div>
                        <div className="text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: 'rgba(139,92,246,0.6)' }}>
                            // access recovery
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-4">
                            Відновлення доступу
                        </h2>
                        <p className="text-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.7)' }}>
                            Скидання паролю дозволить вам увійти в акаунт. Однак, через архітектуру Zero-Knowledge, ми не можемо відновити ваші повідомлення.
                        </p>
                    </div>

                    <div className="space-y-4 text-[10px] font-mono p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
                        <div className="flex items-center gap-2 text-amber-500 font-bold tracking-widest uppercase mb-2">
                            <ShieldAlert size={14} /> Увага
                        </div>
                        <p style={{ color: 'rgba(148,163,184,0.7)' }} className="leading-relaxed">
                            Після скидання паролю вам <b>обов'язково</b> знадобиться ваш <b>Recovery PIN</b>, щоб розшифрувати E2E ключі та отримати доступ до історії чатів.
                        </p>
                    </div>
                </div>

                <div className="text-[9px] font-mono tracking-widest uppercase" style={{ color: 'rgba(109,40,217,0.3)' }}>
                    ZERO-KNOWLEDGE · NO BACKDOORS
                </div>
            </div>

            {/* ── Right panel (Card) ── */}
            <div className="flex-1 flex items-center justify-center relative z-10 px-6 py-12">
                <div className="w-full max-w-md transition-all duration-700"
                     style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(20px)' }}>

                    <div className="relative rounded-2xl overflow-hidden" style={{
                        background: 'rgba(10,7,25,0.82)',
                        border: '1px solid rgba(109,40,217,0.18)',
                        backdropFilter: 'blur(24px)',
                        boxShadow: '0 0 60px rgba(109,40,217,0.08), 0 40px 80px rgba(0,0,0,0.5)',
                    }}>
                        <div className="absolute top-0 left-12 right-12 h-px" style={{
                            background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.5), transparent)',
                        }} />

                        {sent ? (
                            /* ── Success state ── */
                            <div className="p-8 text-center">
                                <div className="flex justify-center mb-6">
                                    <div className="relative w-20 h-20 flex items-center justify-center">
                                        <div className="absolute inset-0 rounded-full border border-emerald-500/30 animate-ping" />
                                        <div className="relative w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                                            <CheckCircle className="text-emerald-400" size={24} />
                                        </div>
                                    </div>
                                </div>
                                <h1 className="text-2xl font-bold mb-3 text-white drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]">
                                    Пакет надіслано
                                </h1>
                                <p className="text-xs leading-relaxed text-slate-400 mb-8">
                                    Якщо ідентифікатор <span className="text-emerald-400 font-bold">[{email}]</span> зареєстровано в системі, ми надіслали інструкції. Перевірте папку Spam.
                                </p>
                                <Link href="/auth/login" className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono text-xs uppercase tracking-widest hover:bg-emerald-500/20 transition-all">
                                    <ArrowLeft size={14} /> Повернутись до входу
                                </Link>
                            </div>
                        ) : (
                            /* ── Form ── */
                            <>
                                <div className="px-8 pt-8 pb-5" style={{ borderBottom: '1px solid rgba(109,40,217,0.1)' }}>
                                    <div className="text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'rgba(139,92,246,0.6)' }}>
                                        // initiate reset
                                    </div>
                                    <h1 className="text-2xl font-bold" style={{
                                        background: 'linear-gradient(135deg, #f1f5f9 0%, #c4b5fd 100%)',
                                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                    }}>
                                        Забули пароль?
                                    </h1>
                                </div>

                                <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
                                    <CipherInput
                                        label="Email / Ідентифікатор"
                                        type="email"
                                        value={email}
                                        onChange={e => { setEmail(e.target.value); setError(''); }}
                                        placeholder="agent@domain.com"
                                        icon={<Mail size={14} />}
                                    />

                                    {error && (
                                        <div className="flex items-start gap-2.5 rounded-lg px-4 py-3 bg-red-500/10 border border-red-500/20">
                                            <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
                                            <p className="text-[11px] font-mono text-red-400">{error}</p>
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={loading || !email.trim()}
                                        className="w-full relative py-3.5 mt-2 rounded-xl text-xs font-mono tracking-widest uppercase text-white overflow-hidden group transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{
                                            background: 'linear-gradient(135deg, rgba(109,40,217,0.85) 0%, rgba(79,70,229,0.85) 100%)',
                                            border: '1px solid rgba(139,92,246,0.45)',
                                            boxShadow: '0 0 30px rgba(109,40,217,0.2)',
                                        }}
                                    >
                                        <span className="relative z-10 flex items-center justify-center gap-2.5">
                                            {loading ? <><Loader2 size={14} className="animate-spin" /> GENERATING...</> : 'SEND_RESET_LINK'}
                                        </span>
                                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(255,255,255,0.05)' }} />
                                    </button>

                                    <div className="pt-5 border-t border-violet-500/10 text-center">
                                        <Link href="/auth/login" className="inline-flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase text-slate-500 hover:text-violet-400 transition-colors">
                                            <ArrowLeft size={12} /> AUTH_LOGIN
                                        </Link>
                                    </div>
                                </form>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}