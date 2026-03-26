'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';
import Link from 'next/link';

// Анімація Самознищення повідомлення
function SelfDestructVisual() {
    const [timeLeft, setTimeLeft] = useState(3);
    const [destroyed, setDestroyed] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    setDestroyed(true);
                    setTimeout(() => {
                        setDestroyed(false);
                        setTimeLeft(3);
                    }, 2500); // Відновлення циклу
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="relative w-full h-48 flex flex-col items-center justify-center bg-[#05030f]/80 rounded-2xl border border-violet-500/20 overflow-hidden">
            <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/30">
                <svg width="12" height="12" fill="none" stroke="rgba(196,181,253,0.9)" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                </svg>
                <span className="text-xs font-mono text-violet-300">00:0{timeLeft}</span>
            </div>

            <div
                className="max-w-[80%] bg-violet-600/20 border border-violet-500/30 rounded-2xl rounded-tr-sm p-4 backdrop-blur-md transition-all duration-700 ease-in-out"
                style={{
                    opacity: destroyed ? 0 : 1,
                    filter: destroyed ? 'blur(12px)' : 'blur(0px)',
                    transform: destroyed ? 'scale(0.95) translateY(-10px)' : 'scale(1) translateY(0)',
                }}
            >
                <p className="text-sm font-mono text-slate-200">
                    Код доступу до серверів: <span className="text-violet-300">8842-AX</span>
                </p>
                <div className="mt-2 text-[10px] text-slate-500 flex justify-end">Прочитано</div>
            </div>

            {destroyed && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-mono tracking-widest uppercase text-slate-500 animate-pulse">
                        [ Повідомлення знищено ]
                    </span>
                </div>
            )}
        </div>
    );
}

