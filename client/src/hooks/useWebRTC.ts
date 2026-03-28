import { useState, useEffect, useRef, useCallback } from 'react';

export type CallType   = 'audio' | 'video';
export type CallStatus = 'idle' | 'calling' | 'incoming' | 'connecting' | 'active' | 'ended';
export type EndReason  = 'rejected' | 'ended' | 'no-answer' | 'error' | 'busy';

export interface IncomingCallData {
    callId:          string;
    conversationId:  number;
    callerId:        number;
    callerName:      string;
    callerAvatar:    string | null;
    callType:        CallType;
}

export interface CallState {
    status:          CallStatus;
    callId?:         string;
    conversationId?: number;
    targetUserId?:   number;
    callType?:       CallType;
    incomingData?:   IncomingCallData;
    startedAt?:      number;
    endReason?:      EndReason;
}

const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    {
        urls: [
            'turn:global.relay.metered.ca:80',
            'turn:global.relay.metered.ca:80?transport=tcp',
            'turn:global.relay.metered.ca:443',
            'turns:global.relay.metered.ca:443?transport=tcp',
        ],
        username:   'ae9cc6ddc8b03bb71663a872',
        credential: 'qjgGIvEE2jLHOFgD',
    },
];

function createRingtone() {
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
            ctx = new AC(); playing = true; ring();
        },
        stop: () => {
            playing = false;
            ctx?.close().catch(() => {});
            ctx = null;
        },
    };
}

