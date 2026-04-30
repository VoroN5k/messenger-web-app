'use client';

/**
 * useDeviceSync — VSP-1 device history transfer over WebRTC DataChannel.
 *
 * Four-step signaling protocol (via NestJS Socket.io):
 *   1. Source emits  deviceSyncStart({ sessionId, ekSource, sdpOffer })
 *   2. Target emits  deviceSyncJoin({ sessionId, ekTarget })
 *      Server → Target: deviceSyncOffer({ ekSource, sdpOffer })
 *      Server → Source: deviceSyncPeerJoined({ ekTarget })
 *   3. Target emits  deviceSyncRelayAnswer({ sessionId, sdpAnswer })
 *      Server → Source: deviceSyncPeerAnswer({ sdpAnswer })
 *   4. Both exchange ICE via deviceSyncIce → DataChannel opens → VSP-1 transfer.
 *
 * OTP never leaves the device. Server cannot derive the VSP-1 session key.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import QRCode from 'qrcode';
import { wasm, zeroize } from '@/src/lib/cryptoWorkerClient';
import {
    countSyncRecords,
    exportSyncRecords,
    importSyncRecord,
} from '@/src/lib/cryptoDb';

// ── Public types ──────────────────────────────────────────────────────────────

export type SyncPhase =
    | 'idle'
    | 'generating'    // source: building QR + WebRTC offer
    | 'waiting_peer'  // source: QR visible, awaiting scan
    | 'handshaking'   // both: WebRTC + VSP-1 key derivation
    | 'transferring'  // source streaming | target receiving
    | 'verifying'     // target: manifest integrity check
    | 'done'
    | 'error';

export interface DeviceSyncState {
    phase:       SyncPhase;
    qrDataUrl:   string | null;
    progress:    number;   // 0–1
    transferred: number;   // records sent / received
    total:       number;   // estimated total records
    error:       string | null;
}

// ── Internal constants ────────────────────────────────────────────────────────

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

// DataChannel flow-control thresholds
const DC_BUFFER_HIGH = 4 * 1024 * 1024; // 4 MB — pause sending
const DC_BUFFER_LOW  = 256 * 1024;       // 256 KB — resume sending

// DataChannel frame type bytes
const MSG_CHUNK    = 0x01;
const MSG_MANIFEST = 0x02;

const QR_PREFIX         = 'vesper-sync://';
const MIN_FREE_BYTES    = 50 * 1024 * 1024; // 50 MB minimum on target

const INITIAL: DeviceSyncState = {
    phase: 'idle', qrDataUrl: null,
    progress: 0, transferred: 0, total: 0, error: null,
};

// ── Binary helpers ────────────────────────────────────────────────────────────

function uint8ToHex(b: Uint8Array): string {
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

function toB64Url(b: Uint8Array): string {
    return btoa(String.fromCharCode(...b))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromB64Url(s: string): Uint8Array {
    const p = s.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(p.padEnd(p.length + (4 - (p.length % 4)) % 4, '=')), c => c.charCodeAt(0));
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    return new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
}

/** Convert a 32-bit sequence number to an 8-byte big-endian buffer (u64, upper half zero). */
function seqToU64BE(n: number): Uint8Array {
    const b = new Uint8Array(8);
    b[4] = (n >>> 24) & 0xff;
    b[5] = (n >>> 16) & 0xff;
    b[6] = (n >>>  8) & 0xff;
    b[7] =  n         & 0xff;
    return b;
}

/** Read the 32-bit seq from a u64 BE buffer (assumes upper 4 bytes are zero). */
function u64BEToSeq(b: Uint8Array, offset: number): number {
    return ((b[offset + 4] << 24) | (b[offset + 5] << 16) | (b[offset + 6] << 8) | b[offset + 7]) >>> 0;
}

/** Constant-time byte equality — prevents timing side-channels in manifest verify. */
function timingSafeEq(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
}

