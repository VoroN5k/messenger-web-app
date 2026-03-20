// WAV encoder
//function encodeWAV(chunks: Float32Array[], sampleRate: number): Blob {
//    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
//    const buf  = new ArrayBuffer(44 + totalLen * 2);
//    const view = new DataView(buf);
//    const w32  = (o: number, v: number) => view.setUint32(o, v, true);
//    const w16  = (o: number, v: number) => view.setUint16(o, v, true);
//    const str  = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
//
//    str(0, 'RIFF'); w32(4, 36 + totalLen * 2); str(8, 'WAVE');
//    str(12, 'fmt '); w32(16, 16); w16(20, 1); w16(22, 1);   // PCM, mono
//    w32(24, sampleRate); w32(28, sampleRate * 2); w16(32, 2); w16(34, 16);
//    str(36, 'data'); w32(40, totalLen * 2);
//
//    let off = 44;
//    for (const chunk of chunks) {
//        for (let i = 0; i < chunk.length; i++) {
//            const s = Math.max(-1, Math.min(1, chunk[i]));
//            view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
//            off += 2;
//        }
//    }
//    return new Blob([buf], { type: 'audio/wav' });
//}

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Square, Send, X, Loader2 } from 'lucide-react';
import fixWebmDuration from 'fix-webm-duration';

interface Props {
    onSend:   (blob: Blob, waveform: number[], duration: number, mimeType: string) => Promise<void>;
    onCancel: () => void;
}

type Phase = 'starting' | 'recording' | 'preview' | 'sending';

// best format for recording (Opus > WebM > Ogg > MP4)
function getBestMimeType(): string {
    const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
    ];
    return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

