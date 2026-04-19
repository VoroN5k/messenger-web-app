'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import api from '@/src/lib/axios';
import Link from 'next/link';
import {TosModal} from "@/src/components/auth/TosModal";

// ── Shared background components ──────────────────────────────────────────────
function GridLines() {
    return (
        <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.035]" style={{
            backgroundImage: `
        linear-gradient(rgba(139,92,246,1) 1px, transparent 1px),
        linear-gradient(90deg, rgba(139,92,246,1) 1px, transparent 1px)
      `,
            backgroundSize: '60px 60px',
        }} />
    );
}

function BackgroundOrbs() {
    return (
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
            <div className="absolute rounded-full" style={{
                width: 600, height: 600,
                background: 'radial-gradient(circle, rgba(109,40,217,0.2) 0%, transparent 65%)',
                top: '-200px', right: '-150px', filter: 'blur(50px)',
                animation: 'oA 24s ease-in-out infinite',
            }} />
            <div className="absolute rounded-full" style={{
                width: 500, height: 500,
                background: 'radial-gradient(circle, rgba(79,70,229,0.16) 0%, transparent 65%)',
                bottom: '-100px', left: '-100px', filter: 'blur(40px)',
                animation: 'oB 30s ease-in-out infinite',
            }} />
            <style jsx>{`
        @keyframes oA { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-40px,50px)} }
        @keyframes oB { 0%,100%{transform:translate(0,0)} 50%{transform:translate(35px,-35px)} }
      `}</style>
        </div>
    );
}

function NoiseOverlay() {
    return (
        <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.022]" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: '128px',
        }} />
    );
}

// ── DNA / Key generation animation ───────────────────────────────────────────
function KeyGenVisual() {
    const [tick, setTick] = useState(0);
    const chars = '0123456789ABCDEF';
    const rand = () => chars[Math.floor(Math.random() * chars.length)];

    useEffect(() => {
        const iv = setInterval(() => setTick(t => t + 1), 80);
        return () => clearInterval(iv);
    }, []);

    const rows = 12;
    const cols = 8;

    return (
        <div className="space-y-0.5 select-none">
            {Array.from({ length: rows }, (_, r) => (
                <div key={r} className="flex gap-1 items-center">
          <span className="text-[9px] font-mono w-5 text-right" style={{ color: 'rgba(109,40,217,0.3)' }}>
            {String(r * 16).padStart(3, '0')}
          </span>
                    <div className="flex gap-0.5">
                        {Array.from({ length: cols }, (_, c) => {
                            const phase = (tick + r * 3 + c) % 24;
                            const isHot = phase < 6;
                            const isMid = phase < 12;
                            return (
                                <span key={c} className="text-[10px] font-mono w-4 text-center transition-colors duration-100"
                                      style={{
                                          color: isHot
                                              ? 'rgba(196,181,253,0.95)'
                                              : isMid
                                                  ? 'rgba(139,92,246,0.6)'
                                                  : 'rgba(109,40,217,0.2)',
                                          textShadow: isHot ? '0 0 6px rgba(139,92,246,0.8)' : 'none',
                                      }}>
                  {rand()}
                </span>
                            );
                        })}
                    </div>
                    <span className="text-[9px] font-mono" style={{ color: 'rgba(109,40,217,0.2)' }}>│</span>
                </div>
            ))}
        </div>
    );
}

