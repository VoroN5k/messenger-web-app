'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Square, Send, X, Loader2 } from 'lucide-react';

interface Props {
    onSend:   (blob: Blob, waveform: number[], duration: number, mimeType: string) => Promise<void>;
    onCancel: () => void;
}

// ── WAV encoder ───────────────────────────────────────────────────────────────
function encodeWAV(chunks: Float32Array[], sampleRate: number): Blob {
    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const buf  = new ArrayBuffer(44 + totalLen * 2);
    const view = new DataView(buf);
    const w32  = (o: number, v: number) => view.setUint32(o, v, true);
    const w16  = (o: number, v: number) => view.setUint16(o, v, true);
    const str  = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };

    str(0, 'RIFF'); w32(4, 36 + totalLen * 2); str(8, 'WAVE');
    str(12, 'fmt '); w32(16, 16); w16(20, 1); w16(22, 1);   // PCM, mono
    w32(24, sampleRate); w32(28, sampleRate * 2); w16(32, 2); w16(34, 16);
    str(36, 'data'); w32(40, totalLen * 2);

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

// ── AudioWorklet source ───────────────────────────────────────────────────────
// Buffers 4 096 samples before sending (~85 ms at 48 kHz).
// This cuts postMessage calls from ~375/s down to ~12/s and eliminates
// the queue-overflow crackling of the original 128-sample approach.
// Supports a 'flush' command to capture the final partial buffer on stop.
const WORKLET_SRC = `
class PCMCapture extends AudioWorkletProcessor {
    constructor() {
        super();
        this._buf = new Float32Array(4096);
        this._pos = 0;
        this.port.onmessage = ({ data }) => {
            if (data === 'flush') {
                // Send whatever is left and signal completion
                this.port.postMessage({
                    samples: this._buf.slice(0, this._pos),
                    flushed: true,
                });
                this._pos = 0;
            }
        };
    }
    process(inputs) {
        const ch = inputs[0]?.[0];
        if (!ch) return true;
        for (let i = 0; i < ch.length; i++) {
            this._buf[this._pos++] = ch[i];
            if (this._pos >= this._buf.length) {
                this.port.postMessage({ samples: this._buf.slice() });
                this._pos = 0;
            }
        }
        return true;
    }
}
registerProcessor('pcm-capture', PCMCapture);
`;

type Phase = 'starting' | 'recording' | 'preview' | 'sending';