export function VoiceRecorder({ onSend, onCancel }: Props) {
    const [phase, setPhase]    = useState<Phase>('starting');
    const [duration, setDuration] = useState(0);
    const [waveform, setWaveform] = useState<number[]>([]);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    // Audio refs
    const streamRef   = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const chunksRef   = useRef<Blob[]>([]);

    // State
    const waveformRef= useRef<number[]>([]);
    const startTimeRef= useRef(0);
    const durRef= useRef(0);
    const timerIdRef= useRef<number | null>(null);
    const waveIdRef= useRef<number | null>(null);
    const blobRef= useRef<Blob | null>(null);
    const audioUrlRef= useRef<string | null>(null);
    const phaseRef= useRef<Phase>('starting');

    // Stable callback refs
    const onCancelRef = useRef(onCancel);
    const onSendRef= useRef(onSend);
    useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);
    useEffect(() => { onSendRef.current = onSend; }, [onSend]);

    const go = (p: Phase) => { phaseRef.current = p; setPhase(p); };

    // Зупиняємо таймери
    const stopIntervals = useCallback(() => {
        if (timerIdRef.current) { clearInterval(timerIdRef.current); timerIdRef.current = null; }
        if (waveIdRef.current)  { clearInterval(waveIdRef.current);  waveIdRef.current  = null; }
    }, []);

    // Звільняємо аудіо-ресурси
    const releaseAudio = useCallback(() => {
        analyserRef.current = null;
        audioCtxRef.current?.close().catch(() => {});
        audioCtxRef.current = null;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
    }, []);

    // Монтування: запускаємо запис
    useEffect(() => {
        let dead = false;

        (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                });
                if (dead) { stream.getTracks().forEach((t) => t.stop()); return; }
                streamRef.current = stream;

                // AudioContext лише для аналізу — не підключаємо до destination
                const AC  = (window as any).AudioContext ?? (window as any).webkitAudioContext;
                const ctx = new AC() as AudioContext;
                audioCtxRef.current = ctx;

                const source   = ctx.createMediaStreamSource(stream);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 256;
                source.connect(analyser); // ← без echo: ctx.destination не задіяний
                analyserRef.current = analyser;

                // MediaRecorder
                const mimeType = getBestMimeType();
                const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
                recorderRef.current = recorder;
                chunksRef.current   = [];

                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunksRef.current.push(e.data);
                };

                recorder.start(100); // timeslice 100 ms = плавна хвиля
                startTimeRef.current = Date.now();
                go('recording');

                // Таймер (wall-clock, без дрейфу)
                timerIdRef.current = window.setInterval(() => {
                    if (dead) return;
                    const d = Math.floor((Date.now() - startTimeRef.current) / 1000);
                    durRef.current = d;
                    setDuration(d);
                }, 250);

                // Семплер форми хвилі
                waveIdRef.current = window.setInterval(() => {
                    if (dead || !analyserRef.current) return;
                    const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
                    analyserRef.current.getByteFrequencyData(buf);
                    const v = Math.max(0.05, buf.reduce((a, b) => a + b, 0) / buf.length / 255);
                    waveformRef.current.push(v);
                    setWaveform([...waveformRef.current]);
                }, 100);

            } catch {
                if (!dead) { alert('Немає доступу до мікрофону'); onCancelRef.current(); }
            }
        })();

        return () => {
            dead = true;
            stopIntervals();
            if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
            recorderRef.current = null;
            releaseAudio();
            if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
        };
    }, []); // ← порожній: справді запускається лише один раз

    // Зупиняємо запис → фіксуємо WebM → preview
    const stopRecording = useCallback(async () => {
        if (phaseRef.current !== 'recording') return;
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === 'inactive') return;

        stopIntervals();

        const dur      = durRef.current || Math.floor((Date.now() - startTimeRef.current) / 1000);
        const wf       = [...waveformRef.current];
        const mimeType = recorder.mimeType || 'audio/webm';

        // Чекаємо останній chunk і onstop
        const rawBlob = await new Promise<Blob>((resolve) => {
            recorder.onstop = () =>
                resolve(new Blob(chunksRef.current, { type: mimeType }));
            recorder.stop();
        });

        recorderRef.current = null;
        releaseAudio();

        if (!chunksRef.current.length) { onCancelRef.current(); return; }

        // fix-webm-duration вписує тривалість у SeekHead WebM-контейнера
        // (для Ogg/MP4 тривалість є "з коробки" — пропускаємо)
        let finalBlob = rawBlob;
        if (mimeType.includes('webm')) {
            try {
                finalBlob = await fixWebmDuration(rawBlob, dur * 1000, { logger: false });
            } catch {
                finalBlob = rawBlob;
            }
        }

        blobRef.current = finalBlob;
        const url = URL.createObjectURL(finalBlob);
        audioUrlRef.current = url;

        setAudioUrl(url);
        setWaveform(wf);
        setDuration(dur);
        go('preview');
    }, [stopIntervals, releaseAudio]);

    // Надіслати
    const handleSend = useCallback(async () => {
        if (!blobRef.current || phaseRef.current !== 'preview') return;
        go('sending');
        const mimeType = blobRef.current.type || 'audio/webm;codecs=opus';
        await onSendRef.current(blobRef.current, waveformRef.current, durRef.current, mimeType);
        if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    }, []);

    // Скасувати
    const handleCancel = useCallback(() => {
        stopIntervals();
        if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
        recorderRef.current = null;
        releaseAudio();
        if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
        onCancelRef.current();
    }, [stopIntervals, releaseAudio]);

    const fmt = (s: number) =>
        `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    // Waveform bars
    const WaveformBars = ({ samples, live }: { samples: number[]; live: boolean }) => {
        const N    = 48;
        const bars: number[] = [];
        if (!samples.length) {
            for (let i = 0; i < N; i++) bars.push(0.05);
        } else if (samples.length <= N) {
            bars.push(...samples.map((v) => Math.max(0.05, v)));
            while (bars.length < N) bars.push(0.05);
        } else {
            const step = samples.length / N;
            for (let i = 0; i < N; i++)
                bars.push(Math.max(0.05, samples[Math.floor(i * step)] ?? 0.05));
        }
        return (
            <div className="flex items-center gap-[2px] h-8">
                {bars.map((v, i) => (
                    <div key={i}
                         className={`w-[3px] rounded-full transition-all duration-75
                            ${live && i >= N - 4 ? 'bg-red-400' : 'bg-violet-400'}`}
                         style={{ height: `${Math.max(3, v * 32)}px` }} />
                ))}
            </div>
        );
    };

    return (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700">
            <button onClick={handleCancel}
                    className="p-2 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 cursor-pointer transition-all shrink-0">
                <X size={17} />
            </button>

            <div className="flex-1 flex items-center gap-3 min-w-0">
                {phase === 'recording' && (
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 w-10">
                            {fmt(duration)}
                        </span>
                    </div>
                )}
                <WaveformBars samples={waveform} live={phase === 'recording'} />
                {phase === 'preview' && audioUrl && (
                    <audio src={audioUrl} controls className="h-8 min-w-0 flex-1" />
                )}
            </div>

            {(phase === 'starting' || phase === 'sending') && (
                <div className="p-2 shrink-0">
                    <Loader2 size={17} className="animate-spin text-violet-400" />
                </div>
            )}
            {phase === 'recording' && (
                <button onClick={stopRecording}
                        className="p-2 rounded-full bg-red-500 hover:bg-red-400 text-white cursor-pointer transition-all active:scale-95 shrink-0">
                    <Square size={15} />
                </button>
            )}
            {phase === 'preview' && (
                <button onClick={handleSend}
                        className="p-2 rounded-full bg-violet-500 hover:bg-violet-600 text-white cursor-pointer transition-all active:scale-95 shrink-0">
                    <Send size={15} />
                </button>
            )}
        </div>
    );
}