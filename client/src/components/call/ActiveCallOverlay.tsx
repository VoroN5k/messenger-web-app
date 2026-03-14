'use client';

import { useEffect, useRef, useState } from 'react';
import {
    PhoneOff, Mic, MicOff, Video, VideoOff,
    Maximize2, Minimize2, Volume2,
} from 'lucide-react';
import { Avatar } from '@/src/components/chat/Avatar';
import { CallState, CallType } from '@/src/hooks/useWebRTC';

interface Props {
    callState:    CallState;
    localStream:  MediaStream | null;
    remoteStream: MediaStream | null;
    isMuted:      boolean;
    isCameraOff:  boolean;
    peerName:     string;
    peerAvatar:   string | null;
    onEnd:        () => void;
    onToggleMute:   () => void;
    onToggleCamera: () => void;
}

function formatDuration(ms: number): string {
    const s   = Math.floor(ms / 1000);
    const m   = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function ActiveCallOverlay({
                                      callState, localStream, remoteStream,
                                      isMuted, isCameraOff,
                                      peerName, peerAvatar,
                                      onEnd, onToggleMute, onToggleCamera,
                                  }: Props) {
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const localVideoRef  = useRef<HTMLVideoElement>(null);
    const [expanded,  setExpanded]  = useState(true);
    const [duration,  setDuration]  = useState('00:00');

    const isVideo  = callState.callType === 'video';
    const isActive = callState.status === 'active';
    const status   = callState.status;

    // ── Attach streams to video elements ─────────────────────────────────────
    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    // ── Duration counter ──────────────────────────────────────────────────────
    useEffect(() => {
        if (status !== 'active' || !callState.startedAt) return;
        const t = setInterval(() => {
            setDuration(formatDuration(Date.now() - callState.startedAt!));
        }, 1000);
        return () => clearInterval(t);
    }, [status, callState.startedAt]);

    // ── Status label ──────────────────────────────────────────────────────────
    const statusLabel =
        status === 'calling'    ? 'Виклик...'     :
            status === 'incoming'   ? 'Вхідний...'    :
                status === 'connecting' ? "З'єднання..."  :
                    status === 'active'     ? duration        :
                        status === 'ended'      ? (
                            callState.endReason === 'rejected'  ? 'Відхилено'  :
                                callState.endReason === 'no-answer' ? 'Немає відповіді' :
                                    callState.endReason === 'busy'      ? 'Зайнято'    :
                                        callState.endReason === 'error'     ? 'Помилка'    :
                                            'Дзвінок завершено'
                        ) : '';

    // ── Minimized pill ────────────────────────────────────────────────────────
    if (!expanded) {
        return (
            <div
                className="fixed bottom-24 right-6 z-[90] flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-2xl px-4 py-3 shadow-2xl cursor-pointer"
                onClick={() => setExpanded(true)}
            >
                <div className="relative">
                    <Avatar user={{ nickname: peerName, avatarUrl: peerAvatar }} size="sm" />
                    {isActive && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-slate-900 animate-pulse" />
                    )}
                </div>
                <div>
                    <p className="text-sm font-semibold text-white leading-tight">{peerName}</p>
                    <p className="text-xs text-emerald-400 tabular-nums">{statusLabel}</p>
                </div>
                <div className="flex items-center gap-1.5 ml-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); onEnd(); }}
                        className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center cursor-pointer transition-colors"
                    >
                        <PhoneOff size={13} className="text-white" />
                    </button>
                </div>
            </div>
        );
    }

    // ── Expanded overlay ──────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-[90] flex flex-col bg-slate-950">

            {/* ── Remote video / audio visual ── */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                {isVideo ? (
                    <>
                        <video
                            ref={remoteVideoRef}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                        />
                        {/* No remote stream yet — show avatar */}
                        {!remoteStream?.getVideoTracks().length && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                                <Avatar user={{ nickname: peerName, avatarUrl: peerAvatar }} size="xl" />
                            </div>
                        )}
                    </>
                ) : (
                    /* Audio call — show large avatar with pulse */
                    <div className="flex flex-col items-center gap-6">
                        <div className="relative">
                            {isActive && (
                                <>
                                    <div className="absolute inset-0 rounded-full bg-indigo-400/10 animate-ping scale-[2]" />
                                    <div className="absolute inset-0 rounded-full bg-indigo-400/10 animate-ping scale-[1.5] animation-delay-300" />
                                </>
                            )}
                            <Avatar user={{ nickname: peerName, avatarUrl: peerAvatar }} size="xl"
                                    className="w-28 h-28 text-3xl ring-4 ring-indigo-400/20" />
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-white">{peerName}</p>
                            <p className="text-base text-slate-400 mt-1 tabular-nums">{statusLabel}</p>
                        </div>
                    </div>
                )}

                {/* ── Local video (PiP) ── */}
                {isVideo && (
                    <div className="absolute bottom-4 right-4 w-32 h-24 rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl bg-slate-800">
                        <video
                            ref={localVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`w-full h-full object-cover ${isCameraOff ? 'opacity-0' : ''}`}
                        />
                        {isCameraOff && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
                                <VideoOff size={20} className="text-slate-500" />
                            </div>
                        )}
                    </div>
                )}

                {/* ── Top bar ── */}
                <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 pt-safe-top py-4 bg-gradient-to-b from-black/60 to-transparent">
                    {isVideo && (
                        <div>
                            <p className="text-white font-semibold">{peerName}</p>
                            <p className="text-xs text-slate-300 tabular-nums">{statusLabel}</p>
                        </div>
                    )}
                    <button
                        onClick={() => setExpanded(false)}
                        className="ml-auto p-2 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
                    >
                        <Minimize2 size={16} />
                    </button>
                </div>
            </div>

            {/* ── Controls bar ── */}
            <div className="flex items-center justify-center gap-5 px-8 py-8 bg-gradient-to-t from-black/80 to-transparent">

                {/* Mute */}
                <CallButton
                    label={isMuted ? 'Звук вимк.' : 'Звук'}
                    active={isMuted}
                    activeColor="bg-red-500"
                    onClick={onToggleMute}
                >
                    {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </CallButton>

                {/* End call */}
                <button
                    onClick={onEnd}
                    className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center cursor-pointer transition-all active:scale-95 shadow-lg shadow-red-500/40"
                >
                    <PhoneOff size={24} className="text-white" />
                </button>

                {/* Camera (video calls only) */}
                {isVideo ? (
                    <CallButton
                        label={isCameraOff ? 'Камера вимк.' : 'Камера'}
                        active={isCameraOff}
                        activeColor="bg-red-500"
                        onClick={onToggleCamera}
                    >
                        {isCameraOff ? <VideoOff size={20} /> : <Video size={20} />}
                    </CallButton>
                ) : (
                    <CallButton label="Гучність" active={false} activeColor="" onClick={() => {}}>
                        <Volume2 size={20} />
                    </CallButton>
                )}
            </div>
        </div>
    );
}

// ── Small control button ──────────────────────────────────────────────────────
function CallButton({
                        children, label, active, activeColor, onClick,
                    }: {
    children:    React.ReactNode;
    label:       string;
    active:      boolean;
    activeColor: string;
    onClick:     () => void;
}) {
    return (
        <div className="flex flex-col items-center gap-1.5">
            <button
                onClick={onClick}
                className={`w-14 h-14 rounded-full flex items-center justify-center cursor-pointer transition-all active:scale-95
          ${active ? `${activeColor} text-white` : 'bg-white/15 hover:bg-white/25 text-white'}`}
            >
                {children}
            </button>
            <span className="text-[10px] text-slate-400">{label}</span>
        </div>
    );
}