/** Block until DataChannel buffer drops below DC_BUFFER_LOW. */
function drainDC(dc: RTCDataChannel): Promise<void> {
    if (dc.bufferedAmount <= DC_BUFFER_HIGH) return Promise.resolve();
    return new Promise(resolve => {
        dc.bufferedAmountLowThreshold = DC_BUFFER_LOW;
        const h = () => { dc.removeEventListener('bufferedamountlow', h); resolve(); };
        dc.addEventListener('bufferedamountlow', h);
    });
}

/** Encode a DataChannel frame: type(1) || seq(4 BE) || payload */
function encodeFrame(type: number, seq: number, payload: Uint8Array): ArrayBuffer {
    const out = new Uint8Array(5 + payload.length);
    out[0] = type;
    out[1] = (seq >>> 24) & 0xff;
    out[2] = (seq >>> 16) & 0xff;
    out[3] = (seq >>>  8) & 0xff;
    out[4] =  seq         & 0xff;
    out.set(payload, 5);
    return out.buffer;
}

/** Decode a DataChannel frame. Returns null if buffer is malformed. */
function decodeFrame(buf: ArrayBuffer): { type: number; seq: number; data: Uint8Array } | null {
    if (buf.byteLength < 5) return null;
    const v    = new DataView(buf);
    const type = v.getUint8(0);
    const seq  = v.getUint32(1, false);
    return { type, seq, data: new Uint8Array(buf, 5) };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDeviceSync(
    socket: ReturnType<typeof import('socket.io-client').io> | null,
) {
    const [state, setState] = useState<DeviceSyncState>(INITIAL);

    // Volatile refs — mutations don't trigger re-render
    const pcRef        = useRef<RTCPeerConnection | null>(null);
    const dcRef        = useRef<RTCDataChannel | null>(null);
    const iceBufRef    = useRef<RTCIceCandidateInit[]>([]);
    const remoteSetRef = useRef(false);
    const abortedRef   = useRef(false);
    const sessionRef   = useRef<{
        sessionId: string;
        otp:       Uint8Array;  // 16 bytes — OTP from QR
        secret:    Uint8Array;  // 32 bytes — ephemeral X25519 secret
        ekPubB64:  string;      // base64url ephemeral public key (our own)
        keys:      Uint8Array | null; // 64 bytes — derived after peer key exchange
    } | null>(null);

    const patch = useCallback(
        (p: Partial<DeviceSyncState>) => setState(prev => ({ ...prev, ...p })),
        [],
    );

    // ── Cleanup ───────────────────────────────────────────────────────────────

    const cleanup = useCallback(() => {
        abortedRef.current = true;
        dcRef.current?.close();
        pcRef.current?.close();
        dcRef.current     = null;
        pcRef.current     = null;
        iceBufRef.current  = [];
        remoteSetRef.current = false;
        const s = sessionRef.current;
        if (s) {
            zeroize(s.otp);
            zeroize(s.secret);
            if (s.keys) zeroize(s.keys);
            sessionRef.current = null;
        }
    }, []);

    const abort = useCallback(() => {
        const sid = sessionRef.current?.sessionId;
        cleanup();
        if (sid && socket) socket.emit('deviceSyncAbort', { sessionId: sid });
        setState(INITIAL);
    }, [cleanup, socket]);

    // ── WebRTC helpers ────────────────────────────────────────────────────────

    const flushIce = useCallback(async () => {
        const pc = pcRef.current;
        if (!pc || !remoteSetRef.current) return;
        for (const c of iceBufRef.current.splice(0)) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
        }
    }, []);

    const buildPC = useCallback((sessionId: string): RTCPeerConnection => {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        pc.onicecandidate = ({ candidate }) => {
            if (candidate && socket) {
                socket.emit('deviceSyncIce', { sessionId, candidate: candidate.toJSON() });
            }
        };

        pc.oniceconnectionstatechange = () => {
            const s = pc.iceConnectionState;
            if (s === 'failed') pc.restartIce?.();
            if ((s === 'disconnected' || s === 'closed') && !abortedRef.current) {
                patch({ phase: 'error', error: 'WebRTC-з\'єднання перервано' });
                cleanup();
            }
        };

        pcRef.current = pc;
        remoteSetRef.current = false;
        return pc;
    }, [socket, patch, cleanup]);

    // ── Source: stream all IDB records ────────────────────────────────────────

    const runSourceTransfer = useCallback(async (
        dc: RTCDataChannel,
        keys: Uint8Array,
    ) => {
        const macKey = keys.slice(32, 64);

        const total = await countSyncRecords();
        patch({ phase: 'transferring', total, transferred: 0, progress: 0 });

        // Pre-allocate manifest buffers (upper-bounded by total)
        const manifestIds    = new Uint8Array(total * 8);
        const manifestHashes = new Uint8Array(total * 32);
        let seq = 0;

        for await (const { payload } of exportSyncRecords()) {
            if (abortedRef.current) return;

            await drainDC(dc);
            if (abortedRef.current) return;

            // Hash plaintext before encryption for manifest
            const hash = await sha256(payload);
            manifestIds.set(seqToU64BE(seq), seq * 8);
            manifestHashes.set(hash, seq * 32);

            const { sealed } = await wasm.syncSealChunk(keys, seq, payload);
            dc.send(encodeFrame(MSG_CHUNK, seq, sealed));
            seq++;

            patch({ transferred: seq, progress: total > 0 ? seq / total : 0 });
        }

        if (abortedRef.current) return;

        // Build + seal the HMAC-signed manifest as the final message
        const { manifest } = await wasm.syncBuildManifest(
            macKey,
            manifestIds.slice(0, seq * 8),
            manifestHashes.slice(0, seq * 32),
        );
        const { sealed: sealedManifest } = await wasm.syncSealChunk(keys, seq, manifest);
        dc.send(encodeFrame(MSG_MANIFEST, seq, sealedManifest));
    }, [patch]);

    // ── Target: receive chunks, verify manifest ───────────────────────────────

    const runTargetReceive = useCallback((
        dc: RTCDataChannel,
        keys: Uint8Array,
    ): Promise<void> => {
        const macKey = keys.slice(32, 64);
        const receivedHashes = new Map<number, Uint8Array>(); // seq → sha256

        return new Promise<void>((resolve, reject) => {
            // settled prevents double-resolution from the dc.onclose race:
            // PC closes its DC right after sending the manifest, which can trigger
            // dc.onclose on the target while onmessage is still processing the manifest.
            let settled = false;
            const safeResolve = () => { if (!settled) { settled = true; resolve(); } };
            const safeReject  = (e: Error) => { if (!settled) { settled = true; reject(e); } };

            dc.onmessage = async (ev: MessageEvent<ArrayBuffer>) => {
                if (abortedRef.current) { safeReject(new Error('aborted')); return; }
                const frame = decodeFrame(ev.data);
                if (!frame) return;

                try {
                    if (frame.type === MSG_CHUNK) {
                        const { plain } = await wasm.syncOpenChunk(keys, frame.seq, frame.data);
                        receivedHashes.set(frame.seq, await sha256(plain));
                        await importSyncRecord(plain);
                        patch({
                            transferred: receivedHashes.size,
                            progress: 0,
                        });

                    } else if (frame.type === MSG_MANIFEST) {
                        patch({ phase: 'verifying' });

                        const { plain: rawManifest } = await wasm.syncOpenChunk(
                            keys, frame.seq, frame.data,
                        );
                        const { entries } = await wasm.syncVerifyManifest(macKey, rawManifest);

                        if (entries.length % 40 !== 0) {
                            safeReject(new Error('Невірний формат маніфесту')); return;
                        }
                        const count = entries.length / 40;

                        if (receivedHashes.size !== count) {
                            safeReject(new Error(
                                `Маніфест: очікували ${count} записів, отримали ${receivedHashes.size}`,
                            ));
                            return;
                        }

                        for (let i = 0; i < count; i++) {
                            const off          = i * 40;
                            const seq          = u64BEToSeq(entries, off);
                            const expectedHash = entries.slice(off + 8, off + 40);
                            const receivedHash = receivedHashes.get(seq);
                            if (!receivedHash || !timingSafeEq(expectedHash, receivedHash)) {
                                safeReject(new Error(`Порушення цілісності на записі ${seq}`));
                                return;
                            }
                        }

                        safeResolve();
                    }
                } catch (e) {
                    safeReject(e as Error);
                }
            };

            dc.onerror = () => safeReject(new Error('DataChannel помилка'));
            dc.onclose = () => {
                if (!abortedRef.current) safeReject(new Error('DataChannel закрито передчасно'));
            };
        });
    }, [patch]);

    // ── Source public API ─────────────────────────────────────────────────────

    const startAsSource = useCallback(async () => {
        if (state.phase !== 'idle' || !socket) return;
        abortedRef.current = false;
        patch({ phase: 'generating', error: null });

        try {
            // 1. Generate OTP + sessionId + ephemeral keypair (all in WASM worker)
            const [{ otp }, { sessionId: sidBytes }, { keypair }] = await Promise.all([
                wasm.syncGenerateOtp(),
                wasm.syncGenerateSessionId(),
                wasm.syncGenerateKeypair(),
            ]);

            const sessionId = uint8ToHex(sidBytes);
            const secret    = keypair.slice(0, 32);
            const ekPubB64  = toB64Url(keypair.slice(32, 64));
            sessionRef.current = { sessionId, otp, secret, ekPubB64, keys: null };

            // 2. Build QR: vesper-sync://<sessionId_hex>?otp=<otp_b64url>
            const qrContent = `${QR_PREFIX}${sessionId}?otp=${toB64Url(otp)}`;
            const qrDataUrl = await QRCode.toDataURL(qrContent, {
                width: 280, margin: 2, errorCorrectionLevel: 'M',
                color: { dark: '#0f172a', light: '#ffffff' },
            });

            // 3. Create RTCPeerConnection + reliable ordered DataChannel
            const pc = buildPC(sessionId);
            const dc = pc.createDataChannel('sync', { ordered: true });
            dc.binaryType = 'arraybuffer';
            dcRef.current = dc;

            // 4. Create SDP offer and register session on server
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            socket.emit('deviceSyncStart', {
                sessionId,
                ekSource: ekPubB64,
                sdpOffer: { type: offer.type, sdp: offer.sdp },
            });

            patch({ phase: 'waiting_peer', qrDataUrl });

            // 5. DataChannel opens after full WebRTC handshake → start streaming
            dc.onopen = async () => {
                if (abortedRef.current) return;
                const sess = sessionRef.current;
                if (!sess?.keys) {
                    patch({ phase: 'error', error: 'Ключі не виведені до відкриття DataChannel' });
                    cleanup();
                    return;
                }
                try {
                    await runSourceTransfer(dc, sess.keys);
                    if (!abortedRef.current) patch({ phase: 'done', progress: 1 });
                } catch (e: unknown) {
                    if (!abortedRef.current) {
                        patch({ phase: 'error', error: (e as Error).message });
                    }
                } finally {
                    cleanup();
                }
            };

            dc.onerror = () => {
                if (!abortedRef.current) patch({ phase: 'error', error: 'DataChannel помилка' });
                cleanup();
            };

        } catch (e: unknown) {
            patch({ phase: 'error', error: (e as Error).message });
            cleanup();
        }
    }, [state.phase, socket, patch, cleanup, buildPC, runSourceTransfer]);

    // ── Target public API ─────────────────────────────────────────────────────

    const startAsTarget = useCallback(async (qrContent: string) => {
        if (state.phase !== 'idle' || !socket) return;
        abortedRef.current = false;
        patch({ phase: 'generating', error: null });

        try {
            // 1. Parse QR content: vesper-sync://<sessionId>?otp=<otp_b64url>
            if (!qrContent.startsWith(QR_PREFIX)) throw new Error('Невірний QR-код');
            const rest      = qrContent.slice(QR_PREFIX.length);
            const qmark     = rest.indexOf('?');
            const sessionId = qmark === -1 ? rest : rest.slice(0, qmark);
            const params    = new URLSearchParams(qmark === -1 ? '' : rest.slice(qmark + 1));
            const otpStr    = params.get('otp');
            if (!otpStr || !/^[0-9a-f]{32}$/i.test(sessionId)) {
                throw new Error('Невірний формат QR-коду');
            }
            const otp = fromB64Url(otpStr);
            if (otp.length !== 16) throw new Error('OTP невірного розміру');

            // 2. Storage quota check before accepting gigabytes of data
            if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
                const { quota = 0, usage = 0 } = await navigator.storage.estimate();
                const free = quota - usage;
                if (free < MIN_FREE_BYTES) {
                    throw new Error(
                        `Недостатньо місця: ${Math.round(free / 1024 / 1024)} МБ вільно, потрібно мінімум 50 МБ`,
                    );
                }
            }

            // 3. Generate ephemeral keypair
            const { keypair } = await wasm.syncGenerateKeypair();
            const secret   = keypair.slice(0, 32);
            const ekPubB64 = toB64Url(keypair.slice(32, 64));
            sessionRef.current = { sessionId, otp, secret, ekPubB64, keys: null };

            // 4. Create RTCPeerConnection (DataChannel created by source)
            const pc = buildPC(sessionId);

            pc.ondatachannel = ({ channel: dc }) => {
                dc.binaryType = 'arraybuffer';
                dcRef.current = dc;

                dc.onopen = async () => {
                    if (abortedRef.current) return;
                    const sess = sessionRef.current;
                    if (!sess?.keys) {
                        patch({ phase: 'error', error: 'Ключі не виведені до відкриття DataChannel' });
                        cleanup();
                        return;
                    }
                    try {
                        await runTargetReceive(dc, sess.keys);
                        if (!abortedRef.current) patch({ phase: 'done', progress: 1 });
                    } catch (e: unknown) {
                        if (!abortedRef.current) {
                            patch({ phase: 'error', error: (e as Error).message });
                        }
                    } finally {
                        cleanup();
                    }
                };
            };

            // 5. Join session — server will respond with deviceSyncOffer
            patch({ phase: 'handshaking' });
            socket.emit('deviceSyncJoin', { sessionId, ekTarget: ekPubB64 });

        } catch (e: unknown) {
            patch({ phase: 'error', error: (e as Error).message });
            cleanup();
        }
    }, [state.phase, socket, patch, cleanup, buildPC, runTargetReceive]);

    // ── Socket event listeners ────────────────────────────────────────────────

    useEffect(() => {
        if (!socket) return;

        // Source: target joined → derive keys, wait for SDP answer
        const onPeerJoined = async (data: { sessionId: string; ekTarget: string }) => {
            const sess = sessionRef.current;
            const pc   = pcRef.current;
            if (!sess || !pc || sess.sessionId !== data.sessionId || abortedRef.current) return;

            patch({ phase: 'handshaking' });
            try {
                const peerPub = fromB64Url(data.ekTarget);
                const { keys } = await wasm.syncDeriveKeys(sess.secret, peerPub, sess.otp);
                sess.keys = keys;
                // SDP answer arrives in onPeerAnswer below
            } catch (e: unknown) {
                patch({ phase: 'error', error: (e as Error).message });
                cleanup();
            }
        };

        // Source: target's SDP answer arrives → complete WebRTC handshake
        const onPeerAnswer = async (data: { sessionId: string; sdpAnswer: RTCSessionDescriptionInit }) => {
            const sess = sessionRef.current;
            const pc   = pcRef.current;
            if (!sess || !pc || sess.sessionId !== data.sessionId || abortedRef.current) return;

            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdpAnswer));
                remoteSetRef.current = true;
                await flushIce();
            } catch (e: unknown) {
                patch({ phase: 'error', error: (e as Error).message });
                cleanup();
            }
        };

        // Target: offer from source → derive keys, set remote desc, answer
        const onOffer = async (data: {
            sessionId: string;
            ekSource: string;
            sdpOffer: RTCSessionDescriptionInit;
        }) => {
            const sess = sessionRef.current;
            const pc   = pcRef.current;
            if (!sess || !pc || sess.sessionId !== data.sessionId || abortedRef.current) return;

            try {
                // Derive VSP-1 keys: X25519(sk_t, EK_S) → HKDF(otp, dh)
                const peerPub = fromB64Url(data.ekSource);
                const { keys } = await wasm.syncDeriveKeys(sess.secret, peerPub, sess.otp);
                sess.keys = keys;

                await pc.setRemoteDescription(new RTCSessionDescription(data.sdpOffer));
                remoteSetRef.current = true;
                await flushIce();

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                socket.emit('deviceSyncRelayAnswer', {
                    sessionId: data.sessionId,
                    sdpAnswer: { type: answer.type, sdp: answer.sdp },
                });
            } catch (e: unknown) {
                patch({ phase: 'error', error: (e as Error).message });
                cleanup();
            }
        };

        // Both: relay ICE candidates
        const onIce = async (data: { sessionId: string; candidate: RTCIceCandidateInit }) => {
            if (sessionRef.current?.sessionId !== data.sessionId || !data.candidate) return;
            if (!remoteSetRef.current) {
                iceBufRef.current.push(data.candidate);
                return;
            }
            try {
                await pcRef.current?.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch {}
        };

        // Both: session aborted by server or peer
        const onAborted = (data: { sessionId: string; reason: string }) => {
            if (sessionRef.current?.sessionId !== data.sessionId) return;
            cleanup();
            const msgs: Record<string, string> = {
                peer_disconnected: 'Інший пристрій від\'єднався',
                peer_aborted:      'Інший пристрій скасував синхронізацію',
                self_aborted:      'Синхронізацію скасовано',
            };
            setState(prev =>
                prev.phase !== 'idle'
                    ? { ...INITIAL, phase: 'error', error: msgs[data.reason] ?? 'Скасовано' }
                    : prev,
            );
        };

        // Both: server validation error
        const onError = (data: { reason: string }) => {
            const msgs: Record<string, string> = {
                invalid_session_id: 'Невірний ID сесії',
                session_exists:     'Сесія вже існує — спробуйте знову',
                not_found:          'Сесію не знайдено або час вийшов',
                not_available:      'До сесії вже підключено інший пристрій',
            };
            patch({ phase: 'error', error: msgs[data.reason] ?? 'Помилка сервера' });
            cleanup();
        };

        socket.on('deviceSyncPeerJoined', onPeerJoined);
        socket.on('deviceSyncPeerAnswer',  onPeerAnswer);
        socket.on('deviceSyncOffer',       onOffer);
        socket.on('deviceSyncIce',         onIce);
        socket.on('deviceSyncAborted',     onAborted);
        socket.on('deviceSyncError',       onError);

        return () => {
            socket.off('deviceSyncPeerJoined', onPeerJoined);
            socket.off('deviceSyncPeerAnswer',  onPeerAnswer);
            socket.off('deviceSyncOffer',       onOffer);
            socket.off('deviceSyncIce',         onIce);
            socket.off('deviceSyncAborted',     onAborted);
            socket.off('deviceSyncError',       onError);
        };
    }, [socket, patch, cleanup, flushIce]);

    // Cleanup on unmount
    useEffect(() => () => { cleanup(); }, [cleanup]);

    return { state, startAsSource, startAsTarget, abort };
}