// ── Progress steps ────────────────────────────────────────────────────────────
function StepIndicator({ current, total }: { current: number; total: number }) {
    return (
        <div className="flex items-center gap-3">
            {Array.from({ length: total }, (_, i) => (
                <div key={i} className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <div className="relative flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-mono font-bold transition-all duration-500"
                             style={{
                                 background: i < current
                                     ? 'rgba(109,40,217,0.9)'
                                     : i === current
                                         ? 'rgba(109,40,217,0.2)'
                                         : 'rgba(30,27,75,0.5)',
                                 border: i <= current
                                     ? '1px solid rgba(139,92,246,0.6)'
                                     : '1px solid rgba(109,40,217,0.2)',
                                 color: i < current ? '#fff' : i === current ? 'rgba(196,181,253,0.9)' : 'rgba(100,116,139,0.4)',
                                 boxShadow: i === current ? '0 0 12px rgba(109,40,217,0.4)' : 'none',
                             }}>
                            {i < current
                                ? <svg width="10" height="10" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                                : i + 1}
                            {i === current && (
                                <div className="absolute inset-0 rounded-full animate-ping opacity-30"
                                     style={{ background: 'rgba(139,92,246,0.5)' }} />
                            )}
                        </div>
                    </div>
                    {i < total - 1 && (
                        <div className="w-12 h-px transition-all duration-500" style={{
                            background: i < current
                                ? 'linear-gradient(90deg, rgba(109,40,217,0.8), rgba(109,40,217,0.4))'
                                : 'rgba(109,40,217,0.15)',
                        }} />
                    )}
                </div>
            ))}
        </div>
    );
}

// ── Animated input ────────────────────────────────────────────────────────────
function CipherInput({
                         label, type = 'text', placeholder, error, icon, rightSlot, hint,
                         ...rest
                     }: {
    label: string; type?: string; placeholder?: string;
    error?: string; icon?: React.ReactNode; rightSlot?: React.ReactNode; hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
    const [focused, setFocused] = useState(false);

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono tracking-[0.2em] uppercase" style={{ color: 'rgba(139,92,246,0.7)' }}>
                    {label}
                </label>
                {hint && <span className="text-[9px] font-mono" style={{ color: 'rgba(100,116,139,0.5)' }}>{hint}</span>}
            </div>
            <div className="relative">
                <div className="absolute inset-0 rounded-lg transition-all duration-300" style={{
                    boxShadow: focused
                        ? '0 0 0 1px rgba(139,92,246,0.5), 0 0 20px rgba(109,40,217,0.1)'
                        : '0 0 0 1px rgba(109,40,217,0.2)',
                    background: focused ? 'rgba(109,40,217,0.08)' : 'transparent',
                    borderRadius: 8, pointerEvents: 'none',
                }} />
                {icon && (
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 transition-colors duration-300"
                         style={{ color: focused ? 'rgba(139,92,246,0.8)' : 'rgba(100,116,139,0.4)' }}>
                        {icon}
                    </div>
                )}
                <input
                    type={type}
                    placeholder={placeholder}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    {...rest}
                    className="relative z-10 w-full bg-transparent rounded-lg py-3 text-sm font-mono outline-none"
                    style={{
                        paddingLeft: icon ? 40 : 14,
                        paddingRight: rightSlot ? 44 : 14,
                        color: 'rgba(226,232,240,0.9)',
                        caretColor: 'rgba(139,92,246,0.9)',
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    }}
                />
                {rightSlot && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">{rightSlot}</div>
                )}
            </div>
            {error && (
                <p className="text-[10px] font-mono" style={{ color: 'rgba(248,113,113,0.8)' }}>↳ {error}</p>
            )}
        </div>
    );
}

