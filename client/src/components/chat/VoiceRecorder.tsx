'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Send, X, Loader2 } from 'lucide-react';

interface Props {
    onSend: (blob: Blob, waveform: number[], duration: number, mimeType: string) => Promise<void>;
    onCancel: () => void;
}

// Визначаємо найкращий підтримуваний формат один раз
function getBestMimeType(): string {
    const candidates = [
        'audio/ogg;codecs=opus',   // Firefox native, Chrome підтримує
        'audio/webm;codecs=opus',  // Chrome native
        'audio/webm',
        'audio/ogg',
    ];
    return candidates.find(t => {
        try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
    }) ?? '';
}

const BEST_MIME = getBestMimeType();

export function VoiceRecorder({ onSend, onCancel }: Props) {
    const [phase,    setPhase]    = useState<'idle' | 'recording' | 'preview' | 'sending'>('idle');
    const [duration, setDuration] = useState(0);
    const [waveform, setWaveform] = useState<number[]>([]);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [mimeType, setMimeType] = useState('');

    const mediaRecRef  = useRef<MediaRecorder | null>(null);
    const analyserRef  = useRef<AnalyserNode | null>(null);
    const chunksRef    = useRef<Blob[]>([]);
    const waveformRef  = useRef<number[]>([]);
    const sampleIntRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timerIntRef  = useRef<ReturnType<typeof setInterval> | null>(null);
    const durationRef  = useRef(0);
    const blobRef      = useRef<Blob | null>(null);
    const actualMime   = useRef('');

    const stopTimers = () => {
        if (sampleIntRef.current) clearInterval(sampleIntRef.current);
        if (timerIntRef.current)  clearInterval(timerIntRef.current);
    };

    const startRecording = useCallback(async () => {
        try {
            const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
            const AC       = window.AudioContext ?? (window as any).webkitAudioContext;
            const ctx      = new AC() as AudioContext;
            const source   = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyserRef.current = analyser;

            const options = BEST_MIME ? { mimeType: BEST_MIME } : {};
            const mr = new MediaRecorder(stream, options);
            mediaRecRef.current = mr;
            chunksRef.current   = [];
            waveformRef.current = [];
            durationRef.current = 0;

            // Зберігаємо фактичний MIME тип після створення
            actualMime.current = mr.mimeType || BEST_MIME || 'audio/webm';

            mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            mr.onstop = () => {
                const mime = actualMime.current;
                const blob = new Blob(chunksRef.current, { type: mime });
                blobRef.current = blob;
                const url = URL.createObjectURL(blob);
                setAudioUrl(url);
                setMimeType(mime);
                setWaveform([...waveformRef.current]);
                setPhase('preview');
                stream.getTracks().forEach(t => t.stop());
                ctx.close();
            };

            mr.start(100);
            setPhase('recording');

            sampleIntRef.current = setInterval(() => {
                if (!analyserRef.current) return;
                const data = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(data);
                const avg = Array.from(data).reduce((a, b) => a + b, 0) / data.length / 255;
                waveformRef.current.push(Math.max(0.05, avg));
                setWaveform([...waveformRef.current]);
            }, 100);

            timerIntRef.current = setInterval(() => {
                durationRef.current += 1;
                setDuration(durationRef.current);
            }, 1000);

        } catch {
            alert('Немає доступу до мікрофону');
            onCancel();
        }
    }, [onCancel]);

    const stopRecording = useCallback(() => {
        stopTimers();
        mediaRecRef.current?.stop();
    }, []);

    const handleSend = useCallback(async () => {
        if (!blobRef.current) return;
        setPhase('sending');
        await onSend(blobRef.current, waveformRef.current, durationRef.current, actualMime.current);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
    }, [onSend, audioUrl]);

    const handleCancel = useCallback(() => {
        stopTimers();
        mediaRecRef.current?.stop();
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        onCancel();
    }, [onCancel, audioUrl]);

    useEffect(() => {
        startRecording();
        return () => { stopTimers(); };
    }, [startRecording]);

    const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    const WaveformBars = ({ samples, isLive }: { samples: number[]; isLive: boolean }) => {
        const barCount = 48;
        const bars: number[] = [];
        if (samples.length === 0) {
            for (let i = 0; i < barCount; i++) bars.push(0.05);
        } else if (samples.length <= barCount) {
            bars.push(...samples.map(v => Math.max(0.05, v)));
            while (bars.length < barCount) bars.push(0.05);
        } else {
            const step = samples.length / barCount;
            for (let i = 0; i < barCount; i++) bars.push(Math.max(0.05, samples[Math.floor(i * step)]));
        }
        return (
            <div className="flex items-center gap-[2px] h-8">
                {bars.map((v, i) => (
                    <div key={i}
                         className={`w-[3px] rounded-full transition-all duration-75
                            ${isLive && i >= bars.length - 4 ? 'bg-red-400' : 'bg-violet-400'}`}
                         style={{ height: `${Math.max(3, v * 32)}px` }} />
                ))}
            </div>
        );
    };

    return (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700">
            <button onClick={handleCancel} className="p-2 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 cursor-pointer transition-all shrink-0">
                <X size={17} />
            </button>
            <div className="flex-1 flex items-center gap-3">
                {phase === 'recording' && (
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 w-10">{fmt(duration)}</span>
                    </div>
                )}
                <WaveformBars samples={waveform} isLive={phase === 'recording'} />
                {phase === 'preview' && audioUrl && (
                    <audio src={audioUrl} controls className="h-8 flex-shrink-1" style={{ minWidth: 0 }} />
                )}
            </div>
            {phase === 'recording' ? (
                <button onClick={stopRecording}
                        className="p-2 rounded-full bg-red-500 hover:bg-red-400 text-white cursor-pointer transition-all shrink-0">
                    <Square size={15} />
                </button>
            ) : phase === 'preview' ? (
                <button onClick={handleSend}
                        className="p-2 rounded-full bg-violet-500 hover:bg-violet-600 text-white cursor-pointer transition-all shrink-0">
                    <Send size={15} />
                </button>
            ) : (
                <div className="p-2 shrink-0">
                    <Loader2 size={17} className="animate-spin text-violet-400" />
                </div>
            )}
        </div>
    );
}