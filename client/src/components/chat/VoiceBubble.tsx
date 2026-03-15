'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

interface Props {
    fileUrl:  string;
    metadata: string | null | undefined;
    isMe:     boolean;
}

export function VoiceBubble({ fileUrl, metadata, isMe }: Props) {
    const [playing,   setPlaying]   = useState(false);
    const [progress,  setProgress]  = useState(0);
    const [duration,  setDuration]  = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const parsed  = metadata ? (() => { try { return JSON.parse(metadata); } catch { return null; } })() : null;
    const waveform: number[] = parsed?.waveform ?? [];
    const storedDuration: number = parsed?.duration ?? 0;

    useEffect(() => {
        const audio = new Audio(fileUrl);
        audioRef.current = audio;
        audio.onloadedmetadata = () => setDuration(audio.duration || storedDuration);
        audio.ontimeupdate     = () => setProgress(audio.currentTime / (audio.duration || 1));
        audio.onended          = () => { setPlaying(false); setProgress(0); };
        return () => { audio.pause(); };
    }, [fileUrl, storedDuration]);

    const toggle = () => {
        const a = audioRef.current;
        if (!a) return;
        if (playing) { a.pause(); setPlaying(false); }
        else         { a.play(); setPlaying(true); }
    };

    const handleBarClick = (idx: number, total: number) => {
        const a = audioRef.current;
        if (!a || !a.duration) return;
        a.currentTime = (idx / total) * a.duration;
        setProgress(idx / total);
    };

    const barCount = 40;
    const bars: number[] = [];
    if (waveform.length === 0) {
        for (let i = 0; i < barCount; i++) bars.push(0.15 + Math.sin(i * 0.5) * 0.1);
    } else {
        const step = waveform.length / barCount;
        for (let i = 0; i < barCount; i++) bars.push(Math.max(0.05, waveform[Math.floor(i * step)] ?? 0.05));
    }
    const playedBars = Math.floor(progress * barCount);

    const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

    return (
        <div className="flex items-center gap-2.5 min-w-[200px] max-w-[260px]">
            <button onClick={toggle}
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-all active:scale-95
                        ${isMe ? 'bg-white/20 hover:bg-white/30' : 'bg-violet-100 dark:bg-violet-900/30 hover:bg-violet-200 dark:hover:bg-violet-900/50'}`}>
                {playing
                    ? <Pause  size={15} className={isMe ? 'text-white' : 'text-violet-600 dark:text-violet-400'} />
                    : <Play   size={15} className={isMe ? 'text-white' : 'text-violet-600 dark:text-violet-400'} />}
            </button>

            <div className="flex-1 flex flex-col gap-1">
                <div className="flex items-center gap-[2px] h-6">
                    {bars.map((v, i) => (
                        <button
                            key={i}
                            onClick={() => handleBarClick(i, barCount)}
                            className={`flex-1 rounded-full cursor-pointer transition-colors
                                ${i < playedBars
                                ? (isMe ? 'bg-white' : 'bg-violet-500')
                                : (isMe ? 'bg-white/40' : 'bg-slate-300 dark:bg-slate-600')}`}
                            style={{ height: `${Math.max(3, v * 24)}px` }}
                        />
                    ))}
                </div>
                <span className={`text-[10px] font-mono ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                    {fmt(playing && audioRef.current ? audioRef.current.currentTime : (storedDuration || duration))}
                </span>
            </div>
        </div>
    );
}