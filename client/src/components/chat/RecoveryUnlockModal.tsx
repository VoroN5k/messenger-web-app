'use client';

import { useState } from 'react';
import { KeyRound, Eye, EyeOff, Loader2, ShieldAlert, RefreshCw } from 'lucide-react';

interface Props {
    onUnlock: (pin: string) => Promise<boolean>;
}

export function RecoveryUnlockModal({ onUnlock }: Props) {
    const [pin,      setPin]      = useState('');
    const [showPin,  setShowPin]  = useState(false);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');
    const [attempts, setAttempts] = useState(0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pin.trim()) return;
        setLoading(true);
        setError('');

        const ok = await onUnlock(pin.trim());

        if (ok) {
            // Modal will unmount when status changes to 'ready'
        } else {
            setAttempts(a => a + 1);
            setError(
                attempts >= 2
                    ? 'Невірний PIN. Якщо ви забули PIN — вам доведеться встановити новий ключ шифрування у налаштуваннях.'
                    : 'Невірний PIN. Спробуйте ще раз.',
            );
            setPin('');
        }
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-100 dark:border-slate-700 overflow-hidden">

                {/* Header */}
                <div className="bg-gradient-to-br from-violet-500 to-indigo-600 px-6 py-8 text-center">
                    <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
                        <KeyRound size={28} className="text-white" />
                    </div>
                    <h2 className="text-xl font-bold text-white">Розблокування повідомлень</h2>
                    <p className="text-indigo-200 text-sm mt-1">
                        Введіть Recovery PIN щоб розшифрувати переписку
                    </p>
                </div>

                <div className="p-6">
                    {/* Info */}
                    <div className="flex gap-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900/40 rounded-xl p-3.5 mb-5">
                        <ShieldAlert size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-indigo-700 dark:text-indigo-300 leading-relaxed">
                            Ваші повідомлення зашифровані наскрізно. PIN-код зберігається тільки у вас —
                            ніхто інший не може прочитати ваші чати.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                Recovery PIN
                            </label>
                            <div className="relative">
                                <input
                                    type={showPin ? 'text' : 'password'}
                                    value={pin}
                                    onChange={e => { setPin(e.target.value); setError(''); }}
                                    placeholder="Введіть ваш PIN-код"
                                    autoFocus
                                    className={`w-full px-4 py-3 pr-10 rounded-xl border text-sm outline-none transition-all
                                        dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-500
                                        ${error
                                        ? 'border-red-400 focus:ring-2 focus:ring-red-100 dark:focus:ring-red-900/30'
                                        : 'border-slate-200 dark:border-slate-600 focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-900/30'}`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPin(s => !s)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                >
                                    {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                            {error && (
                                <p className="text-xs text-red-500 mt-1.5 leading-relaxed">{error}</p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !pin.trim()}
                            className="w-full bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed
                                       text-white font-semibold py-3 rounded-xl transition-all
                                       flex items-center justify-center gap-2 cursor-pointer"
                        >
                            {loading
                                ? <><Loader2 size={16} className="animate-spin" />Розшифровуємо...</>
                                : <><KeyRound size={16} />Розблокувати</>
                            }
                        </button>
                    </form>

                    {/* Forgot PIN */}
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                        <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
                            Забули PIN?{' '}
                            <a
                            href="/auth/setup-recovery?reset=true"
                            className="text-violet-500 hover:underline font-medium"
                            >
                            Встановити новий ключ
                        </a>
                        {' '}(старі повідомлення будуть недоступні)
                    </p>
                    </div>
                </div>
            </div>
        </div>
);
}
