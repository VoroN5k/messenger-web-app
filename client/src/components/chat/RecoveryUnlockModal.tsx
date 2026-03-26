'use client';

import { useState } from 'react';
import { KeyRound, Eye, EyeOff, Loader2 } from 'lucide-react';

interface Props {
    onUnlock: (pin: string) => Promise<boolean>;
}

export function RecoveryUnlockModal({ onUnlock }: Props) {
    const [pin,      setPin]      = useState('');
    const [showPin,  setShowPin]  = useState(false);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');
    const [attempts, setAttempts] = useState(0);
    const [focused,  setFocused]  = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pin.trim()) return;
        setLoading(true);
        setError('');
        const ok = await onUnlock(pin.trim());
        if (!ok) {
            setAttempts(a => a + 1);
            setError(
                attempts >= 2
                    ? 'Wrong PIN. If forgotten, you can set a new encryption key in Settings.'
                    : 'Incorrect PIN. Please try again.',
            );
            setPin('');
        }
        setLoading(false);
    };

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-enter"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}
        >
            <div
                className="w-full max-w-[360px] overflow-hidden modal-enter"
                style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-md)',
                    borderRadius: '20px',
                    boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,77,255,0.1)',
                }}
            >
                {/* Top accent line */}
                <div
                    className="h-px w-full"
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(124,77,255,0.5), transparent)' }}
                />

                {/* Header */}
                <div className="px-7 pt-8 pb-6 text-center">
                    <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
                        style={{
                            background: 'var(--accent-dim)',
                            border: '1px solid var(--border-accent)',
                            boxShadow: '0 0 24px var(--accent-glow)',
                        }}
                    >
                        <KeyRound size={22} style={{ color: 'var(--accent-bright)' }} />
                    </div>
                    <h2
                        className="text-[16px] font-semibold mb-1.5"
                        style={{ color: 'var(--text-1)' }}
                    >
                        Unlock Messages
                    </h2>
                    <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
                        Enter your Recovery PIN to decrypt your conversation history
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="px-7 pb-7 space-y-4">
                    {/* PIN input */}
                    <div>
                        <label
                            className="block text-[10px] font-semibold uppercase tracking-widest mb-2"
                            style={{ color: 'var(--text-3)' }}
                        >
                            Recovery PIN
                        </label>
                        <div className="relative">
                            <input
                                type={showPin ? 'text' : 'password'}
                                value={pin}
                                onChange={e => { setPin(e.target.value); setError(''); }}
                                placeholder="Enter your PIN…"
                                autoFocus
                                onFocus={() => setFocused(true)}
                                onBlur={() => setFocused(false)}
                                className="w-full pr-10 py-3 pl-4 text-[14px] outline-none transition-all duration-200"
                                style={{
                                    background: focused ? 'rgba(124,77,255,0.06)' : 'rgba(255,255,255,0.04)',
                                    border: error
                                        ? '1px solid rgba(255,77,106,0.4)'
                                        : focused
                                            ? '1px solid var(--border-accent)'
                                            : '1px solid var(--border)',
                                    borderRadius: 'var(--radius-md)',
                                    color: 'var(--text-1)',
                                    caretColor: 'var(--accent)',
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPin(s => !s)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors duration-150"
                                style={{ color: 'var(--text-3)' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}
                            >
                                {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                        </div>

                        {/* Error */}
                        {error && (
                            <p
                                className="text-[11px] mt-2 leading-relaxed slide-up"
                                style={{ color: 'var(--red)' }}
                            >
                                {error}
                            </p>
                        )}
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={loading || !pin.trim()}
                        className="w-full py-3 rounded-xl text-[13px] font-semibold cursor-pointer transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                        style={{
                            background: 'var(--accent)',
                            color: '#fff',
                            boxShadow: loading ? 'none' : '0 4px 20px rgba(124,77,255,0.35)',
                        }}
                        onMouseEnter={e => {
                            if (!loading) (e.currentTarget as HTMLElement).style.background = '#9060ff';
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.background = 'var(--accent)';
                        }}
                    >
                        {loading
                            ? <><Loader2 size={15} className="animate-spin" /> Decrypting…</>
                            : <><KeyRound size={14} /> Unlock</>
                        }
                    </button>

                    {/* Forgot link */}
                    <p
                        className="text-center text-[11px] pt-1"
                        style={{ color: 'var(--text-3)' }}
                    >
                        Forgot PIN?{' '}
                        <a
                            href="/auth/setup-recovery?reset=true"
                            className="transition-colors duration-150"
                            style={{ color: 'var(--accent-bright)' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#b89fff'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--accent-bright)'}
                        >
                            Set new key
                        </a>
                        {' '}(old messages will be inaccessible)
                    </p>
                </form>
            </div>
        </div>
    );
}