// Read-only v1 WebCrypto decrypt. Never generates keys; only used to display old messages.
// v1 format: base64url(iv(12) || ciphertext)
// v1 shared key: ECDH(myPriv, theirPub) → HKDF-SHA256 → AES-256-GCM

export async function legacyDeriveSharedKey(
    myPrivateKey: CryptoKey,
    theirPublicKeyB64: string,
): Promise<CryptoKey> {
    const raw = b64ToBuf(theirPublicKeyB64);
    const theirPub = await crypto.subtle.importKey(
        'raw', raw, { name: 'X25519' }, false, [],
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'X25519', public: theirPub }, myPrivateKey, 256,
    );
    const hkdf = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: te('messenger-e2e-v1') },
        hkdf,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
    );
}

export async function legacyDecryptText(aesKey: CryptoKey, ciphertext: string): Promise<string | null> {
    try {
        const combined = new Uint8Array(b64ToBuf(ciphertext));
        const iv   = combined.slice(0, 12);
        const data = combined.slice(12);
        const pt   = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data);
        return new TextDecoder().decode(pt);
    } catch {
        return null;
    }
}

export async function legacyDecryptBinary(aesKey: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer | null> {
    try {
        const bytes = new Uint8Array(data);
        const pt = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: bytes.slice(0, 12) },
            aesKey,
            bytes.slice(12).buffer as ArrayBuffer,
        );
        return pt;
    } catch {
        return null;
    }
}

function te(s: string) { return new TextEncoder().encode(s); }
function b64ToBuf(s: string): ArrayBuffer {
    const p = s.replace(/-/g, '+').replace(/_/g, '/');
    const r = atob(p.padEnd(p.length + (4 - p.length % 4) % 4, '='));
    const b = new Uint8Array(r.length);
    for (let i = 0; i < r.length; i++) b[i] = r.charCodeAt(i);
    return b.buffer as ArrayBuffer;
}
