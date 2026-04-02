'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/src/store/useAuthStore';
import api from '@/src/lib/axios';
import { jwtDecode } from 'jwt-decode';
import { AuthResponse, JwtPayload, User } from '@/src/types/auth.types';
import Link from 'next/link';

// ── Shared background components ──────────────────────────────────────────────
function GridLines() {
    return (
        <div
            className="pointer-events-none fixed inset-0 z-0 opacity-[0.035]"
            style={{
                backgroundImage: `
          linear-gradient(rgba(139,92,246,1) 1px, transparent 1px),
          linear-gradient(90deg, rgba(139,92,246,1) 1px, transparent 1px)
        `,
                backgroundSize: '60px 60px',
            }}
        />
    );
}

function BackgroundOrbs() {
    return (
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
            <div className="absolute rounded-full" style={{
                width: 700, height: 700,
                background: 'radial-gradient(circle, rgba(109,40,217,0.22) 0%, transparent 65%)',
                top: '-250px', left: '-200px', filter: 'blur(50px)',
                animation: 'orbFloat1 22s ease-in-out infinite',
            }} />
            <div className="absolute rounded-full" style={{
                width: 500, height: 500,
                background: 'radial-gradient(circle, rgba(79,70,229,0.18) 0%, transparent 65%)',
                bottom: '-150px', right: '-100px', filter: 'blur(40px)',
                animation: 'orbFloat2 28s ease-in-out infinite',
            }} />
            <style jsx>{`
        @keyframes orbFloat1 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(40px,50px)} }
        @keyframes orbFloat2 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,-40px)} }
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

// ── Scanning hex animation (left panel) ──────────────────────────────────────
function HexGrid() {
    const rows = 8, cols = 6;
    const [active, setActive] = useState<Set<string>>(new Set());

    useEffect(() => {
        const interval = setInterval(() => {
            const newActive = new Set<string>();
            const count = Math.floor(Math.random() * 6) + 3;
            for (let i = 0; i < count; i++) {
                const r = Math.floor(Math.random() * rows);
                const c = Math.floor(Math.random() * cols);
                newActive.add(`${r}-${c}`);
            }
            setActive(newActive);
        }, 600);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex flex-col gap-1 select-none">
            {Array.from({ length: rows }, (_, r) => (
                <div key={r} className="flex gap-1" style={{ marginLeft: r % 2 === 0 ? 0 : 18 }}>
                    {Array.from({ length: cols }, (_, c) => {
                        const key = `${r}-${c}`;
                        const isActive = active.has(key);
                        return (
                            <div key={c} style={{
                                width: 32, height: 28,
                                clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                                background: isActive
                                    ? 'rgba(139,92,246,0.35)'
                                    : 'rgba(109,40,217,0.06)',
                                border: 'none',
                                transition: 'background 0.4s',
                                boxShadow: isActive ? '0 0 8px rgba(139,92,246,0.4)' : 'none',
                            }} />
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

// ── Cipher stream ─────────────────────────────────────────────────────────────
function CipherStream() {
    const [lines, setLines] = useState<string[]>([]);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    const rand = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

    useEffect(() => {
        setLines(Array.from({ length: 6 }, () => rand(28)));
        const iv = setInterval(() => {
            setLines(prev => {
                const next = [...prev];
                const idx = Math.floor(Math.random() * next.length);
                next[idx] = rand(28);
                return next;
            });
        }, 120);
        return () => clearInterval(iv);
    }, []);

    return (
        <div className="font-mono text-[10px] leading-5 select-none" style={{ color: 'rgba(109,40,217,0.45)' }}>
            {lines.map((line, i) => <div key={i}>{line}</div>)}
        </div>
    );
}

// ── Animated input field ──────────────────────────────────────────────────────
function CipherInput({
                         label, type = 'text', placeholder, error, icon, rightSlot,
                         ...rest
                     }: {
    label: string; type?: string; placeholder?: string;
    error?: string; icon?: React.ReactNode; rightSlot?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
    const [focused, setFocused] = useState(false);

    return (
        <div className="space-y-1.5">
            <label className="block text-[10px] font-mono tracking-[0.2em] uppercase" style={{ color: 'rgba(139,92,246,0.7)' }}>
                {label}
            </label>
            <div className="relative">
                {/* Glow border */}
                <div className="absolute inset-0 rounded-lg transition-opacity duration-300" style={{
                    background: focused ? 'rgba(109,40,217,0.15)' : 'transparent',
                    boxShadow: focused ? '0 0 0 1px rgba(139,92,246,0.5), 0 0 20px rgba(109,40,217,0.1)' : '0 0 0 1px rgba(109,40,217,0.2)',
                    borderRadius: 8,
                    pointerEvents: 'none',
                }} />
                {icon && (
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10" style={{ color: focused ? 'rgba(139,92,246,0.8)' : 'rgba(100,116,139,0.5)' }}>
                        {icon}
                    </div>
                )}
                <input
                    type={type}
                    placeholder={placeholder}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    {...rest}
                    className="relative z-10 w-full bg-transparent rounded-lg py-3 text-sm font-mono outline-none transition-all"
                    style={{
                        paddingLeft: icon ? 40 : 16,
                        paddingRight: rightSlot ? 44 : 16,
                        color: 'rgba(226,232,240,0.9)',
                        caretColor: 'rgba(139,92,246,0.9)',
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    }}
                />
                {rightSlot && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
                        {rightSlot}
                    </div>
                )}
            </div>
            {error && (
                <p className="text-[10px] font-mono" style={{ color: 'rgba(248,113,113,0.8)' }}>
                    ↳ {error}
                </p>
            )}
        </div>
    );
}

// ── Main Login Page ───────────────────────────────────────────────────────────
export default function LoginPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [showPass, setShowPass] = useState(false);
    const [globalError, setGlobalError] = useState('');
    const [mounted, setMounted] = useState(false);
    const setAuth = useAuthStore((s) => s.setAuth);

    const { register, handleSubmit, formState: { errors } } = useForm();

    useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);

    const onSubmit = async (data: any) => {
        setIsLoading(true);
        setGlobalError('');
        try {
            const response = await api.post<AuthResponse>('/auth/login', data);
            const token = response.data.accessToken;
            const decoded: any = jwtDecode<JwtPayload>(token);
            const user: User = {
                id: decoded.sub, nickname: decoded.nickname,
                email: decoded.email, role: decoded.role, avatarUrl: decoded.avatarUrl,
            };
            setAuth(user, token);

            sessionStorage.setItem('freshLogin', 'true');
            window.location.href = '/chat';
        } catch (e: any) {
            const msg = e.response?.data?.message || 'Помилка входу';
            setGlobalError(Array.isArray(msg) ? msg[0] : msg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex relative overflow-hidden"
             style={{ background: 'linear-gradient(160deg, #06040f 0%, #0a0714 50%, #080c1a 100%)', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
            <BackgroundOrbs />
            <GridLines />
            <NoiseOverlay />

            {/* ── Left decorative panel ── */}
            <div className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 relative z-10 p-12"
                 style={{ borderRight: '1px solid rgba(109,40,217,0.12)' }}>
                {/* Top logo */}
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

                {/* Center content */}
                <div className="space-y-8">
                    <div>
                        <div className="text-[10px] tracking-[0.3em] uppercase mb-4" style={{ color: 'rgba(139,92,246,0.6)' }}>
                            // session handshake
                        </div>
                        <HexGrid />
                    </div>

                    <div className="space-y-3">
                        <CipherStream />
                        <div className="text-[9px] tracking-widest uppercase" style={{ color: 'rgba(109,40,217,0.4)' }}>
                            ↑ live key derivation stream
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="space-y-2">
                        {[
                            { k: 'PROTOCOL', v: 'X25519 ECDH' },
                            { k: 'CIPHER',   v: 'AES-256-GCM' },
                            { k: 'KDF',      v: 'HKDF-SHA256' },
                            { k: 'STATUS',   v: 'ACTIVE' },
                        ].map(({ k, v }) => (
                            <div key={k} className="flex items-center justify-between text-[10px] font-mono">
                                <span style={{ color: 'rgba(100,116,139,0.6)' }}>{k}</span>
                                <span className="px-2 py-0.5 rounded" style={{
                                    background: v === 'ACTIVE' ? 'rgba(34,197,94,0.1)' : 'rgba(109,40,217,0.12)',
                                    color: v === 'ACTIVE' ? 'rgba(134,239,172,0.8)' : 'rgba(196,181,253,0.7)',
                                    border: `1px solid ${v === 'ACTIVE' ? 'rgba(34,197,94,0.2)' : 'rgba(109,40,217,0.2)'}`,
                                }}>
                  {v === 'ACTIVE' && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 bg-green-400 animate-pulse" />}
                                    {v}
                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom */}
                <div className="text-[9px] font-mono tracking-widest" style={{ color: 'rgba(109,40,217,0.3)' }}>
                    ZERO-KNOWLEDGE · E2E ENCRYPTED
                </div>
            </div>

            {/* ── Right: Form panel ── */}
            <div className="flex-1 flex items-center justify-center relative z-10 px-6 py-12">
                <div
                    className="w-full max-w-md transition-all duration-700"
                    style={{
                        opacity: mounted ? 1 : 0,
                        transform: mounted ? 'translateY(0)' : 'translateY(20px)',
                    }}
                >
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
                        background: 'rgba(10,7,25,0.8)',
                        border: '1px solid rgba(109,40,217,0.18)',
                        backdropFilter: 'blur(24px)',
                        boxShadow: '0 0 60px rgba(109,40,217,0.08), 0 40px 80px rgba(0,0,0,0.5)',
                    }}>
                        {/* Top glow line */}
                        <div className="absolute top-0 left-12 right-12 h-px" style={{
                            background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.5), transparent)',
                        }} />

                        {/* Header */}
                        <div className="px-8 pt-8 pb-6" style={{ borderBottom: '1px solid rgba(109,40,217,0.1)' }}>
                            <div className="text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'rgba(139,92,246,0.6)' }}>
                                // authentication required
                            </div>
                            <h1 className="text-2xl font-bold" style={{
                                background: 'linear-gradient(135deg, #f1f5f9 0%, #c4b5fd 100%)',
                                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            }}>
                                Ідентифікація
                            </h1>
                            <p className="text-xs mt-1" style={{ color: 'rgba(100,116,139,0.7)' }}>
                                Введіть облікові дані для отримання токена доступу
                            </p>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit(onSubmit)} className="px-8 py-6 space-y-5">
                            <CipherInput
                                label="Email / Ідентифікатор"
                                type="email"
                                placeholder="user@domain.com"
                                error={errors.email?.message as string}
                                icon={
                                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                        <polyline points="22,6 12,13 2,6" />
                                    </svg>
                                }
                                {...register('email', {
                                    required: "Email обов'язковий",
                                    pattern: { value: /^\S+@\S+$/i, message: 'Невірний формат' },
                                })}
                            />

                            <CipherInput
                                label="Пароль / Ключ доступу"
                                type={showPass ? 'text' : 'password'}
                                placeholder="••••••••••••"
                                error={errors.password?.message as string}
                                icon={
                                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                        <path d="M7 11V7a5 5 0 0110 0v4" />
                                    </svg>
                                }
                                rightSlot={
                                    <button type="button" onClick={() => setShowPass(s => !s)}
                                            className="transition-colors" style={{ color: showPass ? 'rgba(139,92,246,0.8)' : 'rgba(100,116,139,0.5)' }}>
                                        {showPass
                                            ? <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                            : <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                        }
                                    </button>
                                }
                                {...register('password', { required: "Пароль обов'язковий" })}
                            />

                            {/* Forgot password */}
                            <div className="flex justify-end">
                                <Link href="/auth/forgot-password" className="text-[10px] font-mono tracking-wider transition-colors"
                                      style={{ color: 'rgba(139,92,246,0.6)' }}
                                      onMouseEnter={e => (e.currentTarget.style.color = 'rgba(196,181,253,0.9)')}
                                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(139,92,246,0.6)')}>
                                    RESET_PASSWORD →
                                </Link>
                            </div>

                            {/* Error */}
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

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="relative w-full py-3.5 rounded-xl text-sm font-mono tracking-widest uppercase overflow-hidden group transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(109,40,217,0.85) 0%, rgba(79,70,229,0.85) 100%)',
                                    border: '1px solid rgba(139,92,246,0.45)',
                                    color: 'rgba(233,213,255,0.95)',
                                    boxShadow: '0 0 30px rgba(109,40,217,0.2)',
                                }}
                            >
                <span className="relative z-10 flex items-center justify-center gap-2.5">
                  {isLoading ? (
                      <>
                          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="rgba(196,181,253,0.3)" strokeWidth="3"/>
                              <path d="M12 2a10 10 0 0110 10" stroke="rgba(196,181,253,0.9)" strokeWidth="3" strokeLinecap="round"/>
                          </svg>
                          Автентифікація...
                      </>
                  ) : (
                      <>
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M13.8 12H3"/>
                          </svg>
                          Отримати доступ
                      </>
                  )}
                </span>
                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                     style={{ background: 'rgba(255,255,255,0.05)' }} />
                            </button>
                        </form>

                        {/* Footer */}
                        <div className="px-8 pb-8 text-center">
                            <div className="text-[10px] font-mono" style={{ color: 'rgba(100,116,139,0.5)' }}>
                                Немає акаунту?{' '}
                                <Link href="/auth/register" className="transition-colors"
                                      style={{ color: 'rgba(139,92,246,0.8)' }}
                                      onMouseEnter={e => (e.currentTarget.style.color = 'rgba(196,181,253,1)')}
                                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(139,92,246,0.8)')}>
                                    REGISTER_NEW_IDENTITY →
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Bottom note */}
                    <p className="text-center mt-6 text-[9px] font-mono tracking-widest" style={{ color: 'rgba(109,40,217,0.3)' }}>
                        ZERO-KNOWLEDGE · NO DATA COLLECTED · E2E ENCRYPTED
                    </p>
                </div>
            </div>
        </div>
    );
}