export const useWebRTC = (socket: any, currentUserId: number | undefined) => {
    const [callState,      setCallState]      = useState<CallState>({ status: 'idle' });
    const [localStream,    setLocalStream]    = useState<MediaStream | null>(null);
    const [remoteStream,   setRemoteStream]   = useState<MediaStream | null>(null);
    const [isMuted,        setIsMuted]        = useState(false);
    const [isCameraOff,    setIsCameraOff]    = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);

    const pcRef              = useRef<RTCPeerConnection | null>(null);
    const localStreamRef     = useRef<MediaStream | null>(null);
    const screenStreamRef    = useRef<MediaStream | null>(null);
    const callStateRef       = useRef<CallState>({ status: 'idle' });
    const ringTimeoutRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ringtone           = useRef(createRingtone());
    const iceCandidateBuffer = useRef<RTCIceCandidateInit[]>([]);
    const remoteDescSet      = useRef(false);

    useEffect(() => { callStateRef.current = callState; }, [callState]);

    const flushIceCandidates = useCallback(async () => {
        const pc = pcRef.current;
        if (!pc) return;
        const buffered = iceCandidateBuffer.current.splice(0);
        for (const candidate of buffered) {
            try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
        }
    }, []);

    const cleanup = useCallback(() => {
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        screenStreamRef.current?.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
        setLocalStream(null);
        setRemoteStream(null);
        setIsMuted(false);
        setIsCameraOff(false);
        setIsScreenSharing(false);

        if (pcRef.current) {
            pcRef.current.ontrack                    = null;
            pcRef.current.onicecandidate             = null;
            pcRef.current.oniceconnectionstatechange = null;
            pcRef.current.close();
            pcRef.current = null;
        }
        iceCandidateBuffer.current = [];
        remoteDescSet.current      = false;
        ringtone.current.stop();
        if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
    }, []);

    const createPC = useCallback((callId: string): RTCPeerConnection => {
        const pc       = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        const remoteMS = new MediaStream();

        pc.ontrack = ({ track }) => {
            remoteMS.addTrack(track);
            setRemoteStream(new MediaStream(remoteMS.getTracks()));
        };

        pc.onicecandidate = ({ candidate }) => {
            if (candidate) socket?.emit('iceCandidate', { callId, candidate: candidate.toJSON() });
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
            if (s === 'failed') pc.restartIce?.();
            if (s === 'disconnected' || s === 'closed') {
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

        pcRef.current         = pc;
        remoteDescSet.current = false;
        return pc;
    }, [socket, cleanup]);

    const getMedia = useCallback(async (callType: CallType): Promise<MediaStream> => {
        if (callType === 'video') {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                    video: true,
                });
                localStreamRef.current = stream;
                setLocalStream(stream);
                return stream;
            } catch (videoErr: any) {
                const isNotFound = videoErr.name === 'NotFoundError' || videoErr.name === 'DevicesNotFoundError';
                if (isNotFound) {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                        video: false,
                    });
                    localStreamRef.current = stream;
                    setLocalStream(stream);
                    setCallState(prev => ({ ...prev, callType: 'audio' }));
                    callStateRef.current = { ...callStateRef.current, callType: 'audio' };
                    return stream;
                }
                throw videoErr;
            }
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
    }, []);

    // Screen sharing

    const startScreenShare = useCallback(async () => {
        const pc = pcRef.current;
        if (!pc || callStateRef.current.status !== 'active') return;

        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 30 },
                audio: false, // system audio can be included but often causes echo
            });
            screenStreamRef.current = screenStream;

            const screenTrack = screenStream.getVideoTracks()[0];
            if (!screenTrack) return;

            // Replace video sender track in peer connection
            const senders   = pc.getSenders();
            const videoSender = senders.find(s => s.track?.kind === 'video');

            if (videoSender) {
                await videoSender.replaceTrack(screenTrack);
            } else {
                pc.addTrack(screenTrack, screenStream);
            }

            // Update local stream displayed in PiP
            const newLocal = new MediaStream([
                ...(localStreamRef.current?.getAudioTracks() ?? []),
                screenTrack,
            ]);
            setLocalStream(newLocal);
            setIsScreenSharing(true);

            // Auto-stop when browser UI "stop sharing" button is pressed
            screenTrack.onended = () => {
                stopScreenShare();
            };
        } catch (err: any) {
            if (err.name !== 'NotAllowedError') {
                console.error('[WebRTC] screen share failed:', err);
            }
        }
    }, []);

    const stopScreenShare = useCallback(async () => {
        const pc = pcRef.current;
        if (!pc) return;

        screenStreamRef.current?.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;

        // Restore camera track
        const cameraTrack = localStreamRef.current?.getVideoTracks().find(t =>
            !t.label.toLowerCase().includes('screen'),
        );

        const senders     = pc.getSenders();
        const videoSender = senders.find(s => s.track?.kind === 'video');

        if (videoSender) {
            if (cameraTrack) {
                await videoSender.replaceTrack(cameraTrack).catch(() => {});
                setLocalStream(new MediaStream([
                    ...(localStreamRef.current?.getAudioTracks() ?? []),
                    cameraTrack,
                ]));
            } else {
                // No camera — turn off video sender
                await videoSender.replaceTrack(null).catch(() => {});
            }
        }

        setIsScreenSharing(false);
    }, []);

    const toggleScreenShare = useCallback(async () => {
        if (isScreenSharing) await stopScreenShare();
        else                 await startScreenShare();
    }, [isScreenSharing, startScreenShare, stopScreenShare]);

    // Call lifecycle

    const startCall = useCallback(async (conversationId: number, targetUserId: number, callType: CallType) => {
        if (!socket || !currentUserId) return;
        if (callStateRef.current.status !== 'idle') return;

        const callId = `${currentUserId}-${targetUserId}-${Date.now()}`;
        try {
            await getMedia(callType);
            setCallState({ status: 'calling', callId, conversationId, targetUserId, callType });
            socket.emit('callUser', { callId, conversationId, targetUserId, callType });

            ringTimeoutRef.current = setTimeout(() => {
                if (callStateRef.current.status === 'calling') {
                    socket.emit('callEnd', { callId, conversationId });
                    cleanup();
                    setCallState({ status: 'ended', endReason: 'no-answer' });
                    setTimeout(() => setCallState({ status: 'idle' }), 2000);
                }
            }, 45_000);
        } catch (err: any) {
            cleanup();
            const msg =
                err.name === 'NotFoundError'      ? 'Камеру не знайдено. Перевірте підключення.' :
                    err.name === 'NotAllowedError'    ? 'Немає дозволу на мікрофон/камеру.' :
                        err.name === 'NotReadableError'   ? 'Камера або мікрофон зайняті іншим додатком.' :
                            err.name === 'OverconstrainedError' ? 'Камера не підтримує потрібні параметри.' :
                                `Помилка медіа: ${err.message}`;
            alert(msg);
            setCallState({ status: 'idle' });
        }
    }, [socket, currentUserId, getMedia, cleanup]);

    const acceptCall = useCallback(async (asType?: CallType) => {
        const state = callStateRef.current;
        if (state.status !== 'incoming' || !socket) return;
        const { callId, conversationId, callType } = state.incomingData!;
        const mediaType = asType ?? callType;
        ringtone.current.stop();
        if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
        try {
            await getMedia(mediaType);
            const newState: CallState = { status: 'connecting', callId, conversationId, callType: mediaType };
            callStateRef.current = newState;
            setCallState(newState);
            socket.emit('callAccept', { callId, callType: mediaType });
        } catch {
            rejectCall();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, getMedia]);

    const rejectCall = useCallback(() => {
        const state = callStateRef.current;
        if (state.status !== 'incoming' || !socket) return;
        const { callId, conversationId } = state.incomingData!;
        socket.emit('callReject', { callId, conversationId });
        ringtone.current.stop();
        cleanup();
        setCallState({ status: 'idle' });
    }, [socket, cleanup]);

    const endCall = useCallback(() => {
        const state = callStateRef.current;
        if (state.status === 'idle') return;
        if (state.callId) socket?.emit('callEnd', { callId: state.callId, conversationId: state.conversationId });
        cleanup();
        setCallState({ status: 'ended', endReason: 'ended' });
        setTimeout(() => setCallState({ status: 'idle' }), 2000);
    }, [socket, cleanup]);

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

    // Socket events

    useEffect(() => {
        if (!socket) return;

        const onIncomingCall = (data: IncomingCallData) => {
            if (callStateRef.current.status !== 'idle') {
                socket.emit('callBusy', { callId: data.callId });
                return;
            }
            const newState: CallState = {
                status: 'incoming', callId: data.callId,
                conversationId: data.conversationId, callType: data.callType,
                incomingData: data,
            };
            callStateRef.current = newState;
            setCallState(newState);
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
            const newState = { ...callStateRef.current, status: 'connecting' as const };
            callStateRef.current = newState;
            setCallState(newState);
            const pc = createPC(data.callId);
            localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('sdpOffer', { callId: data.callId, offer: { type: offer.type, sdp: offer.sdp } });
        };

        const onSdpOffer = async (data: { callId: string; offer: RTCSessionDescriptionInit }) => {
            const state = callStateRef.current;
            if (state.status !== 'connecting' && state.status !== 'incoming') return;
            const pc = createPC(data.callId);
            localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            remoteDescSet.current = true;
            await flushIceCandidates();
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('sdpAnswer', { callId: data.callId, answer: { type: answer.type, sdp: answer.sdp } });
        };

        const onSdpAnswer = async (data: { callId: string; answer: RTCSessionDescriptionInit }) => {
            const pc = pcRef.current;
            if (!pc) return;
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            remoteDescSet.current = true;
            await flushIceCandidates();
        };

        const onIceCandidate = async (data: { callId: string; candidate: RTCIceCandidateInit }) => {
            if (!data.candidate) return;
            if (!remoteDescSet.current) { iceCandidateBuffer.current.push(data.candidate); return; }
            const pc = pcRef.current;
            if (!pc) return;
            try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch {}
        };

        const onCallRejected = () => { cleanup(); setCallState({ status: 'ended', endReason: 'rejected' }); setTimeout(() => setCallState({ status: 'idle' }), 2500); };
        const onCallEnded    = () => { cleanup(); setCallState({ status: 'ended', endReason: 'ended'    }); setTimeout(() => setCallState({ status: 'idle' }), 2500); };
        const onCallBusy     = () => { cleanup(); setCallState({ status: 'ended', endReason: 'busy'     }); setTimeout(() => setCallState({ status: 'idle' }), 2500); };

        socket.on('incomingCall', onIncomingCall);
        socket.on('callAccepted', onCallAccepted);
        socket.on('sdpOffer',     onSdpOffer);
        socket.on('sdpAnswer',    onSdpAnswer);
        socket.on('iceCandidate', onIceCandidate);
        socket.on('callRejected', onCallRejected);
        socket.on('callEnded',    onCallEnded);
        socket.on('callBusy',     onCallBusy);

        return () => {
            socket.off('incomingCall', onIncomingCall);
            socket.off('callAccepted', onCallAccepted);
            socket.off('sdpOffer',     onSdpOffer);
            socket.off('sdpAnswer',    onSdpAnswer);
            socket.off('iceCandidate', onIceCandidate);
            socket.off('callRejected', onCallRejected);
            socket.off('callEnded',    onCallEnded);
            socket.off('callBusy',     onCallBusy);
        };
    }, [socket, createPC, cleanup, flushIceCandidates]);

    useEffect(() => () => cleanup(), [cleanup]);

    return {
        callState, localStream, remoteStream,
        isMuted, isCameraOff, isScreenSharing,
        startCall, acceptCall, rejectCall, endCall,
        toggleMute, toggleCamera, toggleScreenShare,
    };
};