// client/src/app/auth/setup-recovery/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useE2E } from '@/src/hooks/useE2E';
import { useAuthStore } from '@/src/store/useAuthStore';
import api from "@/src/lib/axios";
import { TwoFactorVerifyModal } from "@/src/components/auth/TwoFactorVerifyModal";
import { GridLines, BackgroundOrbs, NoiseOverlay } from "@/src/components/ui/BackgroundFx";
import { CipherInput } from "@/src/components/ui/CipherInput";
import { ClosingLockVisual } from "@/src/components/auth/ClosingLockVisual";
import {EmergencyKitModal} from "@/src/components/auth/EmergencyKitModal";

// ── Індикатор надійності PIN ──
function CyberPinStrength({ pin }: { pin: string }) {
    if (!pin) return null;
    const score = [
        pin.length >= 6,
        pin.length >= 8,
        /[A-Za-z]/.test(pin), // Якщо додали літери
        /[^A-Za-z0-9]/.test(pin), // Символи
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
                    SECURITY_{labels[score - 1] ?? 'ZERO'}
                </span>
            </div>
        </div>
    );
}

// ── Головна Сторінка ──
export default function SetupRecoveryPage() {
    const router       = useRouter();
    const searchParams = useSearchParams();
    const isVerified   = searchParams.get('verified') === 'true';
    const isReset      = searchParams.get('reset') === 'true';

    const { user, _hasHydrated } = useAuthStore();
    const { isReady, needsRecovery, resetToNewKeys, setupRecovery } = useE2E();
    const [isResettingKeys, setIsResettingKeys] = useState(false);

    const [pin,         setPin]         = useState('');
    const [confirm,     setConfirm]     = useState('');
    const [showPin,     setShowPin]     = useState(false);
    const [showConf,    setShowConf]    = useState(false);
    const [loading,     setLoading]     = useState(false);
    const [success,     setSuccess]     = useState(false);
    const [error,       setError]       = useState('');
    const [mounted,     setMounted]     = useState(false);

    // 2FA state
    const [twoFACode,   setTwoFACode]   = useState('');
    const [show2FA,     setShow2FA]     = useState(false);
    const [twoFADone,   setTwoFADone]   = useState(false);
    const [checking2FA, setChecking2FA] = useState(false);

    const [showEmergencyKit, setShowEmergencyKit] = useState(false);

    useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);

    useEffect(() => {
        if (!isReset || !_hasHydrated || !user) return;
        if (isReady) return; // вже готово
        if (isResettingKeys) return;

        // Якщо застрягли в needs-recovery під час reset — генеруємо нові ключі
        const timer = setTimeout(async () => {
            if (!isReady && isReset) {
                if (typeof resetToNewKeys !== 'function') {
                    setError('Функція скидання ключів недоступна');
                    return;
                }

                setIsResettingKeys(true);
                try {
                    await resetToNewKeys();
                } catch (e) {
                    setError('Помилка генерації ключів');
                } finally {
                    setIsResettingKeys(false);
                }
            }
        }, 3000);

        return () => clearTimeout(timer);
    }, [isReset, isReady, _hasHydrated, user, isResettingKeys]);

    useEffect(() => {
        if (_hasHydrated && !user) router.push('/auth/login');
    }, [user, _hasHydrated, router]);

    useEffect(() => {
        if (!isReset) setTwoFADone(true);
    }, [isReset]);

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

    // Авто-редирект через 3 секунди (щоб програлась анімація замка)
    useEffect(() => {
        if (!success) return;
        const t = setTimeout(() => setShowEmergencyKit(true), 3000);
        return () => clearTimeout(t);
    }, [success]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pin.length < 6) { setError('Мінімум 6 символів'); return; }
        if (pin !== confirm) { setError('PIN-коди не збігаються'); return; }
        if (!isReady) { setError('Криптографічний модуль ініціалізується...'); return; }
        if (isReset && !twoFADone) { setError('Потрібне підтвердження 2FA'); return; }

        setLoading(true); setError('');
        try {
            await setupRecovery(pin, { isReset, twoFactorCode: twoFACode || undefined });
            setSuccess(true);
        } catch (e: any) {
            const msg = e.response?.data?.message;
            setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Помилка збереження ключа.'));
            if (isReset && e.response?.status === 401) {
                setTwoFADone(false); setTwoFACode(''); setShow2FA(true);
            }
        } finally {
            setLoading(false);
        }
    };

    const EyeIcon = ({ show }: { show: boolean }) => show
        ? <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        : <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;

    if (show2FA) {
        return (
            <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#06040f] p-4" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                <NoiseOverlay />
                <TwoFactorVerifyModal
                    title="ВЕРИФІКАЦІЯ"
                    subtitle="Введіть код з Google Authenticator для доступу до ключів"
                    onVerify={async (code) => { setTwoFACode(code); setShow2FA(false); setTwoFADone(true); return true; }}
                    onCancel={() => router.push('/chat')}
                />
            </div>
        );
    }

    if (checking2FA) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-[#06040f]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
            </div>
        );
    }

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
                    <span className="text-sm font-semibold tracking-tight" style={{ background: 'linear-gradient(135deg, #e2d9f3 0%, #a78bfa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        VESPER<span style={{ WebkitTextFillColor: 'rgba(139,92,246,0.6)' }}>MSG</span>
                    </span>
                </Link>

                <div className="space-y-8">
                    <div>
                        <div className="text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: 'rgba(139,92,246,0.6)' }}>
                            // security protocol
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-4">
                            {isReset ? 'Відновлення ключів' : 'Захист Сейфа'}
                        </h2>
                        <p className="text-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.7)' }}>
                            {isVerified
                                ? 'Ваш email підтверджено. '
                                : ''}
                            Щоб ваші E2E ключі можна було відновити на іншому пристрої, ми шифруємо їх вашим персональним PIN-кодом перед відправкою на сервер.
                        </p>
                    </div>

                    <div className="space-y-3 text-[10px] font-mono">
                        {[
                            { icon: '⬡', text: 'PIN-код неможливо відновити через техпідтримку' },
                            { icon: '⬡', text: 'Сервер зберігає лише зашифрований блоб даних' },
                            { icon: '⬡', text: 'Втрата PIN-коду = втрата доступу до історії чатів' },
                        ].map((item, i) => (
                            <div key={i} className="flex items-start gap-2.5" style={{ color: 'rgba(148,163,184,0.5)' }}>
                                <span style={{ color: 'rgba(109,40,217,0.6)' }}>{item.icon}</span>
                                {item.text}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="text-[9px] font-mono tracking-widest" style={{ color: 'rgba(109,40,217,0.3)' }}>
                    AES-256-GCM · PBKDF2 DERIVATION
                </div>
            </div>

            {/* ── Right panel (Form / Success) ── */}
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

                        {success ? (
                            /* ── State: Success (Animation) ── */
                            <ClosingLockVisual />
                        ) : (
                            /* ── State: Form ── */
                            <>
                                <div className="px-8 pt-8 pb-5" style={{ borderBottom: '1px solid rgba(109,40,217,0.1)' }}>
                                    <div className="text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'rgba(139,92,246,0.6)' }}>
                                        // recovery vault setup
                                    </div>
                                    <h1 className="text-2xl font-bold" style={{ background: 'linear-gradient(135deg, #f1f5f9 0%, #c4b5fd 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                        Встановіть PIN-код
                                    </h1>
                                </div>

                                <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
                                    {!isReady && (
                                        <div className="flex items-center gap-3 text-xs text-violet-400 animate-pulse bg-violet-900/10 p-3 rounded-lg border border-violet-500/20">
                                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-violet-400" />
                                            Генерація криптографічних ключів...
                                        </div>
                                    )}

                                    {isReady && (
                                        <>
                                            <div>
                                                <CipherInput
                                                    label="Recovery PIN"
                                                    type={showPin ? 'text' : 'password'}
                                                    value={pin}
                                                    onChange={e => { setPin(e.target.value); setError(''); }}
                                                    placeholder="Мінімум 6 символів"
                                                    hint="мін. 6 символів"
                                                    icon={<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>}
                                                    rightSlot={
                                                        <button type="button" onClick={() => setShowPin(s => !s)} className="transition-colors" style={{ color: showPin ? 'rgba(139,92,246,0.8)' : 'rgba(100,116,139,0.4)' }}>
                                                            <EyeIcon show={showPin} />
                                                        </button>
                                                    }
                                                />
                                                <CyberPinStrength pin={pin} />
                                            </div>

                                            <CipherInput
                                                label="Підтвердження PIN"
                                                type={showConf ? 'text' : 'password'}
                                                value={confirm}
                                                onChange={e => { setConfirm(e.target.value); setError(''); }}
                                                placeholder="Повторіть PIN"
                                                icon={<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>}
                                                rightSlot={
                                                    <button type="button" onClick={() => setShowConf(s => !s)} className="transition-colors" style={{ color: showConf ? 'rgba(139,92,246,0.8)' : 'rgba(100,116,139,0.4)' }}>
                                                        <EyeIcon show={showConf} />
                                                    </button>
                                                }
                                            />

                                            {error && (
                                                <div className="flex items-start gap-2.5 rounded-lg px-4 py-3 bg-red-500/10 border border-red-500/20">
                                                    <svg width="13" height="13" fill="none" stroke="rgba(248,113,113,0.8)" strokeWidth="2" viewBox="0 0 24 24" className="shrink-0 mt-0.5">
                                                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                                    </svg>
                                                    <p className="text-[11px] font-mono text-red-400">{error}</p>
                                                </div>
                                            )}

                                            <button type="submit" disabled={loading || pin.length < 6 || confirm !== pin}
                                                    className="w-full relative py-3 mt-4 rounded-xl text-xs font-mono tracking-widest uppercase text-white overflow-hidden group transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                    style={{
                                                        background: 'linear-gradient(135deg, rgba(109,40,217,0.85) 0%, rgba(79,70,229,0.85) 100%)',
                                                        border: '1px solid rgba(139,92,246,0.45)',
                                                        boxShadow: '0 0 30px rgba(109,40,217,0.2)',
                                                    }}>
                                                <span className="relative z-10 flex items-center justify-center gap-2.5">
                                                    {loading ? (
                                                        <>
                                                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                                                            Шифрування...
                                                        </>
                                                    ) : (
                                                        'ENCRYPT_VAULT'
                                                    )}
                                                </span>
                                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(255,255,255,0.05)' }} />
                                            </button>

                                            {!isVerified && !isReset && (
                                                <div className="text-center pt-2">
                                                    <button type="button" onClick={() => router.push('/chat')} className="text-[10px] font-mono text-slate-500 hover:text-slate-300 transition-colors uppercase">
                                                        Пропустити (Небезпечно)
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </form>
                            </>
                        )}
                    </div>
                </div>
            </div>
            {showEmergencyKit && (
                <EmergencyKitModal
                    pin={pin}
                    email={user?.email || 'unknown@ciphermsg.com'}
                    onComplete={() => router.push('/chat')}
                />
            )}
        </div>
    );
}