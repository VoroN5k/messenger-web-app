// AES-256-GCM media encryption for E2E file/audio messages.
// The actual file is encrypted with a random one-time key (WebCrypto, hardware AES-NI).
// Only the 44-byte key+iv bundle travels through the Double Ratchet session (message.content).
// This avoids routing multi-MB buffers through the WASM boundary and keeps DR ordering intact.

export function b64Enc(buf: Uint8Array | ArrayBuffer): string {
    const a = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    return btoa(String.fromCharCode(...a))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function b64Dec(s: string): Uint8Array {
    const p = s.replace(/-/g, '+').replace(/_/g, '/');
    const r = atob(p.padEnd(p.length + (4 - p.length % 4) % 4, '='));
    const b = new Uint8Array(r.length);
    for (let i = 0; i < r.length; i++) b[i] = r.charCodeAt(i);
    return b;
}

export interface EncryptedMedia {
    encryptedBlob: Blob;
    key: Uint8Array; // 32 bytes AES-256
    iv:  Uint8Array; // 12 bytes GCM nonce
}

export async function encryptMedia(data: ArrayBuffer | Blob): Promise<EncryptedMedia> {
    const key = crypto.getRandomValues(new Uint8Array(32)) as Uint8Array<ArrayBuffer>;
    const iv  = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
    const cryptoKey = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
    const plaintext = data instanceof Blob ? await data.arrayBuffer() : data;
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plaintext);
    return { encryptedBlob: new Blob([ct], { type: 'application/octet-stream' }), key, iv };
}

export async function decryptMedia(
    encryptedData: ArrayBuffer,
    key: Uint8Array,
    iv: Uint8Array,
): Promise<ArrayBuffer> {
    const cryptoKey = await crypto.subtle.importKey(
        'raw', key as Uint8Array<ArrayBuffer>, 'AES-GCM', false, ['decrypt'],
    );
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> }, cryptoKey, encryptedData);
}

// Wire: key(32) || iv(12) = 44 bytes
export function packMediaKey(key: Uint8Array, iv: Uint8Array): Uint8Array {
    const out = new Uint8Array(44);
    out.set(key, 0);
    out.set(iv, 32);
    return out;
}

export function unpackMediaKey(buf: Uint8Array): { key: Uint8Array; iv: Uint8Array } {
    return { key: buf.slice(0, 32), iv: buf.slice(32, 44) };
}

// Prefix used in message.content to distinguish media-key payloads from plain text
export const MEDIA_KEY_PREFIX = 'mk:';
