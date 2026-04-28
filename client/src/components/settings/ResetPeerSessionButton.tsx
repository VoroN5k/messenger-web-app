'use client';

import { useState } from 'react';
import { RefreshCw, Loader2, X, ShieldAlert } from 'lucide-react';
import { useE2E } from '@/src/hooks/useE2E';
import { clearDrLocks } from '@/src/hooks/useE2E';

interface ResetPeerSessionButtonProps {
    peerId: number;
    peerNickname: string;
}

export function ResetPeerSessionButton({ peerId, peerNickname }: ResetPeerSessionButtonProps) {
    const [showModal, setShowModal] = useState(false);
    const { invalidatePeerSession } = useE2E();

    return (
        <>
            {/* Row — matches the style of other rows in UserProfilePanel */}
            <button
                onClick={() => setShowModal(true)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left group"
            >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                     style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}>
                    <RefreshCw size={14} style={{ color: 'var(--accent-bright)' }} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
                        Скинути E2E сесію
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                        Якщо повідомлення не розшифровуються
                    </p>
                </div>
            </button>

            {showModal && (
                <ResetPeerSessionModal
                    peerId={peerId}
                    peerNickname={peerNickname}
                    invalidatePeerSession={invalidatePeerSession}
                    onClose={() => setShowModal(false)}
                />
            )}
        </>
    );
}

function ResetPeerSessionModal({
                                   peerId,
                                   peerNickname,
                                   invalidatePeerSession,
                                   onClose,
                               }: {
    peerId: number;
    peerNickname: string;
    invalidatePeerSession?: (id: number) => Promise<void>;
    onClose: () => void;
}) {
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    const handleReset = async () => {
        setLoading(true);
        try {
            if (invalidatePeerSession) {
                await invalidatePeerSession(peerId);
            }
            clearDrLocks(); // clear in-memory lock for this pair
        } finally {
            setLoading(false);
            setDone(true);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
                 style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4"
                     style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-base)' }}>
                    <h3 className="font-semibold text-[15px] flex items-center gap-2"
                        style={{ color: 'var(--text-1)' }}>
                        <ShieldAlert size={16} style={{ color: 'var(--accent-bright)' }} />
                        Скидання сесії
                    </h3>
                    <button onClick={onClose}
                            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                            style={{ color: 'var(--text-3)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <X size={16} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {!done ? (
                        <>
                            {/* Info box */}
                            <div className="rounded-xl p-4 space-y-2"
                                 style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}>
                                <p className="text-[12px] font-semibold" style={{ color: 'var(--accent-bright)' }}>
                                    Що відбудеться
                                </p>
                                <ul className="text-[12px] space-y-1.5" style={{ color: 'var(--text-2)' }}>
                                    <li className="flex gap-2">
                                        <span style={{ color: 'var(--accent-bright)' }}>→</span>
                                        Локальна E2E сесія з <strong>{peerNickname}</strong> скинеться
                                    </li>
                                    <li className="flex gap-2">
                                        <span style={{ color: 'var(--accent-bright)' }}>→</span>
                                        Наступне повідомлення автоматично відновить з'єднання
                                    </li>
                                    <li className="flex gap-2">
                                        <span style={{ color: 'var(--accent-bright)' }}>→</span>
                                        PIN не потрібен, старі повідомлення збережено
                                    </li>
                                </ul>
                            </div>

                            <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
                                Попроси <strong style={{ color: 'var(--text-2)' }}>{peerNickname}</strong> також
                                скинути сесію (Налаштування → Безпека → Скинути E2E сесії),
                                після чого надішли перше повідомлення.
                            </p>

                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={onClose}
                                    className="flex-1 py-2.5 rounded-xl text-[14px] transition-colors"
                                    style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
                                >
                                    Скасувати
                                </button>
                                <button
                                    onClick={handleReset}
                                    disabled={loading}
                                    className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold text-white flex justify-center items-center gap-2 transition-colors disabled:opacity-50"
                                    style={{ background: 'var(--accent)' }}
                                >
                                    {loading
                                        ? <Loader2 size={15} className="animate-spin" />
                                        : 'Скинути'}
                                </button>
                            </div>
                        </>
                    ) : (
                        /* Success */
                        <div className="text-center space-y-4 py-2">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                                 style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}>
                                <RefreshCw size={20} style={{ color: 'var(--accent-bright)' }} />
                            </div>
                            <div>
                                <p className="font-semibold text-[15px]" style={{ color: 'var(--text-1)' }}>
                                    Сесію скинуто
                                </p>
                                <p className="text-[12px] mt-1" style={{ color: 'var(--text-3)' }}>
                                    Напиши повідомлення — з'єднання відновиться автоматично.
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-full py-2.5 rounded-xl text-[14px] transition-colors"
                                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
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