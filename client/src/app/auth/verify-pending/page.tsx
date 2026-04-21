'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import api from '@/src/lib/axios';
import { Mail, ArrowLeft, RefreshCw, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { GridLines, BackgroundOrbs, NoiseOverlay } from "@/src/components/ui/BackgroundFx";

const RESEND_COOLDOWN = 60; // seconds

export default function VerifyPendingPage() {
    const t = useTranslations('auth.verify_pending');
    const searchParams = useSearchParams();
    const email = searchParams.get('email') ?? '';

    const [sending,   setSending]   = useState(false);
    const [sent,      setSent]      = useState(false);
    const [error,     setError]     = useState('');
    const [cooldown,  setCooldown]  = useState(0);
    const [mounted,   setMounted]   = useState(false);

    // Fade-in анімація при завантаженні
    useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);

    // Таймер (Cooldown)
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
            setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Помилка передачі пакету.'));
        } finally {
            setSending(false);
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
                        VESPER<span style={{ WebkitTextFillColor: 'rgba(139,92,246,0.6)' }}>MSG</span>
                    </span>
                </Link>

                <div className="space-y-8">
                    <div>
                        <div className="text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: 'rgba(139,92,246,0.6)' }}>
                            // identity verification
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-4">
                            Очікування підтвердження
                        </h2>
                        <p className="text-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.7)' }}>
                            Для запобігання створенню фейкових акаунтів (Sybil attack), ми повинні переконатися, що ви володієте вказаним ідентифікатором (Email).
                        </p>
                    </div>

                    <div className="space-y-3 text-[10px] font-mono">
                        {[
                            { icon: '⬡', text: 'Без підтвердження вхід у мережу заблоковано' },
                            { icon: '⬡', text: 'Посилання дійсне протягом 24 годин' },
                            { icon: '⬡', text: 'Перевірте папку Spam, якщо пакет не надійшов' },
                        ].map((item, i) => (
                            <div key={i} className="flex items-start gap-2.5" style={{ color: 'rgba(148,163,184,0.5)' }}>
                                <span style={{ color: 'rgba(109,40,217,0.6)' }}>{item.icon}</span>
                                {item.text}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="text-[9px] font-mono tracking-widest" style={{ color: 'rgba(109,40,217,0.3)' }}>
                    ANTI-SPAM · IDENTITY CHECK
                </div>
            </div>

            {/* ── Right panel (Card) ── */}
            <div className="flex-1 flex items-center justify-center relative z-10 px-6 py-12">
                <div className="w-full max-w-md transition-all duration-700"
                     style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(20px)' }}>

                    {/* Mobile logo */}
                    <div className="flex justify-center mb-10 lg:hidden">
                        <Link href="/" className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
                                background: 'rgba(109,40,217,0.2)', border: '1px solid rgba(139,92,246,0.4)',
                            }}>
                                <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="rgba(196,181,253,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>
                            <span className="text-sm font-semibold" style={{
                                background: 'linear-gradient(135deg, #e2d9f3 0%, #a78bfa 100%)',
                                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            }}>CIPHERMSG</span>
                        </Link>
                    </div>

                    <div className="relative rounded-2xl overflow-hidden" style={{
                        background: 'rgba(10,7,25,0.82)',
                        border: '1px solid rgba(109,40,217,0.18)',
                        backdropFilter: 'blur(24px)',
                        boxShadow: '0 0 60px rgba(109,40,217,0.08), 0 40px 80px rgba(0,0,0,0.5)',
                    }}>
                        <div className="absolute top-0 left-12 right-12 h-px" style={{
                            background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.5), transparent)',
                        }} />

                        <div className="p-8">

                            {/* Animated Radar/Mail Icon */}
                            <div className="flex justify-center mb-8">
                                <div className="relative w-20 h-20 flex items-center justify-center">
                                    <div className="absolute inset-0 rounded-full border border-violet-500/30 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" />
                                    <div className="absolute inset-2 rounded-full border border-violet-500/20 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite_1s]" />
                                    <div className="relative w-14 h-14 rounded-full bg-violet-500/10 border border-violet-500/30 flex items-center justify-center backdrop-blur-md shadow-[0_0_20px_rgba(109,40,217,0.2)]">
                                        <Mail className="text-violet-400" size={24} />
                                    </div>
                                </div>
                            </div>

                            <div className="text-center mb-8">
                                <h1 className="text-2xl font-bold mb-3" style={{
                                    background: 'linear-gradient(135deg, #f1f5f9 0%, #c4b5fd 100%)',
                                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                }}>
                                    {t('title')}
                                </h1>
                                <p className="text-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.8)' }}>
                                    {t('subtitle', { email })}
                                </p>
                                <div className="mt-3 inline-block px-4 py-2 rounded-lg border border-violet-500/20 bg-violet-500/5 font-mono text-sm text-violet-300 tracking-wide break-all shadow-[inset_0_0_15px_rgba(109,40,217,0.1)]">
                                    {email || '[ UNKNOWN_ID ]'}
                                </div>
                            </div>

                            {/* Spam Warning */}
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mb-6 flex items-start gap-3">
                                <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                                <p className="text-[11px] font-mono leading-relaxed text-amber-500/80">
                                    {t('spam_note')}
                                </p>
                            </div>

                            {/* Success message */}
                            {sent && (
                                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 mb-6 flex items-center gap-3 animate-in fade-in duration-300">
                                    <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                                    <p className="text-[11px] font-mono text-emerald-400/90">
                                        {t('resent')}
                                    </p>
                                </div>
                            )}

                            {/* Error message */}
                            {error && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-6 flex items-start gap-3 animate-in fade-in duration-300">
                                    <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
                                    <p className="text-[11px] font-mono text-red-400">{error}</p>
                                </div>
                            )}

                            {/* Resend button */}
                            <button
                                onClick={handleResend}
                                disabled={sending || cooldown > 0 || !email}
                                className="w-full relative py-3.5 mb-5 rounded-xl text-xs font-mono tracking-widest uppercase text-white overflow-hidden group transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{
                                    background: (sending || cooldown > 0)
                                        ? 'rgba(30,41,59,0.5)'
                                        : 'linear-gradient(135deg, rgba(109,40,217,0.2) 0%, rgba(79,70,229,0.2) 100%)',
                                    border: (sending || cooldown > 0)
                                        ? '1px solid rgba(71,85,105,0.5)'
                                        : '1px solid rgba(139,92,246,0.4)',
                                    color: (sending || cooldown > 0) ? 'rgba(148,163,184,0.8)' : 'rgba(233,213,255,0.95)',
                                }}
                            >
                                <span className="relative z-10 flex items-center justify-center gap-2.5">
                                    {sending ? (
                                        <><RefreshCw size={14} className="animate-spin" /> {t('resending')}</>
                                    ) : cooldown > 0 ? (
                                        <><Clock size={14} /> [{cooldown}s]</>
                                    ) : (
                                        <><RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" /> {t('resend')}</>
                                    )}
                                </span>
                                {!(sending || cooldown > 0) && (
                                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(139,92,246,0.1)' }} />
                                )}
                            </button>

                            {/* Nav Links */}
                            <div className="pt-5 border-t border-violet-500/10 flex flex-col gap-3 text-center">
                                <Link
                                    href="/auth/login"
                                    className="inline-flex items-center justify-center gap-2 text-[10px] font-mono tracking-widest uppercase text-slate-500 hover:text-violet-400 transition-colors"
                                >
                                    <ArrowLeft size={12} />
                                    {t('back_to_login')}
                                </Link>
                                <Link
                                    href="/auth/forgot-password"
                                    className="text-[10px] font-mono tracking-widest uppercase text-slate-600 hover:text-slate-400 transition-colors"
                                >
                                    CONNECTION_ISSUES?
                                </Link>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}