//Animated Lock SVG
function AnimatedLock() {
    const [unlocked, setUnlocked] = useState(false);
    const [phase, setPhase]       = useState<'locked' | 'unlocking' | 'unlocked'>('locked');

    useEffect(() => {
        let isMounted = true;

        const runCycle = () => {
            if (!isMounted) return;
            setPhase('unlocking');
            setTimeout(() => { if(isMounted) { setPhase('unlocked'); setUnlocked(true); } }, 800);
            setTimeout(() => { if(isMounted) { setPhase('locked'); setUnlocked(false); } }, 3400);
        };

        // Перший запуск
        const initT1 = setTimeout(runCycle, 1800);

        // Цикл
        const interval = setInterval(runCycle, 6000);

        return () => {
            isMounted = false;
            clearTimeout(initT1);
            clearInterval(interval);
        };
    }, []);

    return (
        <div className="relative flex items-center justify-center" style={{ width: 200, height: 220 }}>
            {/* Glow ring */}
            <div
                className="absolute inset-0 rounded-full transition-all duration-1000"
                style={{
                    background: unlocked
                        ? 'radial-gradient(ellipse at center, rgba(139,92,246,0.18) 0%, transparent 70%)'
                        : 'radial-gradient(ellipse at center, rgba(99,102,241,0.10) 0%, transparent 70%)',
                    filter: 'blur(8px)',
                    transform: 'scale(1.4)',
                }}
            />

            <svg width="160" height="190" viewBox="0 0 160 190" fill="none" xmlns="http://www.w3.org/2000/svg" className="overflow-visible">
                {/* ── Shackle ── */}
                <g
                    style={{
                        transform: unlocked ? 'translateY(-22px) translateX(18px) rotate(18deg)' : 'translateY(0px) translateX(0px) rotate(0deg)',
                        transformOrigin: '110px 60px',
                        transition: phase === 'unlocking'
                            ? 'transform 0.7s cubic-bezier(0.34,1.56,0.64,1)'
                            : phase === 'locked'
                                ? 'transform 0.5s cubic-bezier(0.4,0,0.2,1)'
                                : 'transform 0.1s',
                    }}
                >
                    <path
                        d="M46 90 L46 54 C46 30 114 30 114 54 L114 90"
                        stroke={unlocked ? 'rgba(139,92,246,0.9)' : 'rgba(148,163,184,0.6)'}
                        strokeWidth="14"
                        strokeLinecap="round"
                        fill="none"
                        style={{
                            filter: unlocked ? 'drop-shadow(0 0 8px rgba(139,92,246,0.7))' : 'none',
                            transition: 'stroke 0.6s, filter 0.6s',
                        }}
                    />
                    <path
                        d="M46 90 L46 54 C46 30 114 30 114 54 L114 90"
                        stroke={unlocked ? 'rgba(196,181,253,0.3)' : 'rgba(255,255,255,0.07)'}
                        strokeWidth="5"
                        strokeLinecap="round"
                        fill="none"
                    />
                </g>

                {/* ── Lock body ── */}
                <rect
                    x="22" y="88" width="116" height="88" rx="14"
                    fill={unlocked ? 'rgba(109,40,217,0.85)' : 'rgba(30,27,75,0.95)'}
                    style={{
                        filter: unlocked ? 'drop-shadow(0 0 20px rgba(139,92,246,0.5))' : 'none',
                        transition: 'fill 0.7s, filter 0.7s',
                    }}
                />
                <rect
                    x="22" y="88" width="116" height="88" rx="14" fill="none"
                    stroke={unlocked ? 'rgba(196,181,253,0.5)' : 'rgba(99,102,241,0.3)'}
                    strokeWidth="1.5"
                    style={{ transition: 'stroke 0.7s' }}
                />
                <rect x="28" y="92" width="104" height="20" rx="8" fill="rgba(255,255,255,0.04)" />

                {/* ── Keyhole ── */}
                <circle
                    cx="80" cy="126" r="12"
                    fill={unlocked ? 'rgba(233,213,255,0.9)' : 'rgba(148,163,184,0.5)'}
                    style={{ transition: 'fill 0.7s, filter 0.7s', filter: unlocked ? 'drop-shadow(0 0 6px rgba(233,213,255,0.8))' : 'none' }}
                />
                <rect
                    x="75" y="130" width="10" height="18" rx="4"
                    fill={unlocked ? 'rgba(233,213,255,0.9)' : 'rgba(148,163,184,0.5)'}
                    style={{ transition: 'fill 0.7s' }}
                />

                {/* ── Scan line animation ── */}
                {unlocked && (
                    <rect
                        x="22" y="88" width="116" height="4" rx="2"
                        fill="rgba(196,181,253,0.4)"
                        style={{ animation: 'scanLine 1.4s ease-in-out infinite' }}
                    />
                )}
            </svg>

            {/* Status text */}
            <div
                className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs font-mono tracking-[0.25em] transition-all duration-700 whitespace-nowrap"
                style={{
                    color: unlocked ? 'rgba(196,181,253,0.9)' : 'rgba(100,116,139,0.7)',
                    textShadow: unlocked ? '0 0 10px rgba(139,92,246,0.8)' : 'none',
                }}
            >
                {phase === 'locked' && '[ LOCKED ]'}
                {phase === 'unlocking' && '[ VERIFY... ]'}
                {phase === 'unlocked' && '[ SECURED ]'}
            </div>

            <style jsx>{`
                @keyframes scanLine {
                0%   { transform: translateY(0px);  opacity: 0.6; }
                100% { transform: translateY(84px); opacity: 0; }
                }
            `}</style>
        </div>
    );
}

// Background Components
function NoiseOverlay() {
    return (
        <div
            className="pointer-events-none fixed inset-0 z-0 opacity-[0.025]"
            style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
                backgroundSize: '128px',
            }}
        />
    );
}

function BackgroundOrbs() {
    return (
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
            <div
                className="absolute rounded-full opacity-20"
                style={{
                    width: 600, height: 600,
                    background: 'radial-gradient(circle, rgba(109,40,217,0.4) 0%, transparent 70%)',
                    top: '-200px', left: '-150px',
                    filter: 'blur(40px)',
                    animation: 'float1 20s ease-in-out infinite',
                }}
            />
            <div
                className="absolute rounded-full opacity-15"
                style={{
                    width: 500, height: 500,
                    background: 'radial-gradient(circle, rgba(79,70,229,0.35) 0%, transparent 70%)',
                    bottom: '-100px', right: '-100px',
                    filter: 'blur(50px)',
                    animation: 'float2 25s ease-in-out infinite',
                }}
            />
            <style jsx>{`
                @keyframes float1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,40px) scale(1.05); } }
                @keyframes float2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-40px,-30px) scale(0.95); } }
            `}</style>
        </div>
    );
}

