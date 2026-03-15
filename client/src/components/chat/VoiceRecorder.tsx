'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Square, Send, X, Loader2 } from 'lucide-react';

interface Props {
    onSend:   (blob: Blob, waveform: number[], duration: number, mimeType: string) => Promise<void>;
    onCancel: () => void;
}

// ── WAV encoder ──────────────────────────────────────────────────────────────
function encodeWAV(chunks: Float32Array[], sampleRate: number): Blob {
    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const buf  = new ArrayBuffer(44 + totalLen * 2);
    const view = new DataView(buf);

    const str = (off: number, s: string) => {
        for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };
    str(0,  'RIFF');
    view.setUint32(4,  36 + totalLen * 2,    true);
    str(8,  'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16,                   true);
    view.setUint16(20, 1,                    true); // PCM
    view.setUint16(22, 1,                    true); // mono
    view.setUint32(24, sampleRate,           true);
    view.setUint32(28, sampleRate * 2,       true); // byteRate
    view.setUint16(32, 2,                    true); // blockAlign
    view.setUint16(34, 16,                   true); // bitsPerSample
    str(36, 'data');
    view.setUint32(40, totalLen * 2,         true);

    let off = 44;
    for (const chunk of chunks) {
        for (let i = 0; i < chunk.length; i++) {
            const s = Math.max(-1, Math.min(1, chunk[i]));
            view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            off += 2;
        }
    }
    return new Blob([buf], { type: 'audio/wav' });
}

export function VoiceRecorder({ onSend, onCancel }: Props) {
    const [phase,    setPhase]    = useState<'idle' | 'recording' | 'preview' | 'sending'>('idle');
    const [duration, setDuration] = useState(0);
    const [waveform, setWaveform] = useState<number[]>([]);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    const analyserRef   = useRef<AnalyserNode | null>(null);
    const processorRef  = useRef<AudioWorkletNode | null>(null);
    const ctxRef        = useRef<AudioContext | null>(null);
    const streamRef     = useRef<MediaStream | null>(null);
    const pcmChunksRef  = useRef<Float32Array[]>([]);
    const waveformRef   = useRef<number[]>([]);
    const sampleRateRef = useRef(44100);
    const blobRef       = useRef<Blob | null>(null);
    const audioUrlRef   = useRef<string | null>(null);
    const durationRef   = useRef(0);
    const timerRef  = useRef<number | null>(null);
    const sampleRef = useRef<number | null>(null);
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

    const stopTimers = () => {
        if (timerRef.current)  clearInterval(timerRef.current);
        if (sampleRef.current) clearInterval(sampleRef.current);
    };

    const doStop = useCallback(() => {
        startedRef.current = false;
        stopTimers();
        if (processorRef.current) {
            processorRef.current.port.onmessage = null;
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        sourceNodeRef.current?.disconnect();
        sourceNodeRef.current = null;
        analyserRef.current = null;
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        ctxRef.current?.close().catch(() => {});
        ctxRef.current = null;
    }, []);

    // VoiceRecorder.tsx — замінити тільки startRecording функцію

    // Додати ref поруч з іншими:
    const startedRef = useRef(false);

    const startRecording = useCallback(async () => {
        // StrictMode guard — не запускати двічі
        if (startedRef.current) return;
        startedRef.current = true;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const AC  = window.AudioContext ?? (window as any).webkitAudioContext;
            const ctx = new AC() as AudioContext;
            ctxRef.current        = ctx;
            sampleRateRef.current = ctx.sampleRate;

            const workletCode = `
            class PCMCapture extends AudioWorkletProcessor {
                process(inputs) {
                    const ch = inputs[0]?.[0];
                    if (ch?.length) this.port.postMessage(ch.slice());
                    return true;
                }
            }
            registerProcessor('pcm-capture', PCMCapture);
        `;
            const blob    = new Blob([workletCode], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            await ctx.audioWorklet.addModule(blobUrl);
            URL.revokeObjectURL(blobUrl);

            const source   = ctx.createMediaStreamSource(stream);
            sourceNodeRef.current = source;

            // Analyser — тільки для waveform візуалізації, не впливає на запис
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyserRef.current = analyser;

            // numberOfOutputs: 0 — worklet без виходу, не потребує connect до destination
            // Повністю усуває feedback і тріск
            const worklet = new AudioWorkletNode(ctx, 'pcm-capture', {
                numberOfInputs:  1,
                numberOfOutputs: 0,
            });
            source.connect(worklet);
            processorRef.current = worklet;

            pcmChunksRef.current = [];
            waveformRef.current  = [];
            durationRef.current  = 0;

            worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
                pcmChunksRef.current.push(new Float32Array(e.data));
            };

            setPhase('recording');

            sampleRef.current = window.setInterval(() => {
                if (!analyserRef.current) return;
                const data = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(data);
                const avg = Array.from(data).reduce((a, b) => a + b, 0) / data.length / 255;
                waveformRef.current.push(Math.max(0.05, avg));
                setWaveform([...waveformRef.current]);
            }, 100);

            durationRef.current = 0;
            setDuration(0);
            timerRef.current = window.setInterval(() => {
                durationRef.current += 1;
                setDuration(durationRef.current);
            }, 1000);

        } catch {
            startedRef.current = false;
            alert('Немає доступу до мікрофону');
            onCancel();
        }
    }, [onCancel]);

    const stopRecording = useCallback(() => {
        doStop();

        // Encode all PCM chunks → WAV
        const wav = encodeWAV(pcmChunksRef.current, sampleRateRef.current);
        blobRef.current = wav;
        const url = URL.createObjectURL(wav);
        audioUrlRef.current = url;
        setAudioUrl(url);
        setWaveform([...waveformRef.current]);
        setPhase('preview');
    }, [doStop]);

    const handleSend = useCallback(async () => {
        if (!blobRef.current) return;
        setPhase('sending');
        await onSend(blobRef.current, waveformRef.current, durationRef.current, 'audio/wav');
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    }, [onSend]);

    const handleCancel = useCallback(() => {
        doStop();
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        onCancel();
    }, [doStop, onCancel]);

    useEffect(() => {
        startRecording();
        return () => {
            stopTimers();
            processorRef.current?.disconnect();
            streamRef.current?.getTracks().forEach(t => t.stop());
            ctxRef.current?.close().catch(() => {});
        };
    }, [startRecording]);

    const fmt = (s: number) =>
        `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

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
            <button onClick={handleCancel}
                    className="p-2 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 cursor-pointer transition-all shrink-0">
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