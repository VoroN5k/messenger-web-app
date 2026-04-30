'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
    X, QrCode, Smartphone, CheckCircle2,
    AlertCircle, Loader2, Camera, ShieldCheck,
} from 'lucide-react';
import { useDeviceSync, SyncPhase, DeviceSyncState } from '@/src/hooks/useDeviceSync';

interface Props {
    socket: ReturnType<typeof import('socket.io-client').io> | null;
    onClose: () => void;
}

type View = 'choose' | 'source' | 'target';

// ── Phase descriptions ────────────────────────────────────────────────────────

function phaseLabel(phase: SyncPhase, view: View): string {
    if (phase === 'generating')   return 'Підготовка...';
    if (phase === 'waiting_peer') return 'Відскануйте QR на новому пристрої';
    if (phase === 'handshaking')  return 'Встановлення захищеного з\'єднання...';
    if (phase === 'transferring') return view === 'source' ? 'Передача даних...' : 'Отримання даних...';
    if (phase === 'verifying')    return 'Перевірка цілісності...';
    if (phase === 'done')         return 'Синхронізацію завершено';
    if (phase === 'error')        return 'Помилка';
    return '';
}

const ACTIVE_PHASES: SyncPhase[] = [
    'generating', 'waiting_peer', 'handshaking', 'transferring', 'verifying',
];

// ── QR scanner (camera) ───────────────────────────────────────────────────────

interface QrScannerProps {
    onScan: (data: string) => void;
    onError: (msg: string) => void;
}

