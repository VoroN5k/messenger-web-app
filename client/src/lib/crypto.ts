const ALGO = 'X25519';

export async function generateKeyPair(): Promise<{
    publicKey: string, // base64url - encoded, sent to server
    privateKey: CryptoKey; // remains in memory, never sent to server
}> {
    const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'X25519' },
        true, // extractable - true only for saving in IndexedDB
        ['deriveKey', 'deriveBits']
    );

    const rawPublic = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    return {
        publicKey: bufToBase64url(rawPublic),
        privateKey: keyPair.privateKey,
    };
}

export async function deriveSharedKey(
    myPrivateKey: CryptoKey,
    theirPublicKeyB64: string,
): Promise<CryptoKey> {
    const rawPublic = base64urlToBuf(theirPublicKeyB64);
    const theirPubKey = await crypto.subtle.importKey(
        'raw',
        rawPublic,
        { name: 'ECDH', namedCurve: 'X25519' },
        false,
        [],
    );

    // ECDH → 32 bits → HKDF → AES-256-GCM key
    const sharedBits = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: theirPubKey },
        myPrivateKey,
        256,
    );

    const hkdfKey = await crypto.subtle.importKey(
        'raw', sharedBits, 'HKDF', false, ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: new Uint8Array(32), // fixed salt (not recommended for production, but fine for this demo)
            info: new TextEncoder().encode('messenger-e2e-v1'),
        },
        hkdfKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

// Encrypt
export async function encryptMessage(
    aesKey: CryptoKey,
    plaintext: string,
): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        encoded,
    );

    // Формат: base64(iv || ciphertext) - iv завжди 12 байт
    const combined = new Uint8Array(12 + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), 12);
    return bufToBase64url(combined.buffer as ArrayBuffer);
}

// Decrypt
export async function decryptMessage(
    aesKey:     CryptoKey,
    ciphertext: string,
): Promise<string> {
    const combined = new Uint8Array(base64urlToBuf(ciphertext));
    const iv         = combined.slice(0, 12);
    const data       = combined.slice(12);

    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        data.buffer as ArrayBuffer,
    );
    return new TextDecoder().decode(plaintext);
}

// ── Key persistence в IndexedDB ───────────────────────────────────────────────
// Приватний ключ зберігаю як non-exportable CryptoKey в IndexedDB
// Браузер шифрує IndexedDB своїм профільним ключем
const DB_NAME = 'messenger-keys';
const STORE_NAME = 'keypairs';

function openDB(): Promise<IDBDatabase> {
    return new Promise((res, rej) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            (e.target as IDBOpenDBRequest).result.createObjectStore(STORE_NAME);
        };
        req.onsuccess = (e) => res((e.target as IDBOpenDBRequest).result);
        req.onerror = (e) => rej((e.target as IDBOpenDBRequest).error);
    });
}

export async function savePrivateKey(userId: number, key: CryptoKey): Promise<void> {
    const db = await openDB();
    await new Promise<void>((res, rej) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).put(key, `privkey_${userId}`)
        req.onsuccess = () => res();
        req.onerror = (e) => rej(req.error);
    });
}

export async function loadPrivateKey(userId: number): Promise<CryptoKey | null> {
    const db = await openDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(`privkey_${userId}`);
        req.onsuccess = () => res(req.result ?? null);
        req.onerror = (e) => rej(req.error);
    });
}

// ── Helpers ────────────────────────────────────────────────────────────────
function bufToBase64url(buf: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlToBuf(b64: string): ArrayBuffer {
    const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
    const raw    = atob(padded.padEnd(padded.length + (4 - padded.length % 4) % 4, '='));
    const buf    = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    return buf.buffer as ArrayBuffer;
}