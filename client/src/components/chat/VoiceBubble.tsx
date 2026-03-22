'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { parseMetadata } from '@/src/lib/parseMetadata';
import {useSignedUrl} from "@/src/hooks/useSignedUrl";

interface Props {
    fileUrl:   string;
    metadata:  string | null | undefined;
    isMe:      boolean;
    onDecrypt?: (data: ArrayBuffer) => Promise<ArrayBuffer>;
}

// ---------------------------------------------------------------------------
// Detect actual audio format from magic bytes — more reliable than any header.
// ---------------------------------------------------------------------------
function detectMimeFromBytes(buffer: ArrayBuffer): string {
    const b = new Uint8Array(buffer.slice(0, 12));
    // WAV: RIFF....WAVE
    if (b[0]===0x52&&b[1]===0x49&&b[2]===0x46&&b[3]===0x46&&
        b[8]===0x57&&b[9]===0x41&&b[10]===0x56&&b[11]===0x45) return 'audio/wav';
    // OGG: OggS
    if (b[0]===0x4F&&b[1]===0x67&&b[2]===0x67&&b[3]===0x53) return 'audio/ogg';
    // WebM / EBML: 1a 45 df a3
    if (b[0]===0x1A&&b[1]===0x45&&b[2]===0xDF&&b[3]===0xA3) return 'audio/webm';
    // MP3 ID3
    if (b[0]===0x49&&b[1]===0x44&&b[2]===0x33) return 'audio/mpeg';
    // MP3 sync
    if (b[0]===0xFF&&(b[1]&0xE0)===0xE0) return 'audio/mpeg';
    // MP4/M4A: ....ftyp
    if (b[4]===0x66&&b[5]===0x74&&b[6]===0x79&&b[7]===0x70) return 'audio/mp4';
    return '';
}

// ---------------------------------------------------------------------------
// Build MIME queue. Priority:
//   1. detected from magic bytes (most accurate)
//   2. explicit-codec variant of detected (Firefox needs "audio/webm;codecs=opus")
//   3. blob.type from HTTP response
//   4. mimeType from metadata
//   5. exhaustive fallbacks
// ---------------------------------------------------------------------------
function buildMimeQueue(buffer: ArrayBuffer, blobType: string, metadataMime: string): string[] {
    const detected = detectMimeFromBytes(buffer);

    // Build codec-explicit version of detected type
    let detectedWithCodec = '';
    if (detected === 'audio/webm') detectedWithCodec = 'audio/webm;codecs=opus';
    if (detected === 'audio/ogg')  detectedWithCodec = 'audio/ogg;codecs=opus';

    const candidates = [
        detected,
        detectedWithCodec,
        blobType,
        metadataMime,
        'audio/wav',
        'audio/webm;codecs=opus',
        'audio/webm;codecs=vorbis',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg;codecs=vorbis',
        'audio/ogg',
        'audio/mp4',
        'audio/mpeg',
        '', // last resort: let browser sniff
    ];

    const seen = new Set<string>();
    const result: string[] = [];
    for (const m of candidates) {
        if (m === '') continue;
        if (!m || seen.has(m)) continue;
        seen.add(m);
        result.push(m);
    }
    result.push('');
    return result;
}

// ---------------------------------------------------------------------------
// Try to load audio from a blob URL.
// errorCode 4 = SRC_NOT_SUPPORTED → try next MIME
// errorCode 3 = DECODE error      → corrupt file, stop
// ---------------------------------------------------------------------------
function tryLoadAudio(blobUrl: string): Promise<{
    ok: boolean; audio: HTMLAudioElement; errorCode?: number;
}> {
    return new Promise((resolve) => {
        const audio = new Audio();
        let settled = false;
        let durationFallback: ReturnType<typeof setTimeout> | null = null;

        const finish = (ok: boolean, errorCode?: number) => {
            if (settled) return;
            settled = true;
            clearTimeout(tid);
            if (durationFallback) clearTimeout(durationFallback);
            audio.oncanplay = audio.onloadeddata = audio.onerror = audio.ontimeupdate = null;
            resolve({ ok, audio, errorCode });
        };

        audio.oncanplay = () => {
            if (!isFinite(audio.duration) || audio.duration === 0) {
                audio.currentTime = 1e101;
                audio.ontimeupdate = () => {
                    audio.ontimeupdate = null;
                    audio.currentTime  = 0;
                    finish(true);
                };
                durationFallback = setTimeout(() => {
                    audio.ontimeupdate = null;
                    try { audio.currentTime = 0; } catch {}
                    finish(true);
                }, 1000);
            } else {
                finish(true);
            }
        };

        audio.onloadeddata = () => finish(true);
        audio.onerror      = () => finish(false, audio.error?.code);
        const tid = setTimeout(() => finish(audio.readyState >= 3), 6000);

        audio.preload = 'auto';
        audio.src     = blobUrl;
        audio.load();
    });
}

