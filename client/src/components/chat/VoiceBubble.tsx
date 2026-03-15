'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Loader2 } from 'lucide-react';

interface Props {
    fileUrl:  string;
    metadata: string | null | undefined;
    isMe:     boolean;
}

// Web Audio API плеєр — працює для ogg/opus скрізь, webm/opus в Chrome
async function tryWebAudio(ab: ArrayBuffer): Promise<AudioBuffer> {
    const AC  = window.AudioContext ?? (window as any).webkitAudioContext;
    const ctx = new AC() as AudioContext;
    try {
        const buf = await ctx.decodeAudioData(ab.slice(0));
        await ctx.close();
        return buf;
    } catch {
        await ctx.close();
        throw new Error('decodeAudioData failed');
    }
}

// HTMLAudioElement fallback — для старих webm файлів у Chrome
function tryHTMLAudio(blobUrl: string, mimeHint: string): Promise<HTMLAudioElement> {
    return new Promise((resolve, reject) => {
        const audio = new Audio();
        let done = false;
        const finish = (ok: boolean) => {
            if (done) return;
            done = true;
            clearTimeout(tid);
            audio.oncanplay = audio.oncanplaythrough = audio.onerror = null;
            ok ? resolve(audio) : reject(new Error('HTMLAudio failed'));
        };
        audio.oncanplay      = () => finish(true);
        audio.oncanplaythrough = () => finish(true);
        audio.onerror        = () => finish(false);
        const tid = setTimeout(() => finish(false), 8000);
        audio.preload = 'auto';
        audio.src = blobUrl;
        audio.load();
    });
}

