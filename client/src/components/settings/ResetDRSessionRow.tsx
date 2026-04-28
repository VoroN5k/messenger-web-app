'use client';

import { useState } from 'react';
import { ShieldAlert, X, Loader2, RefreshCw } from 'lucide-react';
import { clearAllRatchetSessions } from '@/src/lib/cryptoDb';

export function ResetDRSessionRow() {
    const [showModal, setShowModal] = useState(false);
    return (
        <>
            <div
                onClick={() => setShowModal(true)}
                className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group border-t border-slate-100 dark:border-slate-800 cursor-pointer"
            >
                <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        Скинути E2E сесії
                    </p>
                    <p className="text-[13px] text-slate-500 mt-0.5">
                        Якщо повідомлення не розшифровуються — скинь і напиши знову
                    </p>
                </div>
                <RefreshCw
                    size={16}
                    className="text-slate-300 dark:text-slate-600 group-hover:text-violet-500 transition-colors"
                />
            </div>
            {showModal && <ResetDRModal onClose={() => setShowModal(false)} />}
        </>
    );
}

function ResetDRModal({ onClose }: { onClose: () => void }) {
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    const handleReset = async () => {
        setLoading(true);
        try {
            await clearAllRatchetSessions();
        } finally {
            setLoading(false);
            setDone(true);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200/50 dark:border-slate-700/50">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <ShieldAlert size={16} className="text-violet-500" />
                        Скидання E2E сесій
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {!done ? (
                        <>
                            <div className="bg-violet-50 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-900/30 rounded-xl p-4 space-y-2">
                                <p className="text-[13px] font-semibold text-violet-700 dark:text-violet-400">
                                    Що відбудеться
                                </p>
                                <ul className="text-[13px] text-violet-700/80 dark:text-violet-300/70 space-y-1.5">
                                    <li className="flex gap-2">
                                        <span>→</span>
                                        Локальні E2E сесії з усіма контактами скинуться
                                    </li>
                                    <li className="flex gap-2">
                                        <span>→</span>
                                        При наступному повідомленні сесія відновиться автоматично
                                    </li>
                                    <li className="flex gap-2">
                                        <span>→</span>
                                        PIN не потрібен — identity-ключі залишаються незмінними
                                    </li>
                                    <li className="flex gap-2">
                                        <span>→</span>
                                        Старі повідомлення залишаться читабельними (кеш збережено)
                                    </li>
                                </ul>
                            </div>

                            <p className="text-[13px] text-slate-500 dark:text-slate-400">
                                Після скидання — попроси співрозмовника зробити те саме,
                                потім надішли перше повідомлення. З'єднання відновиться.
                            </p>

                            <div className="flex gap-2">
                                <button
                                    onClick={onClose}
                                    className="flex-1 py-2.5 rounded-xl text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[14px] transition-colors"
                                >
                                    Скасувати
                                </button>
                                <button
                                    onClick={handleReset}
                                    disabled={loading}
                                    className="flex-1 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white text-[14px] font-semibold flex justify-center items-center gap-2 transition-colors"
                                >
                                    {loading
                                        ? <Loader2 size={16} className="animate-spin" />
                                        : 'Скинути сесії'}
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="text-center space-y-4 py-2">
                            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
                                <RefreshCw size={20} className="text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div>
                                <p className="font-semibold text-slate-800 dark:text-slate-100">
                                    Сесії скинуто
                                </p>
                                <p className="text-[13px] text-slate-500 mt-1">
                                    Напиши повідомлення — з'єднання відновиться автоматично.
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[14px] transition-colors"
                            >
                                Закрити
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}