'use client';

import { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Loader2, X } from 'lucide-react';

interface Props {
    onVerify:  (code: string) => Promise<boolean>;
    onCancel:  () => void;
    title?:    string;
    subtitle?: string;
}

export function TwoFactorVerifyModal({ onVerify, onCancel, title, subtitle }: Props) {
    const [digits,  setDigits]  = useState(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState('');
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => { inputRefs.current[0]?.focus(); }, []);

    const handleDigit = (idx: number, val: string) => {
        const clean = val.replace(/\D/g, '').slice(-1);
        const next = [...digits];
        next[idx] = clean;
        setDigits(next);
        setError('');

        // Auto-advance
        if (clean && idx < 5) inputRefs.current[idx + 1]?.focus();

        // Auto-submit when all filled
        if (clean && idx === 5 && next.every(d => d)) {
            submitCode(next.join(''));
        }
    };

    const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
            const next = [...digits];
            next[idx - 1] = '';
            setDigits(next);
            inputRefs.current[idx - 1]?.focus();
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasted.length === 6) {
            setDigits(pasted.split(''));
            submitCode(pasted);
        }
    };

    const submitCode = async (code: string) => {
        setLoading(true);
        setError('');
        const ok = await onVerify(code);
        if (!ok) {
            setError('Невірний код. Перевірте час на пристрої та спробуйте ще.');
            setDigits(['', '', '', '', '', '']);
            inputRefs.current[0]?.focus();
        }
        setLoading(false);
    };

    const code = digits.join('');

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm
                            border border-slate-100 dark:border-slate-700 overflow-hidden">

                {/* Header */}
                <div className="bg-gradient-to-br from-violet-600 to-indigo-600 px-6 py-7 text-center relative">
                    <button
                        onClick={onCancel}
                        className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20
                                   text-white cursor-pointer transition-all"
                    >
                        <X size={14} />
                    </button>
                    <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                        <ShieldCheck size={26} className="text-white" />
                    </div>
                    <h2 className="text-lg font-bold text-white">
                        {title ?? 'Підтвердження двофакторної аутентифікації'}
                    </h2>
                    <p className="text-indigo-200 text-xs mt-1.5 leading-relaxed">
                        {subtitle ?? 'Введіть 6-значний код з Google Authenticator'}
                    </p>
                </div>

                <div className="p-6">
                    {/* Digit inputs */}
                    <div className="flex gap-2 justify-center mb-5" onPaste={handlePaste}>
                        {digits.map((d, i) => (
                            <input
                                key={i}
                                ref={el => { inputRefs.current[i] = el; }}
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={d}
                                onChange={e => handleDigit(i, e.target.value)}
                                onKeyDown={e => handleKeyDown(i, e)}
                                disabled={loading}
                                className={`w-11 h-14 text-center text-xl font-bold rounded-xl border-2 outline-none
                                    transition-all select-none caret-transparent
                                    dark:bg-slate-700 dark:text-slate-100
                                    ${error
                                    ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
                                    : d
                                        ? 'border-violet-400 bg-violet-50 dark:bg-violet-900/20'
                                        : 'border-slate-200 dark:border-slate-600 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/30'}`}
                            />
                        ))}
                    </div>

                    {error && (
                        <p className="text-xs text-red-500 text-center mb-4 leading-relaxed">{error}</p>
                    )}

                    <button
                        onClick={() => code.length === 6 && submitCode(code)}
                        disabled={loading || code.length !== 6}
                        className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50
                                   disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl
                                   transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                        {loading
                            ? <><Loader2 size={16} className="animate-spin" />Перевірка...</>
                            : <><ShieldCheck size={16} />Підтвердити</>
                        }
                    </button>

                    <p className="text-xs text-slate-400 text-center mt-4 leading-relaxed">
                        Відкрийте Google Authenticator та введіть поточний 6-значний код
                        для облікового запису <span className="font-medium">Messenger</span>
                    </p>
                </div>
            </div>
        </div>
    );
}