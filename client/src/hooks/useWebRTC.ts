import { useState, useEffect, useRef, useCallback } from 'react';

export type CallType   = 'audio' | 'video';
export type CallStatus = 'idle' | 'calling' | 'incoming' | 'connecting' | 'active' | 'ended';
export type EndReason  = 'rejected' | 'ended' | 'no-answer' | 'error' | 'busy';

export interface IncomingCallData {
    callId:       string;
    conversationId: number;
    callerId:     number;
    callerName:   string;
    callerAvatar: string | null;
    callType:     CallType;
}

export interface CallState {
    status:       CallStatus;
    callId?:      string;
    conversationId?: number;
    targetUserId?: number;
    callType?:    CallType;
    incomingData?: IncomingCallData;
    startedAt?:   number;
    endReason?:   EndReason;
}

const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
];

// ── Ringtone via Web Audio API (no file needed) ───────────────────────────────
function createRingtone(): { play: () => void; stop: () => void } {
    let ctx: AudioContext | null = null;
    let playing = false;

    const ring = () => {
        if (!playing || !ctx) return;
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 520;
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
        setTimeout(ring, 1400);
    };

    return {
        play: () => {
            if (playing) return;
            const AC = window.AudioContext || (window as any).webkitAudioContext;
            if (!AC) return;
            ctx     = new AC();
            playing = true;
            ring();
        },
        stop: () => {
            playing = false;
            ctx?.close().catch(() => {});
            ctx = null;
        },
    };
}