export function VoiceBubble({ fileUrl, metadata, isMe }: Props) {
    const [playing,  setPlaying]  = useState(false);
    const [progress, setProgress] = useState(0);
    const [status,   setStatus]   = useState<'loading' | 'ready' | 'error'>('loading');

    // Режим відтворення: 'webaudio' або 'htmlaudio'
    const modeRef         = useRef<'webaudio' | 'htmlaudio' | null>(null);
    // Web Audio
    const ctxRef          = useRef<AudioContext | null>(null);
    const bufferRef       = useRef<AudioBuffer | null>(null);
    const sourceRef       = useRef<AudioBufferSourceNode | null>(null);
    const startCtxTimeRef = useRef(0);
    const offsetRef       = useRef(0);
    const rafRef          = useRef<number | null>(null);
    const playingRef      = useRef(false);
    // HTML Audio
    const audioRef        = useRef<HTMLAudioElement | null>(null);
    const blobUrlRef      = useRef<string | null>(null);

    const loadIdRef = useRef(0);

    const parsed         = metadata ? (() => { try { return JSON.parse(metadata); } catch { return null; } })() : null;
    const waveform: number[] = parsed?.waveform ?? [];
    const storedDuration: number = parsed?.duration ?? 0;
    const storedMime: string     = parsed?.mimeType ?? 'audio/webm';

    // ── RAF tick ─────────────────────────────────────────────────────────────
    const tick = useCallback(() => {
        const ctx = ctxRef.current;
        const buf = bufferRef.current;
        if (!ctx || !buf || !playingRef.current) return;
        const pos = Math.min(offsetRef.current + (ctx.currentTime - startCtxTimeRef.current), buf.duration);
        setProgress(pos / buf.duration);
        if (pos < buf.duration) rafRef.current = requestAnimationFrame(tick);
    }, []);

    const stopRaf = useCallback(() => {
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    }, []);

    const stopWebAudioSource = useCallback(() => {
        stopRaf();
        if (sourceRef.current) {
            try { sourceRef.current.stop(); } catch {}
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }
        playingRef.current = false;
    }, [stopRaf]);

    // ── Завантаження ─────────────────────────────────────────────────────────
    useEffect(() => {
        const myId = ++loadIdRef.current;

        setStatus('loading');
        setPlaying(false);
        setProgress(0);
        offsetRef.current  = 0;
        playingRef.current = false;
        modeRef.current    = null;

        const load = async () => {
            try {
                const res = await fetch(fileUrl);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const rawBlob = await res.blob();
                if (myId !== loadIdRef.current) return;

                const ab = await rawBlob.arrayBuffer();
                if (myId !== loadIdRef.current) return;

                // ── Спроба 1: Web Audio API ───────────────────────────────
                try {
                    const audioBuffer = await tryWebAudio(ab);
                    if (myId !== loadIdRef.current) return;

                    const AC  = window.AudioContext ?? (window as any).webkitAudioContext;
                    ctxRef.current    = new AC() as AudioContext;
                    bufferRef.current = audioBuffer;
                    modeRef.current   = 'webaudio';
                    setStatus('ready');
                    return;
                } catch (e) {
                    console.warn('[VoiceBubble] WebAudio failed, trying HTMLAudio:', e);
                }

                if (myId !== loadIdRef.current) return;

                // ── Спроба 2: HTMLAudioElement (Chrome webm старі файли) ──
                const mime    = storedMime || rawBlob.type || 'audio/webm';
                const blob    = new Blob([ab], { type: mime });
                const blobUrl = URL.createObjectURL(blob);
                blobUrlRef.current = blobUrl;

                try {
                    const audio = await tryHTMLAudio(blobUrl, mime);
                    if (myId !== loadIdRef.current) {
                        audio.src = '';
                        URL.revokeObjectURL(blobUrl);
                        blobUrlRef.current = null;
                        return;
                    }

                    audioRef.current = audio;
                    modeRef.current  = 'htmlaudio';

                    audio.ontimeupdate = () => {
                        if (myId !== loadIdRef.current) return;
                        const dur = (isFinite(audio.duration) && audio.duration > 0)
                            ? audio.duration : storedDuration || 1;
                        setProgress(audio.currentTime / dur);
                    };
                    audio.onended = () => {
                        if (myId !== loadIdRef.current) return;
                        setPlaying(false); setProgress(0);
                    };

                    setStatus('ready');
                } catch {
                    if (myId !== loadIdRef.current) return;
                    URL.revokeObjectURL(blobUrl);
                    blobUrlRef.current = null;
                    throw new Error('Both WebAudio and HTMLAudio failed');
                }

            } catch (err) {
                if (myId !== loadIdRef.current) return;
                console.error('[VoiceBubble] load failed:', err);
                setStatus('error');
            }
        };

        load();

        return () => {
            loadIdRef.current = myId + 1;
            stopWebAudioSource();
            ctxRef.current?.close().catch(() => {});
            ctxRef.current  = null;
            bufferRef.current = null;
            if (audioRef.current) {
                audioRef.current.ontimeupdate = null;
                audioRef.current.onended = null;
                audioRef.current.pause();
                audioRef.current.src = '';
                audioRef.current = null;
            }
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
        };
    }, [fileUrl, storedDuration, storedMime, stopWebAudioSource]);

    // ── Toggle ────────────────────────────────────────────────────────────────
    const toggle = useCallback(async () => {
        if (status !== 'ready') return;

        if (modeRef.current === 'htmlaudio') {
            const a = audioRef.current;
            if (!a) return;
            if (playing) { a.pause(); setPlaying(false); }
            else {
                try { await a.play(); setPlaying(true); }
                catch (e) { console.error('[VoiceBubble] HTMLAudio play failed:', e); setStatus('error'); }
            }
            return;
        }

        // Web Audio mode
        const ctx = ctxRef.current;
        const buf = bufferRef.current;
        if (!ctx || !buf) return;

        if (playing) {
            offsetRef.current = Math.min(
                offsetRef.current + (ctx.currentTime - startCtxTimeRef.current),
                buf.duration,
            );
            stopWebAudioSource();
            setPlaying(false);
        } else {
            if (ctx.state === 'suspended') await ctx.resume();
            const source = ctx.createBufferSource();
            source.buffer = buf;
            source.connect(ctx.destination);
            sourceRef.current       = source;
            startCtxTimeRef.current = ctx.currentTime;
            source.start(0, offsetRef.current);
            source.onended = () => {
                if (sourceRef.current !== source) return;
                playingRef.current = false;
                setPlaying(false); setProgress(0);
                offsetRef.current = 0; sourceRef.current = null;
                stopRaf();
            };
            playingRef.current = true;
            setPlaying(true);
            rafRef.current = requestAnimationFrame(tick);
        }
    }, [playing, status, stopWebAudioSource, stopRaf, tick]);

    // ── Bar click ─────────────────────────────────────────────────────────────
    const handleBarClick = useCallback((idx: number, total: number) => {
        if (status !== 'ready') return;
        const ratio = idx / total;

        if (modeRef.current === 'htmlaudio') {
            const a   = audioRef.current;
            const dur = (a && isFinite(a.duration) && a.duration > 0) ? a.duration : storedDuration;
            if (!a || !dur) return;
            a.currentTime = ratio * dur;
            setProgress(ratio);
            return;
        }

        const ctx = ctxRef.current;
        const buf = bufferRef.current;
        if (!ctx || !buf) return;

        const newOffset = ratio * buf.duration;
        setProgress(ratio);

        if (playing) {
            stopWebAudioSource();
            offsetRef.current = newOffset;
            const source = ctx.createBufferSource();
            source.buffer = buf;
            source.connect(ctx.destination);
            sourceRef.current       = source;
            startCtxTimeRef.current = ctx.currentTime;
            source.start(0, newOffset);
            source.onended = () => {
                if (sourceRef.current !== source) return;
                playingRef.current = false;
                setPlaying(false); setProgress(0);
                offsetRef.current = 0; sourceRef.current = null;
                stopRaf();
            };
            playingRef.current = true;
            rafRef.current = requestAnimationFrame(tick);
        } else {
            offsetRef.current = newOffset;
        }
    }, [playing, status, storedDuration, stopWebAudioSource, stopRaf, tick]);

    // ── UI ────────────────────────────────────────────────────────────────────
    const barCount = 40;
    const bars: number[] = [];
    if (waveform.length === 0) {
        for (let i = 0; i < barCount; i++) bars.push(0.15 + Math.sin(i * 0.5) * 0.1);
    } else {
        const step = waveform.length / barCount;
        for (let i = 0; i < barCount; i++) bars.push(Math.max(0.05, waveform[Math.floor(i * step)] ?? 0.05));
    }
    const playedBars = Math.floor(progress * barCount);

    const getDur = () => {
        if (modeRef.current === 'webaudio' && bufferRef.current) return bufferRef.current.duration;
        if (modeRef.current === 'htmlaudio' && audioRef.current) {
            const d = audioRef.current.duration;
            return isFinite(d) && d > 0 ? d : storedDuration;
        }
        return storedDuration;
    };
    const getPos = () => {
        if (playing) {
            if (modeRef.current === 'webaudio' && ctxRef.current)
                return offsetRef.current + (ctxRef.current.currentTime - startCtxTimeRef.current);
            if (modeRef.current === 'htmlaudio' && audioRef.current)
                return audioRef.current.currentTime;
        }
        return offsetRef.current > 0 ? offsetRef.current : getDur();
    };
    const fmt = (s: number) =>
        `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

    if (status === 'error') {
        return (
            <div className={`flex items-center gap-2 text-xs py-1 ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                🎙 Не вдалося відтворити
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2.5 min-w-[200px] max-w-[260px]">
            <button onClick={toggle} disabled={status !== 'ready'}
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
                        ${status === 'ready' ? 'cursor-pointer' : 'cursor-default'}
                        ${isMe ? 'bg-white/20 hover:bg-white/30' : 'bg-violet-100 dark:bg-violet-900/30 hover:bg-violet-200 dark:hover:bg-violet-900/50'}`}>
                {status === 'loading'
                    ? <Loader2 size={14} className={`animate-spin ${isMe ? 'text-white' : 'text-violet-400'}`} />
                    : playing
                        ? <Pause size={15} className={isMe ? 'text-white' : 'text-violet-600 dark:text-violet-400'} />
                        : <Play  size={15} className={isMe ? 'text-white' : 'text-violet-600 dark:text-violet-400'} />}
            </button>
            <div className="flex-1 flex flex-col gap-1">
                <div className="flex items-center gap-[2px] h-6">
                    {bars.map((v, i) => (
                        <button key={i} onClick={() => handleBarClick(i, barCount)}
                                disabled={status !== 'ready'}
                                className={`flex-1 rounded-full transition-colors
                                    ${status === 'ready' ? 'cursor-pointer' : 'cursor-default'}
                                    ${i < playedBars
                                    ? (isMe ? 'bg-white' : 'bg-violet-500')
                                    : (isMe ? 'bg-white/40' : 'bg-slate-300 dark:bg-slate-600')}`}
                                style={{ height: `${Math.max(3, v * 24)}px` }} />
                    ))}
                </div>
                <span className={`text-[10px] font-mono ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                    {fmt(getPos())}
                </span>
            </div>
        </div>
    );
}