function GridLines() {
    return (
        <div
            className="pointer-events-none fixed inset-0 z-0 opacity-[0.04]"
            style={{
                backgroundImage: `linear-gradient(rgba(139,92,246,1) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,1) 1px, transparent 1px)`,
                backgroundSize: '60px 60px',
            }}
        />
    );
}

// Utils & Small Components
function useIntersectionObserver() {
    const ref = useRef<HTMLDivElement>(null);
    const [vis, setVis] = useState(false);
    useEffect(() => {
        const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true); }, { threshold: 0.1 });
        if (ref.current) obs.observe(ref.current);
        return () => obs.disconnect();
    }, []);
    return { ref, vis };
}

function RevealWrapper({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
    const { ref, vis } = useIntersectionObserver();
    return (
        <div
            ref={ref}
            className="transition-all duration-1000"
            style={{
                opacity: vis ? 1 : 0,
                transform: vis ? 'translateY(0)' : 'translateY(30px)',
                transitionDelay: `${delay}ms`,
            }}
        >
            {children}
        </div>
    );
}

function Stat({ value, label }: { value: string; label: string }) {
    return (
        <div className="text-center">
            <div
                className="text-3xl font-bold tracking-tight mb-1"
                style={{
                    background: 'linear-gradient(135deg, #c4b5fd 0%, #818cf8 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                }}
            >
                {value}
            </div>
            <div className="text-xs text-slate-500 tracking-widest uppercase font-mono">{label}</div>
        </div>
    );
}

function CipherTicker() {
    const [chars, setChars] = useState('');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

    useEffect(() => {
        const interval = setInterval(() => {
            setChars(Array.from({ length: 48 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(''));
        }, 80);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="font-mono text-[10px] tracking-wider select-none overflow-hidden" style={{ color: 'rgba(109,40,217,0.4)' }}>
            {chars}
        </div>
    );
}

function FeatureCard({ icon, title, desc, delay = 0 }: { icon: ReactNode; title: string; desc: string; delay?: number; }) {
    const { ref, vis } = useIntersectionObserver();
    return (
        <div
            ref={ref}
            className="group relative rounded-2xl border p-6 transition-all duration-700 hover:-translate-y-1"
            style={{
                background: 'rgba(15,10,40,0.7)',
                borderColor: 'rgba(109,40,217,0.2)',
                backdropFilter: 'blur(12px)',
                opacity: vis ? 1 : 0,
                transform: vis ? 'translateY(0)' : 'translateY(24px)',
                transitionDelay: `${delay}ms`,
                boxShadow: '0 0 0 1px rgba(139,92,246,0.05) inset',
            }}
        >
            <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(109,40,217,0.12) 0%, transparent 70%)' }}
            />
            <div
                className="absolute top-0 left-8 right-8 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.6), transparent)' }}
            />
            <div
                className="mb-4 inline-flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-300 group-hover:scale-110"
                style={{ background: 'rgba(109,40,217,0.15)', border: '1px solid rgba(139,92,246,0.25)', boxShadow: '0 0 12px rgba(109,40,217,0.15)' }}
            >
                {icon}
            </div>
            <h3 className="text-sm font-semibold text-slate-200 mb-2 tracking-wide">{title}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
        </div>
    );
}

// MAIN PAGE
export default function LandingPage() {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const features = [
        {
            icon: <svg width="20" height="20" fill="none" stroke="rgba(139,92,246,0.9)" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
            title: 'End-to-End шифрування',
            desc: 'Ваші ключі генеруються локально і ніколи не залишають пристрій.',
        },
        {
            icon: <svg width="20" height="20" fill="none" stroke="rgba(139,92,246,0.9)" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>,
            title: 'WebRTC дзвінки',
            desc: 'Peer-to-peer дзвінки з наскрізним шифруванням. Без серверів-посередників.',
        },
        {
            icon: <svg width="20" height="20" fill="none" stroke="rgba(139,92,246,0.9)" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
            title: 'Захищені групи',
            desc: 'Кожен учасник шифрує власним ключем за допомогою Sender Key протоколу.',
        },
        {
            icon: <svg width="20" height="20" fill="none" stroke="rgba(139,92,246,0.9)" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/></svg>,
            title: 'Recovery PIN',
            desc: 'PBKDF2 хешування дозволяє відновити ключі при втраті телефону.',
        },
        {
            icon: <svg width="20" height="20" fill="none" stroke="rgba(139,92,246,0.9)" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
            title: 'Анонімні канали',
            desc: 'Публічні канали без збору метаданих читачів.',
        },
        {
            icon: <svg width="20" height="20" fill="none" stroke="rgba(139,92,246,0.9)" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
            title: 'Медіа без слідів',
            desc: 'Всі фото та аудіо шифруються перед завантаженням на сервер.',
        },
    ];

    return (
        <div className="min-h-screen text-white relative overflow-x-hidden" style={{ background: 'linear-gradient(160deg, #06040f 0%, #0a0714 40%, #080c1a 100%)' }}>
            <BackgroundOrbs />
            <GridLines />
            <NoiseOverlay />

            {/* ── NAVBAR ── */}
            <nav
                className="fixed top-0 left-0 right-0 z-50 transition-all duration-500"
                style={{
                    background: scrolled ? 'rgba(6,4,15,0.85)' : 'transparent',
                    backdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
                    borderBottom: scrolled ? '1px solid rgba(109,40,217,0.15)' : '1px solid transparent',
                }}
            >
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: 'rgba(109,40,217,0.2)', border: '1px solid rgba(139,92,246,0.4)', boxShadow: '0 0 12px rgba(109,40,217,0.3)' }}
                        >
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="rgba(196,181,253,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                        <span className="font-semibold tracking-tight" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '15px', background: 'linear-gradient(135deg, #e2d9f3 0%, #a78bfa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            VESPER<span style={{ WebkitTextFillColor: 'rgba(139,92,246,0.6)' }}>MSG</span>
                        </span>
                    </div>

                    <div className="hidden md:flex items-center gap-8">
                        {['Функції', 'Безпека', 'Протокол'].map(item => (
                            <a key={item} href="#features" className="text-xs font-mono tracking-widest text-slate-400 hover:text-violet-300 transition-colors uppercase">
                                {item}
                            </a>
                        ))}
                    </div>

                    <div className="flex items-center gap-3">
                        <Link href="/auth/login" className="px-4 py-2 text-xs font-mono tracking-widest uppercase text-slate-300 hover:text-violet-300 transition-colors">Вхід</Link>
                        <Link
                            href="/auth/register"
                            className="relative px-5 py-2 text-xs font-mono tracking-widest uppercase text-white rounded-lg overflow-hidden group transition-all"
                            style={{ background: 'rgba(109,40,217,0.25)', border: '1px solid rgba(139,92,246,0.4)', boxShadow: '0 0 20px rgba(109,40,217,0.2)' }}
                        >
                            <span className="relative z-10">Реєстрація</span>
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'rgba(109,40,217,0.35)' }} />
                        </Link>
                    </div>
                </div>
            </nav>

            {/* ── HERO ── */}
            <section className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 pt-20">
                <div className="mb-8 w-full max-w-md overflow-hidden"><CipherTicker /></div>

                <div
                    className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 text-xs font-mono tracking-widest uppercase"
                    style={{ background: 'rgba(109,40,217,0.1)', border: '1px solid rgba(139,92,246,0.25)', color: 'rgba(196,181,253,0.8)' }}
                >
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'rgba(139,92,246,0.9)', boxShadow: '0 0 6px rgba(139,92,246,1)' }} />
                    Наскрізне шифрування активне
                </div>

                <div className="mb-10"><AnimatedLock /></div>

                <h1 className="text-center font-bold leading-tight mb-6 max-w-3xl" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 'clamp(2rem, 5vw, 3.5rem)', letterSpacing: '-0.02em' }}>
                    <span style={{ background: 'linear-gradient(135deg, #f1f5f9 0%, #c4b5fd 50%, #818cf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Повідомлення, яких
                    </span><br />
                    <span style={{ background: 'linear-gradient(135deg, #818cf8 0%, #7c3aed 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        ніхто не прочитає
                    </span>
                </h1>

                <p className="text-center max-w-xl mb-10 leading-relaxed" style={{ color: 'rgba(148,163,184,0.7)', fontSize: '15px', fontFamily: "'JetBrains Mono', monospace" }}>
                    Месенджер з X25519 + AES-256-GCM шифруванням, WebRTC дзвінками
                    та повним контролем над приватністю. Без збору даних.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-4 mb-16">
                    <Link
                        href="/auth/register"
                        className="relative flex items-center gap-3 px-8 py-3.5 rounded-xl text-sm font-mono tracking-widest uppercase text-white overflow-hidden group"
                        style={{ background: 'linear-gradient(135deg, rgba(109,40,217,0.8) 0%, rgba(79,70,229,0.8) 100%)', border: '1px solid rgba(139,92,246,0.5)', boxShadow: '0 0 40px rgba(109,40,217,0.25)' }}
                    >
                        <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M13.8 12H3"/></svg>
                        Почати безкоштовно
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.3) 0%, rgba(99,102,241,0.3) 100%)' }} />
                    </Link>
                </div>

                <div className="flex items-center gap-6 sm:gap-12 px-6 sm:px-10 py-6 rounded-2xl flex-wrap justify-center" style={{ background: 'rgba(15,10,40,0.6)', border: '1px solid rgba(109,40,217,0.15)', backdropFilter: 'blur(16px)' }}>
                    <Stat value="256-bit" label="AES-GCM" />
                    <div className="w-px h-10 hidden sm:block" style={{ background: 'rgba(109,40,217,0.25)' }} />
                    <Stat value="X25519" label="ECDH" />
                    <div className="w-px h-10 hidden sm:block" style={{ background: 'rgba(109,40,217,0.25)' }} />
                    <Stat value="0" label="збережених ключів" />
                </div>
            </section>

            {/* ── DEEP DIVE 1: PROTOCOL ── */}
            <section className="relative z-10 py-24 px-6 overflow-hidden">
                <div className="max-w-5xl mx-auto">
                    <RevealWrapper>
                        <div className="grid md:grid-cols-2 gap-16 items-center">
                            <div>
                                <div className="text-xs font-mono tracking-[0.3em] uppercase mb-4 text-violet-400">// архітектура</div>
                                <h2 className="text-3xl font-bold mb-6 font-mono bg-gradient-to-br from-violet-200 to-violet-400 bg-clip-text text-transparent">
                                    Нульова довіра до сервера
                                </h2>
                                <p className="text-slate-400 text-sm leading-relaxed mb-8">
                                    Сервер бачить лише зашифровані пакети. Ваші приватні ключі генеруються у браузері через Web Crypto API та ніколи не пересилаються по мережі. Навіть ми не можемо прочитати ваші повідомлення.
                                </p>
                                <ul className="space-y-4">
                                    {['Обмін ключами через X25519', 'Шифрування даних AES-256-GCM', 'Локальне сховище (IndexedDB)'].map((item, i) => (
                                        <li key={i} className="flex items-center gap-3 text-sm font-mono text-slate-300">
                                            <div className="w-1.5 h-1.5 rounded-full bg-violet-500" /> {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Code snippet window */}
                            <div className="rounded-xl overflow-hidden shadow-[0_0_30px_rgba(109,40,217,0.2)]" style={{ background: 'rgba(5,3,15,0.8)', border: '1px solid rgba(109,40,217,0.2)' }}>
                                <div className="flex items-center gap-2 px-4 py-3 bg-violet-900/10 border-b border-violet-500/20">
                                    <div className="w-3 h-3 rounded-full bg-red-500" />
                                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                                    <div className="w-3 h-3 rounded-full bg-green-500" />
                                    <span className="text-[10px] text-slate-500 ml-2 font-mono">crypto.ts</span>
                                </div>
                                <div className="p-6 text-[11px] leading-loose font-mono">
                                    <div className="text-slate-500">{'// 1. ECDH обмін ключами'}</div>
                                    <div>
                                        <span className="text-violet-400">const</span> <span className="text-violet-200">keys</span> <span className="text-slate-400">= await</span> <span className="text-blue-400">generateECDH</span><span className="text-slate-400">()</span>
                                    </div>
                                    <br />
                                    <div className="text-slate-500">{'// 2. Генерація AES ключа'}</div>
                                    <div>
                                        <span className="text-violet-400">const</span> <span className="text-violet-200">aesKey</span> <span className="text-slate-400">= await</span> <span className="text-blue-400">deriveKey</span><span className="text-slate-400">(privKey, friendPubKey)</span>
                                    </div>
                                    <br />
                                    <div className="text-slate-500">{'// 3. Сервер бачить лише:'}</div>
                                    <div className="text-emerald-400 mt-2 p-2 bg-emerald-900/20 rounded border border-emerald-500/20 break-all">
                                        "U2FsdGVkX1+QJk2x... [256-bit Ciphertext]"
                                    </div>
                                </div>
                            </div>
                        </div>
                    </RevealWrapper>
                </div>
            </section>

            {/* ── DEEP DIVE 2: SELF DESTRUCT ── */}
            <section className="relative z-10 py-24 px-6 bg-violet-900/5 border-y border-violet-500/10">
                <div className="max-w-5xl mx-auto">
                    <RevealWrapper delay={100}>
                        <div className="grid md:grid-cols-2 gap-16 items-center">
                            {/* Visual Left */}
                            <div className="order-2 md:order-1 flex justify-center">
                                <SelfDestructVisual />
                            </div>

                            {/* Text Right */}
                            <div className="order-1 md:order-2">
                                <div className="text-xs font-mono tracking-[0.3em] uppercase mb-4 text-violet-400">// ефемерність</div>
                                <h2 className="text-3xl font-bold mb-6 font-mono bg-gradient-to-br from-violet-200 to-violet-400 bg-clip-text text-transparent">
                                    Самознищувані повідомлення
                                </h2>
                                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                                    Деякі розмови не повинні залишати слідів. Налаштуйте таймер самознищення, і повідомлення буде видалено з пристроїв обох користувачів одразу після прочитання.
                                </p>
                                <div className="flex gap-3">
                                    {['30 сек', '5 хв', '1 год', '24 год'].map(time => (
                                        <span key={time} className="px-3 py-1 text-xs font-mono rounded bg-violet-500/10 border border-violet-500/20 text-violet-300">
                                            {time}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </RevealWrapper>
                </div>
            </section>

            {/* ── FEATURES GRID ── */}
            <section id="features" className="relative z-10 py-24 px-6">
                <div className="max-w-6xl mx-auto">
                    <RevealWrapper>
                        <div className="text-center mb-16">
                            <div className="text-xs font-mono tracking-[0.3em] uppercase mb-4 text-violet-400">// можливості</div>
                            <h2 className="text-3xl font-bold font-mono bg-gradient-to-br from-violet-200 to-violet-400 bg-clip-text text-transparent">
                                Більше ніж просто чат
                            </h2>
                        </div>
                    </RevealWrapper>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {features.map((f, i) => (
                            <FeatureCard key={f.title} icon={f.icon} title={f.title} desc={f.desc} delay={i * 100} />
                        ))}
                    </div>
                </div>
            </section>

            {/* ── FINAL CTA ── */}
            <section className="relative z-10 py-32 px-6">
                <RevealWrapper>
                    <div className="max-w-2xl mx-auto text-center">
                        <div className="text-xs font-mono tracking-[0.3em] uppercase mb-4 text-violet-400">// фінал</div>
                        <h2 className="text-4xl font-bold mb-6 font-mono bg-gradient-to-br from-slate-100 to-violet-300 bg-clip-text text-transparent">
                            Ваша приватність —<br />ваше право
                        </h2>
                        <p className="text-slate-500 text-sm font-mono mb-10 leading-relaxed">
                            Реєстрація безкоштовна. Ключі генеруються у вашому браузері.<br />
                            Приєднуйтесь до безпечного спілкування.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link
                                href="/auth/register"
                                className="relative flex items-center justify-center gap-3 px-10 py-4 rounded-xl text-sm font-mono tracking-widest uppercase text-white overflow-hidden group w-full sm:w-auto"
                                style={{ background: 'linear-gradient(135deg, rgba(109,40,217,0.9) 0%, rgba(79,70,229,0.9) 100%)', border: '1px solid rgba(139,92,246,0.6)', boxShadow: '0 0 50px rgba(109,40,217,0.3)' }}
                            >
                                Створити акаунт
                                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400 bg-white/10" />
                            </Link>
                        </div>
                    </div>
                </RevealWrapper>
            </section>

            {/* ── FOOTER ── */}
            <footer className="relative z-10 py-8 px-6 border-t border-violet-500/10">
                <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                    <span className="text-xs font-mono tracking-widest text-violet-500/50">
                        © 2026 Vesper — Encrypted Communications.
                    </span>
                    <div className="flex items-center gap-6">
                        {['Приватність', 'GitHub', 'Документація'].map(item => (
                            <a key={item} href="#" className="text-xs font-mono text-slate-500 hover:text-violet-400 transition-colors uppercase">
                                {item}
                            </a>
                        ))}
                    </div>
                </div>
            </footer>
        </div>
    );
}