export const useWebRTC = (socket: any, currentUserId: number | undefined) => {
    const [callState,    setCallState]    = useState<CallState>({ status: 'idle' });
    const [localStream,  setLocalStream]  = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isMuted,      setIsMuted]      = useState(false);
    const [isCameraOff,  setIsCameraOff]  = useState(false);

    const pcRef           = useRef<RTCPeerConnection | null>(null);
    const localStreamRef  = useRef<MediaStream | null>(null);
    const callStateRef    = useRef<CallState>({ status: 'idle' });
    const ringTimeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ringtone        = useRef(createRingtone());

    useEffect(() => { callStateRef.current = callState; }, [callState]);

    // ── Cleanup ──────────────────────────────────────────────────────────────
    const cleanup = useCallback(() => {
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        setLocalStream(null);
        setRemoteStream(null);
        setIsMuted(false);
        setIsCameraOff(false);

        if (pcRef.current) {
            pcRef.current.ontrack             = null;
            pcRef.current.onicecandidate      = null;
            pcRef.current.oniceconnectionstatechange = null;
            pcRef.current.close();
            pcRef.current = null;
        }

        ringtone.current.stop();

        if (ringTimeoutRef.current) {
            clearTimeout(ringTimeoutRef.current);
            ringTimeoutRef.current = null;
        }
    }, []);

    // ── Create RTCPeerConnection ──────────────────────────────────────────────
    const createPC = useCallback((callId: string): RTCPeerConnection => {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        const remoteMS = new MediaStream();
        setRemoteStream(remoteMS);

        pc.ontrack = ({ streams }) => {
            streams[0]?.getTracks().forEach(t => remoteMS.addTrack(t));
            // Force re-render by creating new reference
            setRemoteStream(new MediaStream(remoteMS.getTracks()));
        };

        pc.onicecandidate = ({ candidate }) => {
            if (candidate) {
                socket?.emit('iceCandidate', { callId, candidate: candidate.toJSON() });
            }
        };

        pc.oniceconnectionstatechange = () => {
            const s = pc.iceConnectionState;
            if (s === 'connected' || s === 'completed') {
                setCallState(prev =>
                    prev.status === 'connecting'
                        ? { ...prev, status: 'active', startedAt: Date.now() }
                        : prev,
                );
            }
            if (s === 'disconnected' || s === 'failed' || s === 'closed') {
                setCallState(prev => {
                    if (prev.status === 'active' || prev.status === 'connecting') {
                        cleanup();
                        setTimeout(() => setCallState({ status: 'idle' }), 2000);
                        return { status: 'ended', endReason: 'ended' };
                    }
                    return prev;
                });
            }
        };

        pcRef.current = pc;
        return pc;
    }, [socket, cleanup]);

    // ── Get user media ────────────────────────────────────────────────────────
    const getMedia = useCallback(async (callType: CallType): Promise<MediaStream> => {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: callType === 'video'
                ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
                : false,
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
    }, []);

    // ── Start call ────────────────────────────────────────────────────────────
    const startCall = useCallback(async (
        conversationId: number,
        targetUserId: number,
        callType: CallType,
    ) => {
        if (!socket || !currentUserId) return;
        if (callStateRef.current.status !== 'idle') return;

        const callId = `${currentUserId}-${targetUserId}-${Date.now()}`;

        try {
            await getMedia(callType);

            setCallState({ status: 'calling', callId, conversationId, targetUserId, callType });

            socket.emit('callUser', { callId, conversationId, targetUserId, callType });

            // Auto-cancel if no answer in 45s
            ringTimeoutRef.current = setTimeout(() => {
                if (callStateRef.current.status === 'calling') {
                    socket.emit('callEnd', { callId, conversationId });
                    cleanup();
                    setCallState({ status: 'ended', endReason: 'no-answer' });
                    setTimeout(() => setCallState({ status: 'idle' }), 2000);
                }
            }, 45_000);
        } catch {
            cleanup();
            setCallState({ status: 'ended', endReason: 'error' });
            setTimeout(() => setCallState({ status: 'idle' }), 2000);
        }
    }, [socket, currentUserId, getMedia, cleanup]);

    // ── Accept call ───────────────────────────────────────────────────────────
    const acceptCall = useCallback(async (asType?: CallType) => {
        const state = callStateRef.current;
        if (state.status !== 'incoming' || !socket) return;

        const { callId, conversationId, callType } = state.incomingData!;
        const mediaType = asType ?? callType;

        ringtone.current.stop();
        if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }

        try {
            await getMedia(mediaType);
            setCallState({ status: 'connecting', callId, conversationId, callType: mediaType });
            socket.emit('callAccept', { callId, callType: mediaType });
        } catch {
            rejectCall();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, getMedia]);

    // ── Reject call ───────────────────────────────────────────────────────────
    const rejectCall = useCallback(() => {
        const state = callStateRef.current;
        if (state.status !== 'incoming' || !socket) return;
        const { callId, conversationId } = state.incomingData!;
        socket.emit('callReject', { callId, conversationId });
        ringtone.current.stop();
        cleanup();
        setCallState({ status: 'idle' });
    }, [socket, cleanup]);

    // ── End call ──────────────────────────────────────────────────────────────
    const endCall = useCallback(() => {
        const state = callStateRef.current;
        if (state.status === 'idle') return;
        if (state.callId) socket?.emit('callEnd', { callId: state.callId, conversationId: state.conversationId });
        cleanup();
        setCallState({ status: 'ended', endReason: 'ended' });
        setTimeout(() => setCallState({ status: 'idle' }), 2000);
    }, [socket, cleanup]);

    // ── Toggle mute / camera ──────────────────────────────────────────────────
    const toggleMute = useCallback(() => {
        const t = localStreamRef.current?.getAudioTracks()[0];
        if (!t) return;
        t.enabled = !t.enabled;
        setIsMuted(!t.enabled);
    }, []);

    const toggleCamera = useCallback(() => {
        const t = localStreamRef.current?.getVideoTracks()[0];
        if (!t) return;
        t.enabled = !t.enabled;
        setIsCameraOff(!t.enabled);
    }, []);

    // ── Socket events ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!socket) return;

        const onIncomingCall = (data: IncomingCallData) => {
            if (callStateRef.current.status !== 'idle') {
                socket.emit('callBusy', { callId: data.callId });
                return;
            }
            setCallState({ status: 'incoming', callId: data.callId, conversationId: data.conversationId, callType: data.callType, incomingData: data });
            ringtone.current.play();

            ringTimeoutRef.current = setTimeout(() => {
                if (callStateRef.current.status === 'incoming') {
                    socket.emit('callReject', { callId: data.callId, conversationId: data.conversationId });
                    ringtone.current.stop();
                    cleanup();
                    setCallState({ status: 'idle' });
                }
            }, 45_000);
        };

        const onCallAccepted = async (data: { callId: string; callType: CallType }) => {
            if (callStateRef.current.status !== 'calling') return;
            if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }

            setCallState(prev => ({ ...prev, status: 'connecting' }));

            const pc = createPC(data.callId);
            localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('sdpOffer', { callId: data.callId, offer: { type: offer.type, sdp: offer.sdp } });
        };

        const onSdpOffer = async (data: { callId: string; offer: RTCSessionDescriptionInit }) => {
            if (callStateRef.current.status !== 'connecting') return;

            const pc = createPC(data.callId);
            localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));

            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('sdpAnswer', { callId: data.callId, answer: { type: answer.type, sdp: answer.sdp } });
        };

        const onSdpAnswer = async (data: { callId: string; answer: RTCSessionDescriptionInit }) => {
            await pcRef.current?.setRemoteDescription(new RTCSessionDescription(data.answer));
        };

        const onIceCandidate = async (data: { callId: string; candidate: RTCIceCandidateInit }) => {
            try { await pcRef.current?.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch {}
        };

        const onCallRejected = () => {
            cleanup();
            setCallState({ status: 'ended', endReason: 'rejected' });
            setTimeout(() => setCallState({ status: 'idle' }), 2500);
        };

        const onCallEnded = () => {
            cleanup();
            setCallState({ status: 'ended', endReason: 'ended' });
            setTimeout(() => setCallState({ status: 'idle' }), 2500);
        };

        const onCallBusy = () => {
            cleanup();
            setCallState({ status: 'ended', endReason: 'busy' });
            setTimeout(() => setCallState({ status: 'idle' }), 2500);
        };

        socket.on('incomingCall',   onIncomingCall);
        socket.on('callAccepted',   onCallAccepted);
        socket.on('sdpOffer',       onSdpOffer);
        socket.on('sdpAnswer',      onSdpAnswer);
        socket.on('iceCandidate',   onIceCandidate);
        socket.on('callRejected',   onCallRejected);
        socket.on('callEnded',      onCallEnded);
        socket.on('callBusy',       onCallBusy);

        return () => {
            socket.off('incomingCall',   onIncomingCall);
            socket.off('callAccepted',   onCallAccepted);
            socket.off('sdpOffer',       onSdpOffer);
            socket.off('sdpAnswer',      onSdpAnswer);
            socket.off('iceCandidate',   onIceCandidate);
            socket.off('callRejected',   onCallRejected);
            socket.off('callEnded',      onCallEnded);
            socket.off('callBusy',       onCallBusy);
        };
    }, [socket, createPC, cleanup]);

    useEffect(() => () => cleanup(), [cleanup]);

    return {
        callState, localStream, remoteStream,
        isMuted, isCameraOff,
        startCall, acceptCall, rejectCall, endCall,
        toggleMute, toggleCamera,
    };
};