export function VoiceRecorder({ onSend, onCancel }: Props) {
    const [phase,    setPhase]    = useState<Phase>('starting');
    const [duration, setDuration] = useState(0);
    const [waveform, setWaveform] = useState<number[]>([]);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    // ── Audio refs ────────────────────────────────────────────────────────────
    const ctxRef         = useRef<AudioContext | null>(null);
    const streamRef      = useRef<MediaStream | null>(null);
    const sourceRef      = useRef<MediaStreamAudioSourceNode | null>(null);
    const analyserRef    = useRef<AnalyserNode | null>(null);
    const processorRef   = useRef<AudioWorkletNode | null>(null);
    const pcmChunksRef   = useRef<Float32Array[]>([]);
    const waveformRef    = useRef<number[]>([]);
    const sampleRateRef  = useRef(44100);

    // ── Timer refs ────────────────────────────────────────────────────────────
    // Use wall-clock difference — no drift, immune to throttling.
    const startTimeRef  = useRef(0);
    const durRef        = useRef(0);  // last computed duration (for handleSend closure)
    const timerIdRef    = useRef<number | null>(null);
    const waveIdRef     = useRef<number | null>(null);

    // ── Other refs ────────────────────────────────────────────────────────────
    const blobRef       = useRef<Blob | null>(null);
    const audioUrlRef   = useRef<string | null>(null);
    const phaseRef      = useRef<Phase>('starting');

    // Keep callback refs so the single-mount effect never needs them as deps
    const onCancelRef   = useRef(onCancel);
    const onSendRef     = useRef(onSend);
    useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);
    useEffect(() => { onSendRef.current   = onSend;   }, [onSend]);

    const go = (p: Phase) => { phaseRef.current = p; setPhase(p); };

    // ── Tear down all audio resources ─────────────────────────────────────────
    const teardown = useCallback(() => {
        if (timerIdRef.current) { clearInterval(timerIdRef.current); timerIdRef.current = null; }
        if (waveIdRef.current)  { clearInterval(waveIdRef.current);  waveIdRef.current  = null; }

        if (processorRef.current) {
            processorRef.current.port.onmessage = null;
            try { processorRef.current.disconnect(); } catch {}
            processorRef.current = null;
        }
        sourceRef.current?.disconnect();   sourceRef.current  = null;
        analyserRef.current = null;
        streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
        ctxRef.current?.close().catch(() => {}); ctxRef.current = null;
    }, []);

    // ── Single-mount effect — starts recording exactly once ───────────────────
    // Previously this was useEffect([startRecording]) where startRecording was a
    // useCallback with [onCancel] dep → any parent re-render recreated the
    // callback → effect re-ran → recording restarted or doubled up.
    useEffect(() => {
        let dead = false;

        (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                });
                if (dead) { stream.getTracks().forEach(t => t.stop()); return; }
                streamRef.current = stream;

                const AC  = (window as any).AudioContext ?? (window as any).webkitAudioContext;
                const ctx = new AC() as AudioContext;
                if (dead) { ctx.close(); stream.getTracks().forEach(t => t.stop()); return; }
                ctxRef.current        = ctx;
                sampleRateRef.current = ctx.sampleRate;

                // Load worklet from inline blob URL
                const wBlob = new Blob([WORKLET_SRC], { type: 'application/javascript' });
                const wUrl  = URL.createObjectURL(wBlob);
                await ctx.audioWorklet.addModule(wUrl);
                URL.revokeObjectURL(wUrl);
                if (dead) { teardown(); return; }

                const source   = ctx.createMediaStreamSource(stream);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 256;
                const worklet  = new AudioWorkletNode(ctx, 'pcm-capture', {
                    numberOfInputs: 1, numberOfOutputs: 0,
                });

                source.connect(analyser);
                source.connect(worklet);
                sourceRef.current    = source;
                analyserRef.current  = analyser;
                processorRef.current = worklet;
                pcmChunksRef.current = [];
                waveformRef.current  = [];

                worklet.port.onmessage = ({ data }: MessageEvent<{ samples: Float32Array; flushed?: boolean }>) => {
                    if (dead) return;
                    if (data.samples?.length) pcmChunksRef.current.push(data.samples);
                };

                // ── Accurate timer (wall-clock diff, 4× per second) ───────────
                startTimeRef.current = Date.now();
                go('recording');

                timerIdRef.current = window.setInterval(() => {
                    if (dead) return;
                    const d = Math.floor((Date.now() - startTimeRef.current) / 1000);
                    durRef.current = d;
                    setDuration(d);
                }, 250);

                // ── Waveform sampling ──────────────────────────────────────────
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
            teardown();
            if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
        };
    }, []); // ← empty: truly runs once per mount

    // ── Stop recording → flush worklet → build WAV → preview ─────────────────
    const stopRecording = useCallback(async () => {
        if (phaseRef.current !== 'recording') return;

        // Ask the worklet to flush its internal ring-buffer before we stop.
        // Without this, up to ~85 ms of audio at the end would be silently dropped.
        const proc = processorRef.current;
        if (proc) {
            await new Promise<void>(resolve => {
                const tid = setTimeout(resolve, 400); // safety fallback
                proc.port.onmessage = (e: MessageEvent<{ samples: Float32Array; flushed?: boolean }>) => {
                    if (e.data.samples?.length) pcmChunksRef.current.push(e.data.samples);
                    if (e.data.flushed) {
                        clearTimeout(tid);
                        proc.port.onmessage = null; // stop receiving after flush
                        resolve();
                    }
                };
                proc.port.postMessage('flush');
            });
        }

        const chunks = [...pcmChunksRef.current];
        const wf     = [...waveformRef.current];
        const dur    = durRef.current || Math.floor((Date.now() - startTimeRef.current) / 1000);
        teardown();

        if (!chunks.length) { onCancelRef.current(); return; }

        const wav = encodeWAV(chunks, sampleRateRef.current);
        blobRef.current = wav;
        const url = URL.createObjectURL(wav);
        audioUrlRef.current = url;

        setAudioUrl(url);
        setWaveform(wf);
        setDuration(dur);
        go('preview');
    }, [teardown]);

    const handleSend = useCallback(async () => {
        if (!blobRef.current || phaseRef.current !== 'preview') return;
        go('sending');
        await onSendRef.current(blobRef.current, waveformRef.current, durRef.current, 'audio/wav');
        if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    }, []);

    const handleCancel = useCallback(() => {
        teardown();
        if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
        onCancelRef.current();
    }, [teardown]);

    const fmt = (s: number) =>
        `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    // ── Waveform bars ─────────────────────────────────────────────────────────
    const WaveformBars = ({ samples, live }: { samples: number[]; live: boolean }) => {
        const N = 48;
        const bars: number[] = [];
        if (!samples.length) {
            for (let i = 0; i < N; i++) bars.push(0.05);
        } else if (samples.length <= N) {
            bars.push(...samples.map(v => Math.max(0.05, v)));
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