function QrScanner({ onScan, onError }: QrScannerProps) {
    const videoRef  = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rafRef    = useRef<number>(0);
    const doneRef   = useRef(false);

    useEffect(() => {
        let mounted = true;

        (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: 640, height: 480 },
                });
                if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
                streamRef.current = stream;

                const video = videoRef.current!;
                video.srcObject = stream;
                await video.play();

                const jsQR = (await import('jsqr')).default;
                const canvas = canvasRef.current!;
                const ctx    = canvas.getContext('2d')!;

                const tick = () => {
                    if (!mounted || doneRef.current) return;
                    if (video.readyState === video.HAVE_ENOUGH_DATA) {
                        canvas.width  = video.videoWidth;
                        canvas.height = video.videoHeight;
                        ctx.drawImage(video, 0, 0);
                        const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const code = jsQR(img.data, img.width, img.height);
                        if (code?.data) {
                            doneRef.current = true;
                            onScan(code.data);
                            return;
                        }
                    }
                    rafRef.current = requestAnimationFrame(tick);
                };
                rafRef.current = requestAnimationFrame(tick);
            } catch (e: unknown) {
                if (mounted) {
                    const msg = (e as Error).name === 'NotAllowedError'
                        ? 'Дозвіл на камеру відхилено'
                        : 'Не вдалося отримати доступ до камери';
                    onError(msg);
                }
            }
        })();

        return () => {
            mounted = false;
            cancelAnimationFrame(rafRef.current);
            streamRef.current?.getTracks().forEach(t => t.stop());
        };
    }, [onScan, onError]);

    return (
        <div className="relative w-64 h-64 mx-auto rounded-2xl overflow-hidden bg-black">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />
            {/* Scanning frame overlay */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-6 border-2 border-white/60 rounded-xl" />
                <div className="absolute top-6 left-6 w-5 h-5 border-t-2 border-l-2 border-emerald-400 rounded-tl-lg" />
                <div className="absolute top-6 right-6 w-5 h-5 border-t-2 border-r-2 border-emerald-400 rounded-tr-lg" />
                <div className="absolute bottom-6 left-6 w-5 h-5 border-b-2 border-l-2 border-emerald-400 rounded-bl-lg" />
                <div className="absolute bottom-6 right-6 w-5 h-5 border-b-2 border-r-2 border-emerald-400 rounded-br-lg" />
            </div>
        </div>
    );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ state }: { state: DeviceSyncState }) {
    const isActive = ACTIVE_PHASES.includes(state.phase);
    if (!isActive) return null;

    const showPercent = state.phase === 'transferring' && state.progress > 0;

    return (
        <div className="w-full space-y-1">
            <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                {showPercent ? (
                    <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-200"
                        style={{ width: `${Math.round(state.progress * 100)}%` }}
                    />
                ) : (
                    <div className="h-full bg-emerald-500 rounded-full animate-pulse w-full" />
                )}
            </div>
            {showPercent && (
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                    {state.transferred} / {state.total} записів
                    {' '}({Math.round(state.progress * 100)}%)
                </p>
            )}
        </div>
    );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function DeviceSyncModal({ socket, onClose }: Props) {
    const [view, setView] = useState<View>('choose');
    const { state, startAsSource, startAsTarget, abort } = useDeviceSync(socket);
    const [scanError, setScanError] = useState<string | null>(null);

    const handleClose = useCallback(() => {
        abort();
        onClose();
    }, [abort, onClose]);

    const handleScanResult = useCallback(async (qrData: string) => {
        setScanError(null);
        await startAsTarget(qrData);
    }, [startAsTarget]);

    const handleScanError = useCallback((msg: string) => {
        setScanError(msg);
    }, []);

    // Reset to choose screen if we go idle after an error
    useEffect(() => {
        if (state.phase === 'idle') setView('choose');
    }, [state.phase]);

    const isDone    = state.phase === 'done';
    const isError   = state.phase === 'error';
    const isActive  = ACTIVE_PHASES.includes(state.phase);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 flex flex-col gap-5">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShieldCheck size={18} className="text-emerald-500" />
                        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                            Перенесення на новий пристрій
                        </h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* ── Choose view ── */}
                {view === 'choose' && (
                    <>
                        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                            Оберіть роль цього пристрою. Дані передаються
                            безпосередньо між пристроями — сервер не бачить вміст.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => { setView('source'); startAsSource(); }}
                                className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-all"
                            >
                                <QrCode size={28} className="text-slate-600 dark:text-slate-300" />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Цей пристрій</span>
                                <span className="text-xs text-slate-400 text-center">показати QR код</span>
                            </button>
                            <button
                                onClick={() => setView('target')}
                                className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-all"
                            >
                                <Smartphone size={28} className="text-slate-600 dark:text-slate-300" />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Новий пристрій</span>
                                <span className="text-xs text-slate-400 text-center">відсканувати QR</span>
                            </button>
                        </div>
                    </>
                )}

                {/* ── Source view ── */}
                {view === 'source' && (
                    <>
                        <p className="text-xs text-center text-slate-400 dark:text-slate-500">
                            {phaseLabel(state.phase, 'source')}
                        </p>

                        {/* QR code */}
                        {state.qrDataUrl && state.phase === 'waiting_peer' && (
                            <div className="flex justify-center">
                                <div className="p-3 bg-white rounded-2xl shadow-md border border-slate-100">
                                    <img
                                        src={state.qrDataUrl}
                                        alt="QR код для синхронізації"
                                        className="w-52 h-52"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Spinner while generating or handshaking */}
                        {(state.phase === 'generating' || state.phase === 'handshaking') && (
                            <div className="flex justify-center py-8">
                                <Loader2 size={36} className="animate-spin text-emerald-500" />
                            </div>
                        )}

                        <ProgressBar state={state} />

                        {isDone && (
                            <div className="flex flex-col items-center gap-2 py-4">
                                <CheckCircle2 size={40} className="text-emerald-500" />
                                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                    Передачу завершено успішно
                                </p>
                            </div>
                        )}

                        {isError && (
                            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 rounded-xl">
                                <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                                <p className="text-sm text-red-600 dark:text-red-400">
                                    {state.error}
                                </p>
                            </div>
                        )}

                        {/* Security notice */}
                        {state.phase === 'waiting_peer' && (
                            <p className="text-xs text-slate-400 dark:text-slate-500 text-center leading-relaxed">
                                QR-код дійсний 5 хвилин.
                                Не показуйте його стороннім.
                            </p>
                        )}

                        {(isActive || isError) && !isDone && (
                            <button
                                onClick={() => { abort(); setView('choose'); }}
                                className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                            >
                                Скасувати
                            </button>
                        )}

                        {isDone && (
                            <button
                                onClick={handleClose}
                                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl transition-colors"
                            >
                                Готово
                            </button>
                        )}
                    </>
                )}

                {/* ── Target view ── */}
                {view === 'target' && (
                    <>
                        <p className="text-xs text-center text-slate-400 dark:text-slate-500">
                            {state.phase === 'idle'
                                ? 'Наведіть камеру на QR-код старого пристрою'
                                : phaseLabel(state.phase, 'target')}
                        </p>

                        {/* Camera scanner — only while idle */}
                        {state.phase === 'idle' && (
                            <>
                                <QrScanner onScan={handleScanResult} onError={handleScanError} />
                                {scanError && (
                                    <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl">
                                        <Camera size={14} className="text-amber-500 mt-0.5 shrink-0" />
                                        <p className="text-sm text-amber-600 dark:text-amber-400">{scanError}</p>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Spinner / progress while active */}
                        {(state.phase === 'generating' || state.phase === 'handshaking') && (
                            <div className="flex justify-center py-8">
                                <Loader2 size={36} className="animate-spin text-emerald-500" />
                            </div>
                        )}

                        <ProgressBar state={state} />

                        {isDone && (
                            <div className="flex flex-col items-center gap-2 py-4">
                                <CheckCircle2 size={40} className="text-emerald-500" />
                                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                    Дані отримано та перевірено
                                </p>
                                <p className="text-xs text-slate-400 text-center">
                                    Перезавантажте сторінку, щоб застосувати зміни
                                </p>
                            </div>
                        )}

                        {isError && (
                            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 rounded-xl">
                                <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                                <p className="text-sm text-red-600 dark:text-red-400">
                                    {state.error}
                                </p>
                            </div>
                        )}

                        {(isActive || isError) && !isDone && (
                            <button
                                onClick={() => { abort(); setView('choose'); }}
                                className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                            >
                                Скасувати
                            </button>
                        )}

                        {isDone && (
                            <button
                                onClick={handleClose}
                                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl transition-colors"
                            >
                                Готово
                            </button>
                        )}

                        {state.phase === 'idle' && (
                            <button
                                onClick={() => setView('choose')}
                                className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                            >
                                ← Назад
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
