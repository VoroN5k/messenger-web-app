// client/src/components/auth/ClosingLockVisual.tsx
'use client';
import { useState, useEffect } from 'react';

export function ClosingLockVisual() {
    const [phase, setPhase] = useState<'open' | 'closing' | 'secured'>('open');

    useEffect(() => {
        // Послідовність анімації закриття
        const t1 = setTimeout(() => setPhase('closing'), 400); // Починаємо закривати майже одразу
        const t2 = setTimeout(() => setPhase('secured'), 1000); // Замок закрився, вмикаємо світіння
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, []);

    const isSecured = phase === 'secured';
    const isOpen = phase === 'open';

    return (
        <div className="relative flex flex-col items-center justify-center w-full py-8">
            {/* Glow ring */}
            <div
                className="absolute inset-0 rounded-full transition-all duration-1000 m-auto"
                style={{
                    width: '180px', height: '180px',
                    background: isSecured
                        ? 'radial-gradient(ellipse at center, rgba(16,185,129,0.15) 0%, transparent 70%)' // Зелене світіння
                        : 'radial-gradient(ellipse at center, rgba(139,92,246,0.10) 0%, transparent 70%)',
                    filter: 'blur(12px)',
                    transform: isSecured ? 'scale(1.5)' : 'scale(1)',
                }}
            />

            <svg width="120" height="150" viewBox="0 0 160 190" fill="none" className="relative z-10">
                {/* ── Дужка (Shackle) ── */}
                <g
                    style={{
                        // Якщо відкритий - піднята вгору і повернута. Інакше - закрита.
                        transform: isOpen ? 'translateY(-22px) translateX(18px) rotate(18deg)' : 'translateY(0px) translateX(0px) rotate(0deg)',
                        transformOrigin: '110px 60px',
                        transition: 'transform 0.6s cubic-bezier(0.34,1.56,0.64,1)', // Пружинна анімація
                    }}
                >
                    <path
                        d="M46 90 L46 54 C46 30 114 30 114 54 L114 90"
                        stroke={isSecured ? 'rgba(52,211,153,0.9)' : 'rgba(196,181,253,0.6)'}
                        strokeWidth="14" strokeLinecap="round" fill="none"
                        style={{ transition: 'stroke 0.5s' }}
                    />
                </g>

                {/* ── Корпус (Body) ── */}
                <rect
                    x="22" y="88" width="116" height="88" rx="14"
                    fill={isSecured ? 'rgba(6,78,59,0.9)' : 'rgba(30,27,75,0.95)'}
                    style={{
                        filter: isSecured ? 'drop-shadow(0 0 20px rgba(16,185,129,0.4))' : 'none',
                        transition: 'fill 0.5s, filter 0.5s',
                    }}
                />
                <rect
                    x="22" y="88" width="116" height="88" rx="14" fill="none"
                    stroke={isSecured ? 'rgba(110,231,183,0.6)' : 'rgba(139,92,246,0.4)'}
                    strokeWidth="1.5"
                    style={{ transition: 'stroke 0.5s' }}
                />

                {/* ── Замочна щілина (Keyhole) ── */}
                <circle cx="80" cy="126" r="12" fill={isSecured ? 'rgba(167,243,208,0.9)' : 'rgba(148,163,184,0.4)'} style={{ transition: 'fill 0.5s' }} />
                <rect x="75" y="130" width="10" height="18" rx="4" fill={isSecured ? 'rgba(167,243,208,0.9)' : 'rgba(148,163,184,0.4)'} style={{ transition: 'fill 0.5s' }} />
            </svg>

            {/* Status text */}
            <div
                className="mt-6 text-[11px] font-mono tracking-[0.25em] transition-all duration-500 uppercase"
                style={{
                    color: isSecured ? 'rgba(16,185,129,0.9)' : 'rgba(196,181,253,0.7)',
                    textShadow: isSecured ? '0 0 10px rgba(16,185,129,0.6)' : 'none',
                }}
            >
                {phase === 'open' && '[ UNLOCKED ]'}
                {phase === 'closing' && '[ SECURING KEYS... ]'}
                {phase === 'secured' && '[ VAULT ENCRYPTED ]'}
            </div>

            <p className="mt-3 text-[10px] font-mono text-slate-500 animate-pulse">
                Редирект до безпечного чату...
            </p>
        </div>
    );
}