// ---------------------------------------------------------------------------
export function VoiceBubble({ fileUrl, metadata, isMe, onDecrypt }: Props) {
    const [playing,  setPlaying]  = useState(false);
    const [progress, setProgress] = useState(0);
    const [status,   setStatus]   = useState<'loading' | 'ready' | 'error'>('loading');

    const audioRef   = useRef<HTMLAudioElement | null>(null);
    const blobUrlRef = useRef<string | null>(null);
    const loadIdRef  = useRef(0);

    const signedSrc = useSignedUrl(fileUrl);

    const {
        waveform:  rawWaveform,
        duration:  storedDuration,
        mimeType:  originalMime,
        encrypted: isEncryptedFlag,
    } = parseMetadata(metadata);

    const isEncrypted = isEncryptedFlag && !!onDecrypt;

    useEffect(() => {

        if (!signedSrc) return;

        const myId = ++loadIdRef.current;
        setStatus('loading'); setPlaying(false); setProgress(0);

        const load = async () => {
            try {
                const res = await fetch(signedSrc);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                // ── Decrypt or read raw bytes ──────────────────────────────────
                let blob: Blob;
                if (isEncrypted && onDecrypt) {
                    const enc = await res.arrayBuffer();
                    if (myId !== loadIdRef.current) return;
                    const dec = await onDecrypt(enc);
                    if (myId !== loadIdRef.current) return;
                    // Use originalMime from metadata as the starting point
                    blob = new Blob([dec], { type: originalMime });
                } else {
                    blob = await res.blob();
                }
                if (myId !== loadIdRef.current) return;

                // blob.type: actual type served by Supabase (most reliable for new files)
                // originalMime: stored in metadata (reliable for files with metadata)
                // detectMimeFromBytes: reliable for all files including old ones with metadata=null
                const rawBuffer = await blob.arrayBuffer();
                const mimeQueue = buildMimeQueue(rawBuffer, blob.type, originalMime);

                let finalBlobUrl: string | null = null;
                let finalAudio:   HTMLAudioElement | null = null;

                for (const mime of mimeQueue) {
                    if (myId !== loadIdRef.current) return;

                    const tryBlob = mime
                        ? new Blob([rawBuffer], { type: mime })
                        : new Blob([rawBuffer]);
                    const tryUrl = URL.createObjectURL(tryBlob);

                    const { ok, audio, errorCode } = await tryLoadAudio(tryUrl);

                    if (ok) {
                        finalBlobUrl = tryUrl;
                        finalAudio   = audio;
                        break;
                    }

                    URL.revokeObjectURL(tryUrl);

                    // Only retry on SRC_NOT_SUPPORTED (code 4)
                    if (errorCode !== 4) break;
                }

                if (!finalBlobUrl || !finalAudio) {
                    throw new Error('Audio cannot be decoded by this browser');
                }

                if (myId !== loadIdRef.current) {
                    URL.revokeObjectURL(finalBlobUrl);
                    return;
                }

                blobUrlRef.current = finalBlobUrl;
                audioRef.current   = finalAudio;

                finalAudio.ontimeupdate = () => {
                    if (myId !== loadIdRef.current) return;
                    const dur = isFinite(finalAudio!.duration) && finalAudio!.duration > 0
                        ? finalAudio!.duration : storedDuration || 1;
                    setProgress(finalAudio!.currentTime / dur);
                };
                finalAudio.onended = () => {
                    if (myId !== loadIdRef.current) return;
                    setPlaying(false); setProgress(0);
                };
                finalAudio.onerror = () => {
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
                audioRef.current     = null;
            }
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
        };
    }, [signedSrc, storedDuration, isEncrypted]);

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
    if (rawWaveform.length === 0) {
        for (let i = 0; i < barCount; i++) bars.push(0.15 + Math.sin(i * 0.5) * 0.1);
    } else {
        const step = rawWaveform.length / barCount;
        for (let i = 0; i < barCount; i++) {
            bars.push(Math.max(0.05, rawWaveform[Math.floor(i * step)] ?? 0.05));
        }
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