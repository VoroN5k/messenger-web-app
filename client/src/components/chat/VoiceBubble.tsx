'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Loader2 } from 'lucide-react';

interface Props {
    fileUrl:  string;
    metadata: string | null | undefined;
    isMe:     boolean;
}

export function VoiceBubble({ fileUrl, metadata, isMe }: Props) {
    const [playing,  setPlaying]  = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [status,   setStatus]   = useState<'loading' | 'ready' | 'error'>('loading');
    const audioRef   = useRef<HTMLAudioElement | null>(null);
    const blobUrlRef = useRef<string | null>(null);

    const parsed             = metadata ? (() => { try { return JSON.parse(metadata); } catch { return null; } })() : null;
    const waveform: number[] = parsed?.waveform ?? [];
    const storedDuration: number = parsed?.duration ?? 0;

    useEffect(() => {
        let cancelled = false;

        setStatus('loading');
        setPlaying(false);
        setProgress(0);

        // Завантажуємо через fetch → blob щоб уникнути CORS і MediaLoadInvalidURI
        const load = async () => {
            try {
                const res = await fetch(fileUrl);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const blob    = await res.blob();
                if (cancelled) return;

                const blobUrl = URL.createObjectURL(blob);
                blobUrlRef.current = blobUrl;

                const audio = new Audio(blobUrl);
                audioRef.current = audio;

                audio.onloadedmetadata = () => {
                    if (cancelled) return;
                    setDuration(isFinite(audio.duration) ? audio.duration : storedDuration);
                    setStatus('ready');
                };

                audio.ontimeupdate = () => {
                    const dur = audio.duration || storedDuration || 1;
                    setProgress(audio.currentTime / dur);
                };

                audio.onended = () => {
                    setPlaying(false);
                    setProgress(0);
                };

                audio.onerror = () => {
                    if (cancelled) return;
                    console.error('[VoiceBubble] Audio error after blob load');
                    setStatus('error');
                };

                // На випадок якщо onloadedmetadata не спрацьовує
                audio.oncanplay = () => {
                    if (cancelled || status === 'ready') return;
                    setStatus('ready');
                };

            } catch (err) {
                if (cancelled) return;
                console.error('[VoiceBubble] fetch failed:', err);
                setStatus('error');
            }
        };

        load();

        return () => {
            cancelled = true;
            audioRef.current?.pause();
            audioRef.current = null;
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
        };
    }, [fileUrl, storedDuration]);

    const toggle = useCallback(async () => {
        const a = audioRef.current;
        if (!a || status !== 'ready') return;

        if (playing) {
            a.pause();
            setPlaying(false);
        } else {
            try {
                await a.play();
                setPlaying(true);
            } catch (err) {
                console.error('[VoiceBubble] play() rejected:', err);
                setStatus('error');
            }
        }
    }, [playing, status]);

    const handleBarClick = useCallback((idx: number, total: number) => {
        const a = audioRef.current;
        if (!a) return;
        const dur = a.duration || storedDuration;
        if (!dur) return;
        a.currentTime = (idx / total) * dur;
        setProgress(idx / total);
    }, [storedDuration]);

    const barCount = 40;
    const bars: number[] = [];
    if (waveform.length === 0) {
        for (let i = 0; i < barCount; i++) bars.push(0.15 + Math.sin(i * 0.5) * 0.1);
    } else {
        const step = waveform.length / barCount;
        for (let i = 0; i < barCount; i++) {
            bars.push(Math.max(0.05, waveform[Math.floor(i * step)] ?? 0.05));
        }
    }
    const playedBars = Math.floor(progress * barCount);
    const displayTime = playing && audioRef.current
        ? audioRef.current.currentTime
        : (storedDuration || duration);
    const fmt = (s: number) =>
        `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

    if (status === 'error') {
        return (
            <div className={`flex items-center gap-2 text-xs py-1 ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                🎙 Не вдалося завантажити
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2.5 min-w-[200px] max-w-[260px]">
            <button
                onClick={toggle}
                disabled={status !== 'ready'}
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
                    ${status === 'ready' ? 'cursor-pointer' : 'cursor-default'}
                    ${isMe
                    ? 'bg-white/20 hover:bg-white/30'
                    : 'bg-violet-100 dark:bg-violet-900/30 hover:bg-violet-200 dark:hover:bg-violet-900/50'}`}>
                {status === 'loading'
                    ? <Loader2 size={14} className={`animate-spin ${isMe ? 'text-white' : 'text-violet-400'}`} />
                    : playing
                        ? <Pause size={15} className={isMe ? 'text-white' : 'text-violet-600 dark:text-violet-400'} />
                        : <Play  size={15} className={isMe ? 'text-white' : 'text-violet-600 dark:text-violet-400'} />}
            </button>

            <div className="flex-1 flex flex-col gap-1">
                <div className="flex items-center gap-[2px] h-6">
                    {bars.map((v, i) => (
                        <button
                            key={i}
                            onClick={() => handleBarClick(i, barCount)}
                            disabled={status !== 'ready'}
                            className={`flex-1 rounded-full transition-colors
                                ${status === 'ready' ? 'cursor-pointer' : 'cursor-default'}
                                ${i < playedBars
                                ? (isMe ? 'bg-white' : 'bg-violet-500')
                                : (isMe ? 'bg-white/40' : 'bg-slate-300 dark:bg-slate-600')}`}
                            style={{ height: `${Math.max(3, v * 24)}px` }}
                        />
                    ))}
                </div>
                <span className={`text-[10px] font-mono ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                    {fmt(displayTime)}
                </span>
            </div>
        </div>
    );
}