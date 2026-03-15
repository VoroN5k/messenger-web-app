'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
    fileUrl:   string;
    metadata:  string | null | undefined;
    isMe:      boolean;
    /** Passed for DIRECT chats — decrypts the raw encrypted bytes fetched from storage */
    onDecrypt?: (data: ArrayBuffer) => Promise<ArrayBuffer>;
}

export function VoiceBubble({ fileUrl, metadata, isMe, onDecrypt }: Props) {
    const [playing,  setPlaying]  = useState(false);
    const [progress, setProgress] = useState(0);
    const [status,   setStatus]   = useState<'loading' | 'ready' | 'error'>('loading');

    const audioRef   = useRef<HTMLAudioElement | null>(null);
    const blobUrlRef = useRef<string | null>(null);
    const loadIdRef  = useRef(0);

    const parsed         = metadata ? (() => { try { return JSON.parse(metadata); } catch { return null; } })() : null;
    const waveform: number[] = parsed?.waveform ?? [];
    const storedDuration: number = parsed?.duration ?? 0;
    // originalMimeType is stored in metadata when the voice message is encrypted
    const originalMime: string = parsed?.mimeType ?? 'audio/wav';
    const isEncrypted: boolean = !!parsed?.encrypted && !!onDecrypt;

    useEffect(() => {
        const myId = ++loadIdRef.current;
        setStatus('loading'); setPlaying(false); setProgress(0);

        const load = async () => {
            try {
                const res = await fetch(fileUrl);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                // ── Decrypt if needed ─────────────────────────────────────────
                let audioBuffer: ArrayBuffer;
                if (isEncrypted && onDecrypt) {
                    const raw = await res.arrayBuffer();
                    if (myId !== loadIdRef.current) return;
                    audioBuffer = await onDecrypt(raw);
                } else {
                    audioBuffer = await res.arrayBuffer();
                }
                if (myId !== loadIdRef.current) return;

                const mimeType = isEncrypted ? originalMime : (res.headers.get('content-type') ?? originalMime);
                const blob     = new Blob([audioBuffer], { type: mimeType });
                const blobUrl  = URL.createObjectURL(blob);
                blobUrlRef.current = blobUrl;

                const audio = new Audio();
                let settled = false;

                const ok = await new Promise<boolean>((resolve) => {
                    const finish = (result: boolean) => {
                        if (settled) return; settled = true;
                        clearTimeout(tid);
                        audio.oncanplay = audio.onloadeddata = audio.onerror = null;
                        resolve(result);
                    };
                    audio.oncanplay = () => {
                        if (!isFinite(audio.duration) || audio.duration === 0) {
                            audio.currentTime = 1e101;
                            audio.ontimeupdate = () => {
                                audio.ontimeupdate = null;
                                audio.currentTime = 0;
                                finish(true);
                            };
                        } else {
                            finish(true);
                        }
                    };
                    audio.onloadeddata = () => finish(true);
                    audio.onerror      = () => finish(false);
                    const tid = setTimeout(() => finish(false), 8000);
                    audio.preload = 'auto';
                    audio.src     = blobUrl;
                    audio.load();
                });

                if (myId !== loadIdRef.current) return;

                if (!ok) {
                    URL.revokeObjectURL(blobUrl); blobUrlRef.current = null;
                    throw new Error('Audio cannot be decoded');
                }

                audioRef.current = audio;

                audio.ontimeupdate = () => {
                    if (myId !== loadIdRef.current) return;
                    const dur = isFinite(audio.duration) && audio.duration > 0
                        ? audio.duration : storedDuration || 1;
                    setProgress(audio.currentTime / dur);
                };
                audio.onended = () => {
                    if (myId !== loadIdRef.current) return;
                    setPlaying(false); setProgress(0);
                };
                audio.onerror = () => {
                    if (myId !== loadIdRef.current) return;
                    setStatus('error');
                };

                setStatus('ready');
            } catch (err) {
                if (myId !== loadIdRef.current) return;
                console.error('[VoiceBubble] load failed:', err);
                setStatus('error');
            }
        };

        load();

        return () => {
            loadIdRef.current = myId + 1;
            if (audioRef.current) {
                audioRef.current.ontimeupdate = null;
                audioRef.current.onended      = null;
                audioRef.current.onerror      = null;
                audioRef.current.pause();
                audioRef.current.src = '';
                audioRef.current = null;
            }
            if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
        };
    }, [fileUrl, storedDuration, isEncrypted]);

    const toggle = useCallback(async () => {
        const a = audioRef.current;
        if (!a || status !== 'ready') return;
        if (playing) { a.pause(); setPlaying(false); }
        else { try { await a.play(); setPlaying(true); } catch { setStatus('error'); } }
    }, [playing, status]);

    const handleBarClick = useCallback((idx: number, total: number) => {
        const a = audioRef.current;
        if (!a || status !== 'ready') return;
        const dur = isFinite(a.duration) && a.duration > 0 ? a.duration : storedDuration;
        if (!dur) return;
        a.currentTime = (idx / total) * dur;
        setProgress(idx / total);
    }, [status, storedDuration]);

    const barCount = 40;
    const bars: number[] = [];
    if (waveform.length === 0) {
        for (let i = 0; i < barCount; i++) bars.push(0.15 + Math.sin(i * 0.5) * 0.1);
    } else {
        const step = waveform.length / barCount;
        for (let i = 0; i < barCount; i++) bars.push(Math.max(0.05, waveform[Math.floor(i * step)] ?? 0.05));
    }
    const playedBars = Math.floor(progress * barCount);

    const getDisplayTime = () => {
        if (playing && audioRef.current) return audioRef.current.currentTime;
        const d = audioRef.current?.duration;
        return (d && isFinite(d) && d > 0) ? d : storedDuration;
    };
    const fmt = (s: number) =>
        `${String(Math.floor(Math.max(0,s)/60)).padStart(2,'0')}:${String(Math.floor(Math.max(0,s)%60)).padStart(2,'0')}`;

    if (status === 'error') {
        return (
            <div className={`flex items-center gap-2 text-xs py-1 ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                <span>🎙 Не вдалося відтворити</span>
                <a href={fileUrl} download target="_blank" rel="noopener noreferrer"
                   className={`underline cursor-pointer ${isMe ? 'text-indigo-200' : 'text-violet-500'}`}>
                    Завантажити
                </a>
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
                        ? <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" className={isMe ? 'text-white' : 'text-violet-600 dark:text-violet-400'}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                        : <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" className={`ml-0.5 ${isMe ? 'text-white' : 'text-violet-600 dark:text-violet-400'}`}><polygon points="5,3 19,12 5,21"/></svg>}
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
                    {fmt(getDisplayTime())}
                </span>
            </div>
        </div>
    );
}