// ── Password strength ─────────────────────────────────────────────────────────
function PasswordStrength({ password }: { password: string }) {
    if (!password) return null;
    const checks = [
        password.length >= 8,
        /[A-Z]/.test(password),
        /[0-9]/.test(password),
        /[^A-Za-z0-9]/.test(password),
    ];
    const score = checks.filter(Boolean).length;
    const labels = ['WEAK', 'FAIR', 'GOOD', 'STRONG'];
    const colors = [
        'rgba(239,68,68,0.7)',
        'rgba(245,158,11,0.7)',
        'rgba(99,179,237,0.7)',
        'rgba(52,211,153,0.7)',
    ];
    const color = colors[score - 1] ?? colors[0];

    return (
        <div className="space-y-1.5">
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

// ── MAIN REGISTER PAGE ────────────────────────────────────────────────────────
export default function RegisterPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [showPass, setShowPass]   = useState(false);
    const [showConf, setShowConf]   = useState(false);
    const [globalError, setGlobalError] = useState('');
    const [mounted, setMounted] = useState(false);
    const [step, setStep] = useState(0); // 0 = identity, 1 = credentials, 2 = confirm
    const [tosAccepted, setTosAccepted] = useState(false);
    const [showTos, setShowTos] = useState(false);
    const router = useRouter();

    const { register, handleSubmit, watch, trigger, formState: { errors } } = useForm({ mode: 'onChange' });
    const password = watch('password', '');
    const nickname = watch('nickname', '');
    const email = watch('email', '');

    useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);

    const stepLabels = ['IDENTITY', 'CREDENTIALS', 'CONFIRM'];

    const handleNext = async () => {
        let fields: string[] = [];
        if (step === 0) fields = ['nickname', 'email'];
        if (step === 1) fields = ['password', 'confirmPassword'];
        const ok = await trigger(fields as any);
        if (ok) setStep(s => s + 1);
    };

    const onSubmit = async (data: any) => {
        setIsLoading(true);
        setGlobalError('');
        try {
            await api.post('/auth/register', {
                email: data.email,
                password: data.password,
                confirmPassword: data.confirmPassword,
                nickname: data.nickname,
                tosAccepted: tosAccepted,
            });
            router.push(`/auth/verify-pending?email=${encodeURIComponent(data.email)}`);
        } catch (e: any) {
            const msg = e.response?.data?.message || 'Помилка реєстрації';
            setGlobalError(Array.isArray(msg) ? msg[0] : msg);
            setStep(0);
        } finally {
            setIsLoading(false);
        }
    };

    const EyeIcon = ({ show }: { show: boolean }) => show
        ? <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        : <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;

    return (
        <div className="min-h-screen flex relative overflow-hidden"
             style={{ background: 'linear-gradient(160deg, #06040f 0%, #0a0714 50%, #080c1a 100%)', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
            <BackgroundOrbs />
            <GridLines />
            <NoiseOverlay />

            {/* ── Left panel ── */}
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
                            // key generation
                        </div>
                        <KeyGenVisual />
                    </div>

                    <div className="space-y-3 text-[10px] font-mono">
                        {[
                            { icon: '⬡', text: 'Ключі генеруються локально у вашому браузері' },
                            { icon: '⬡', text: 'Сервер зберігає тільки зашифрований публічний ключ' },
                            { icon: '⬡', text: 'Recovery PIN захищає ключ при відновленні' },
                            { icon: '⬡', text: 'Ніхто, включно з нами, не може прочитати ваші повідомлення' },
                        ].map((item, i) => (
                            <div key={i} className="flex items-start gap-2.5" style={{ color: 'rgba(148,163,184,0.5)' }}>
                                <span style={{ color: 'rgba(109,40,217,0.6)' }}>{item.icon}</span>
                                {item.text}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="text-[9px] font-mono tracking-widest" style={{ color: 'rgba(109,40,217,0.3)' }}>
                    ZERO-KNOWLEDGE · E2E ENCRYPTED
                </div>
            </div>

            {/* ── Right: Form ── */}
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
                            }}>VESPER<span style={{ WebkitTextFillColor: 'rgba(139,92,246,0.6)' }}>MSG</span></span>
                        </Link>
                    </div>

                    {/* Card */}
                    <div className="relative rounded-2xl overflow-hidden" style={{
                        background: 'rgba(10,7,25,0.82)',
                        border: '1px solid rgba(109,40,217,0.18)',
                        backdropFilter: 'blur(24px)',
                        boxShadow: '0 0 60px rgba(109,40,217,0.08), 0 40px 80px rgba(0,0,0,0.5)',
                    }}>
                        <div className="absolute top-0 left-12 right-12 h-px" style={{
                            background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.5), transparent)',
                        }} />

                        {/* Header */}
                        <div className="px-8 pt-8 pb-5" style={{ borderBottom: '1px solid rgba(109,40,217,0.1)' }}>
                            <div className="text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'rgba(139,92,246,0.6)' }}>
                                // new identity registration
                            </div>
                            <div className="flex items-start justify-between">
                                <div>
                                    <h1 className="text-2xl font-bold" style={{
                                        background: 'linear-gradient(135deg, #f1f5f9 0%, #c4b5fd 100%)',
                                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                    }}>
                                        Створити акаунт
                                    </h1>
                                    <p className="text-xs mt-1" style={{ color: 'rgba(100,116,139,0.6)' }}>
                                        Крок {step + 1} з {stepLabels.length} — {stepLabels[step]}
                                    </p>
                                </div>
                                <StepIndicator current={step} total={stepLabels.length} />
                            </div>
                        </div>

                        {/* Form body */}
                        <form onSubmit={handleSubmit(onSubmit)}>
                            <div className="px-8 py-6 min-h-[280px]">

                                {/* STEP 0: Identity */}
                                {step === 0 && (
                                    <div className="space-y-5 transition-all">
                                        <CipherInput
                                            label="Нікнейм / Псевдонім"
                                            placeholder="cipher_agent_7"
                                            hint="мін. 3 символи"
                                            error={errors.nickname?.message as string}
                                            icon={<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
                                            {...register('nickname', {
                                                required: "Нікнейм обов'язковий",
                                                minLength: { value: 3, message: 'Мінімум 3 символи' },
                                            })}
                                        />
                                        <CipherInput
                                            label="Email / Ідентифікатор"
                                            type="email"
                                            placeholder="agent@domain.com"
                                            error={errors.email?.message as string}
                                            icon={<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>}
                                            {...register('email', {
                                                required: "Email обов'язковий",
                                                pattern: { value: /^\S+@\S+$/i, message: 'Невірний формат' },
                                            })}
                                        />
                                        <div className="rounded-lg px-4 py-3" style={{
                                            background: 'rgba(109,40,217,0.07)',
                                            border: '1px solid rgba(109,40,217,0.15)',
                                        }}>
                                            <p className="text-[10px] font-mono leading-relaxed" style={{ color: 'rgba(148,163,184,0.5)' }}>
                                                Email використовується лише для підтвердження акаунту та відновлення доступу. Не передається третім особам.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 1: Credentials */}
                                {step === 1 && (
                                    <div className="space-y-5">
                                        <CipherInput
                                            label="Пароль / Ключ"
                                            type={showPass ? 'text' : 'password'}
                                            placeholder="мінімум 6 символів"
                                            hint="мін. 6 символів"
                                            error={errors.password?.message as string}
                                            icon={<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>}
                                            rightSlot={
                                                <button type="button" onClick={() => setShowPass(s => !s)}
                                                        className="transition-colors" style={{ color: showPass ? 'rgba(139,92,246,0.8)' : 'rgba(100,116,139,0.4)' }}>
                                                    <EyeIcon show={showPass} />
                                                </button>
                                            }
                                            {...register('password', {
                                                required: "Пароль обов'язковий",
                                                minLength: { value: 6, message: 'Мінімум 6 символів' },
                                            })}
                                        />
                                        <PasswordStrength password={password} />

                                        <CipherInput
                                            label="Підтвердження паролю"
                                            type={showConf ? 'text' : 'password'}
                                            placeholder="повторіть пароль"
                                            error={errors.confirmPassword?.message as string}
                                            icon={<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>}
                                            rightSlot={
                                                <button type="button" onClick={() => setShowConf(s => !s)}
                                                        className="transition-colors" style={{ color: showConf ? 'rgba(139,92,246,0.8)' : 'rgba(100,116,139,0.4)' }}>
                                                    <EyeIcon show={showConf} />
                                                </button>
                                            }
                                            {...register('confirmPassword', {
                                                required: 'Потрібно підтвердити пароль',
                                                validate: v => v === password || 'Паролі не збігаються',
                                            })}
                                        />
                                    </div>
                                )}

                                {/* STEP 2: Confirm */}
                                {step === 2 && (
                                    <div className="space-y-4">
                                        <div className="rounded-xl overflow-hidden" style={{
                                            background: 'rgba(5,3,15,0.6)',
                                            border: '1px solid rgba(109,40,217,0.2)',
                                        }}>
                                            <div className="px-4 py-2.5 text-[10px] font-mono tracking-widest uppercase" style={{
                                                borderBottom: '1px solid rgba(109,40,217,0.12)',
                                                color: 'rgba(109,40,217,0.5)',
                                                background: 'rgba(109,40,217,0.05)',
                                            }}>
                                                // registration summary
                                            </div>
                                            <div className="px-4 py-4 space-y-3">
                                                {[
                                                    { k: 'NICKNAME', v: nickname || '—' },
                                                    { k: 'EMAIL',    v: email    || '—' },
                                                    { k: 'PASSWORD', v: '•'.repeat(Math.min(password?.length || 0, 12)) || '—' },
                                                    { k: 'E2E',      v: 'ENABLED' },
                                                    { k: 'KEYS',     v: 'LOCAL ONLY' },
                                                ].map(({ k, v }) => (
                                                    <div key={k} className="flex items-center justify-between text-[11px] font-mono">
                                                        <span style={{ color: 'rgba(100,116,139,0.6)' }}>{k}</span>
                                                        <span style={{
                                                            color: k === 'E2E' || k === 'KEYS'
                                                                ? 'rgba(134,239,172,0.8)'
                                                                : 'rgba(196,181,253,0.8)',
                                                        }}>{v}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-2.5 rounded-lg px-4 py-3" style={{
                                            background: 'rgba(251,191,36,0.05)',
                                            border: '1px solid rgba(251,191,36,0.15)',
                                        }}>
                                            <svg width="13" height="13" fill="none" stroke="rgba(251,191,36,0.7)" strokeWidth="2" viewBox="0 0 24 24" className="shrink-0 mt-0.5">
                                                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                            </svg>
                                            <p className="text-[10px] font-mono leading-relaxed" style={{ color: 'rgba(251,191,36,0.6)' }}>
                                                Після реєстрації на вашу пошту надійде лист підтвердження. Перевірте папку Spam.
                                            </p>
                                        </div>

                                        <label
                                            className="flex items-start gap-3 cursor-pointer group rounded-xl px-4 py-3 transition-colors"
                                            style={{ background: 'rgba(109,40,217,0.05)', border: '1px solid rgba(109,40,217,0.15)' }}
                                        >
                                            <div className="relative flex items-center justify-center mt-0.5 shrink-0">
                                                <input
                                                    type="checkbox"
                                                    checked={tosAccepted}
                                                    onChange={e => setTosAccepted(e.target.checked)}
                                                    className="peer appearance-none w-4 h-4 border-2 border-slate-600 rounded bg-transparent
                               checked:bg-violet-500 checked:border-violet-500 transition-all cursor-pointer"
                                                />
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"
                                                     className="absolute pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity">
                                                    <polyline points="20 6 9 17 4 12"/>
                                                </svg>
                                            </div>
                                            <p className="text-[11px] font-mono leading-relaxed" style={{ color: 'rgba(148,163,184,0.8)' }}>
                                                Я погоджуюсь з{' '}
                                                <button
                                                    type="button"
                                                    onClick={e => { e.preventDefault(); setShowTos(true); }}
                                                    className="underline transition-colors cursor-pointer"
                                                    style={{ color: 'rgba(139,92,246,0.9)' }}
                                                    onMouseEnter={e => (e.currentTarget.style.color = 'rgba(196,181,253,1)')}
                                                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(139,92,246,0.9)')}
                                                >
                                                    Умовами використання та Політикою конфіденційності
                                                </button>
                                            </p>
                                        </label>

                                        {globalError && (
                                            <div className="flex items-start gap-2.5 rounded-lg px-4 py-3" style={{
                                                background: 'rgba(239,68,68,0.07)',
                                                border: '1px solid rgba(239,68,68,0.2)',
                                            }}>
                                                <svg width="13" height="13" fill="none" stroke="rgba(248,113,113,0.8)" strokeWidth="2" viewBox="0 0 24 24" className="shrink-0 mt-0.5">
                                                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                                </svg>
                                                <p className="text-[11px] font-mono" style={{ color: 'rgba(248,113,113,0.8)' }}>{globalError}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Footer buttons */}
                            <div className="px-8 pb-8 space-y-3">
                                {/* Nav buttons */}
                                <div className={`flex gap-3 ${step === 0 ? '' : ''}`}>
                                    {step > 0 && (
                                        <button type="button" onClick={() => setStep(s => s - 1)}
                                                className="flex-1 py-3 rounded-xl text-xs font-mono tracking-widest uppercase transition-all"
                                                style={{
                                                    background: 'rgba(255,255,255,0.02)',
                                                    border: '1px solid rgba(109,40,217,0.2)',
                                                    color: 'rgba(148,163,184,0.6)',
                                                }}>
                                            ← BACK
                                        </button>
                                    )}

                                    {step < 2 ? (
                                        <button type="button" onClick={handleNext}
                                                className="flex-1 relative py-3 rounded-xl text-xs font-mono tracking-widest uppercase text-white overflow-hidden group transition-all"
                                                style={{
                                                    background: 'linear-gradient(135deg, rgba(109,40,217,0.85) 0%, rgba(79,70,229,0.85) 100%)',
                                                    border: '1px solid rgba(139,92,246,0.45)',
                                                    boxShadow: '0 0 25px rgba(109,40,217,0.18)',
                                                }}>
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        NEXT_STEP
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                      </span>
                                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(255,255,255,0.05)' }} />
                                        </button>
                                    ) : (
                                        <button type="submit" disabled={isLoading || !tosAccepted}
                                                className="flex-1 relative py-3 rounded-xl text-xs font-mono tracking-widest uppercase text-white overflow-hidden group transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                style={{
                                                    background: 'linear-gradient(135deg, rgba(109,40,217,0.85) 0%, rgba(79,70,229,0.85) 100%)',
                                                    border: '1px solid rgba(139,92,246,0.45)',
                                                    boxShadow: '0 0 30px rgba(109,40,217,0.2)',
                                                    color: 'rgba(233,213,255,0.95)',
                                                }}>
                      <span className="relative z-10 flex items-center justify-center gap-2.5">
                        {isLoading ? (
                            <>
                                <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke="rgba(196,181,253,0.3)" strokeWidth="3"/>
                                    <path d="M12 2a10 10 0 0110 10" stroke="rgba(196,181,253,0.9)" strokeWidth="3" strokeLinecap="round"/>
                                </svg>
                                Реєстрація...
                            </>
                        ) : (
                            <>
                                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                                </svg>
                                ACTIVATE_IDENTITY
                            </>
                        )}
                      </span>
                                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(255,255,255,0.05)' }} />
                                        </button>
                                    )}
                                </div>

                                {/* Login link */}
                                <div className="text-center">
                  <span className="text-[10px] font-mono" style={{ color: 'rgba(100,116,139,0.5)' }}>
                    Вже є акаунт?{' '}
                      <Link href="/auth/login" className="transition-colors"
                            style={{ color: 'rgba(139,92,246,0.8)' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(196,181,253,1)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(139,92,246,0.8)')}>
                      AUTH_LOGIN →
                    </Link>
                  </span>
                                </div>
                            </div>
                        </form>
                    </div>

                    <p className="text-center mt-6 text-[9px] font-mono tracking-widest" style={{ color: 'rgba(109,40,217,0.3)' }}>
                        ZERO-KNOWLEDGE · NO DATA COLLECTED · E2E ENCRYPTED
                    </p>
                </div>
            </div>

            {showTos && <TosModal onClose={() => setShowTos(false)} />}
        </div>
    );
}