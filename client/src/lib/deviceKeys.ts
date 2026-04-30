// Per-device X3DH key pair — generated locally on each physical browser, never
// included in the PIN recovery blob. This guarantees each device gets a unique
// bundle and therefore a unique device ID, which is required for per-device
// message envelopes.
import { wasm, zeroize } from './cryptoWorkerClient';

const KEY = (userId: number) => `v3_device_keys_${userId}`;

export interface DeviceKeyPair {
    ikDhSecret: Uint8Array; // 32 — X25519 secret
    ikDhPub:    Uint8Array; // 32
    spkSecret:  Uint8Array; // 32 — signed prekey secret
    spkPub:     Uint8Array; // 32
    spkSig:     Uint8Array; // 64 — Ed25519 sig of spkPub by shared identity ikSign
}

function b64Enc(buf: Uint8Array): string {
    return btoa(String.fromCharCode(...buf))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64Dec(s: string): Uint8Array {
    const p = s.replace(/-/g, '+').replace(/_/g, '/');
    const r = atob(p.padEnd(p.length + (4 - p.length % 4) % 4, '='));
    const b = new Uint8Array(r.length);
    for (let i = 0; i < r.length; i++) b[i] = r.charCodeAt(i);
    return b;
}

// Returns the existing device key pair from localStorage, or generates and
// stores a fresh one. ikSignSeed is the shared identity signing seed, used
// to produce the SPK signature so the bundle can be verified against the
// user's public signing key.
export async function getOrCreateDeviceKeys(
    userId: number,
    ikSignSeed: Uint8Array,
): Promise<DeviceKeyPair> {
    if (typeof localStorage === 'undefined') throw new Error('localStorage unavailable');

    const stored = localStorage.getItem(KEY(userId));
    if (stored) {
        // packed: ikDhSecret(32)||ikDhPub(32)||spkSecret(32)||spkPub(32)||spkSig(64) = 192
        const buf = b64Dec(stored);
        return {
            ikDhSecret: buf.slice(0, 32),
            ikDhPub:    buf.slice(32, 64),
            spkSecret:  buf.slice(64, 96),
            spkPub:     buf.slice(96, 128),
            spkSig:     buf.slice(128, 192),
        };
    }

    const [ikKp, spkKp] = await Promise.all([
        wasm.generateKeyAgreementKeypair(),
        wasm.generateKeyAgreementKeypair(),
    ]);
    const ikDhSecret = ikKp.keypair.slice(0, 32);
    const ikDhPub    = ikKp.keypair.slice(32, 64);
    const spkSecret  = spkKp.keypair.slice(0, 32);
    const spkPub     = spkKp.keypair.slice(32, 64);
    zeroize(ikKp.keypair); zeroize(spkKp.keypair);

    const { sig: spkSig } = await wasm.sign(ikSignSeed, spkPub);

    const packed = new Uint8Array(192);
    packed.set(ikDhSecret, 0);
    packed.set(ikDhPub,    32);
    packed.set(spkSecret,  64);
    packed.set(spkPub,     96);
    packed.set(spkSig,     128);
    localStorage.setItem(KEY(userId), b64Enc(packed));
    packed.fill(0);

    return { ikDhSecret, ikDhPub, spkSecret, spkPub, spkSig };
}

export function clearDeviceKeys(userId: number): void {
    localStorage.removeItem(KEY(userId));
}
