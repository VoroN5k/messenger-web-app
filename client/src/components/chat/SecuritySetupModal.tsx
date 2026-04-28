'use client';

import { useState } from 'react';
import { ShieldCheck, Eye, EyeOff, Loader2, X } from 'lucide-react';

interface Props {
    onSetup: (pin: string) => Promise<void>;
    onClose: () => void;
}

export function SecuritySetupModal({ onSetup, onClose }: Props) {
    const [pin,        setPin]        = useState('');
    const [confirm,    setConfirm]    = useState('');
    const [showPin,    setShowPin]    = useState(false);
    const [showConf,   setShowConf]   = useState(false);
    const [loading,    setLoading]    = useState(false);
    const [error,      setError]      = useState('');
    const [pinFocused, setPinFocused] = useState(false);
    const [confFocused,setConfFocused]= useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pin.trim() || !confirm.trim()) return;
        if (pin !== confirm) { setError('PINs do not match'); return; }
        if (pin.length < 4)  { setError('PIN must be at least 4 characters'); return; }
        setLoading(true);
        setError('');
        try {
            await onSetup(pin);
            // parent status becomes 'ready' → banner disappears automatically
        } catch {
            setError('Failed to save. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const inputStyle = (focused: boolean, hasError: boolean) => ({
        background:   focused ? 'rgba(124,77,255,0.06)' : 'rgba(255,255,255,0.04)',
        border:       hasError
            ? '1px solid rgba(255,77,106,0.4)'
            : focused
                ? '1px solid var(--border-accent)'
                : '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        color:        'var(--text-1)',
        caretColor:   'var(--accent)',
    });

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-enter"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}
        >
            <div
                className="w-full max-w-[380px] overflow-hidden modal-enter"
                style={{
                    background:   'var(--bg-elevated)',
                    border:       '1px solid var(--border-md)',
                    borderRadius: '20px',
                    boxShadow:    '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,77,255,0.1)',
                }}
            >
                {/* Top accent line */}
                <div
                    className="h-px w-full"
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(124,77,255,0.5), transparent)' }}
                />

                {/* Header */}
                <div className="relative px-7 pt-8 pb-6 text-center">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors duration-150 cursor-pointer disabled:opacity-40"
                        style={{ color: 'var(--text-3)' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}
                    >
                        <X size={16} />
                    </button>

                    <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
                        style={{
                            background: 'var(--accent-dim)',
                            border:     '1px solid var(--border-accent)',
                            boxShadow:  '0 0 24px var(--accent-glow)',
                        }}
                    >
                        <ShieldCheck size={22} style={{ color: 'var(--accent-bright)' }} />
                    </div>

                    <h2 className="text-[16px] font-semibold mb-1.5" style={{ color: 'var(--text-1)' }}>
                        Security Upgrade
                    </h2>
                    <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
                        Vesper now uses end-to-end encryption with forward secrecy.<br />
                        Create a Recovery PIN to protect your identity keys — you&apos;ll need it to access messages on a new device.
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="px-7 pb-7 space-y-4">
                    {/* PIN */}
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
                                placeholder="Choose a PIN…"
                                autoFocus
                                onFocus={() => setPinFocused(true)}
                                onBlur={()  => setPinFocused(false)}
                                className="w-full pr-10 py-3 pl-4 text-[14px] outline-none transition-all duration-200"
                                style={inputStyle(pinFocused, !!error)}
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
                    </div>

                    {/* Confirm PIN */}
                    <div>
                        <label
                            className="block text-[10px] font-semibold uppercase tracking-widest mb-2"
                            style={{ color: 'var(--text-3)' }}
                        >
                            Confirm PIN
                        </label>
                        <div className="relative">
                            <input
                                type={showConf ? 'text' : 'password'}
                                value={confirm}
                                onChange={e => { setConfirm(e.target.value); setError(''); }}
                                placeholder="Repeat your PIN…"
                                onFocus={() => setConfFocused(true)}
                                onBlur={()  => setConfFocused(false)}
                                className="w-full pr-10 py-3 pl-4 text-[14px] outline-none transition-all duration-200"
                                style={inputStyle(confFocused, !!error)}
                            />
                            <button
                                type="button"
                                onClick={() => setShowConf(s => !s)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors duration-150"
                                style={{ color: 'var(--text-3)' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}
                            >
                                {showConf ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                        </div>

                        {error && (
                            <p className="text-[11px] mt-2 leading-relaxed slide-up" style={{ color: 'var(--red)' }}>
                                {error}
                            </p>
                        )}
                    </div>

                    {/* Hint */}
                    <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
                        Use a strong, memorable PIN — there&apos;s no way to recover it if forgotten.
                    </p>

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={loading || !pin.trim() || !confirm.trim()}
                        className="w-full py-3 rounded-xl text-[13px] font-semibold cursor-pointer transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                        style={{
                            background: 'var(--accent)',
                            color:      '#fff',
                            boxShadow:  loading ? 'none' : '0 4px 20px rgba(124,77,255,0.35)',
                        }}
                        onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#9060ff'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent)'; }}
                    >
                        {loading
                            ? <><Loader2 size={15} className="animate-spin" /> Encrypting keys…</>
                            : <><ShieldCheck size={14} /> Set Recovery PIN</>
                        }
                    </button>
                </form>
            </div>
        </div>
    );
}
