const KEY_VERSION = 'v4';
const KEY_VERSION_PREV = 'v3'

export async function generateKeyPair(): Promise<{
    publicKey: string;
    privateKey: CryptoKey;
}> {
    const keyPair = await crypto.subtle.generateKey(
        { name: 'X25519' },
        true,
        ['deriveKey', 'deriveBits']
    ) as unknown as CryptoKeyPair;

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
        { name: 'X25519' },
        false,
        [],
    );

    const sharedBits = await crypto.subtle.deriveBits(
        { name: 'X25519', public: theirPubKey },
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
            salt: new Uint8Array(32),
            info: new TextEncoder().encode('messenger-e2e-v1'),
        },
        hkdfKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

// Message ecrypt / decrypt
export async function encryptMessage(aesKey: CryptoKey, plaintext: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded);

    const combined = new Uint8Array(12 + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), 12);
    return bufToBase64url(combined.buffer as ArrayBuffer);
}

export async function decryptMessage(aesKey: CryptoKey, ciphertext: string): Promise<string> {
    const combined = new Uint8Array(base64urlToBuf(ciphertext));
    const iv   = combined.slice(0, 12);
    const data = combined.slice(12);

    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        data.buffer as ArrayBuffer,
    );
    return new TextDecoder().decode(plaintext);
}

// ── Binary file encryption ────────────────────────────────────────────────────
export async function encryptFile(aesKey: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv}, aesKey, data);
    const out = new Uint8Array(12 + encrypted.byteLength);
    out.set(iv, 0);
    out.set(new Uint8Array(encrypted), 12);
    return out.buffer as ArrayBuffer;
}

export async function decryptFile(aesKey: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
    const bytes = new Uint8Array(data);
    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);
    return crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        ciphertext.buffer as ArrayBuffer,
    ) as Promise<ArrayBuffer>;
}

const VAULT_LS_KEY = (userId: number) => `e2e_vault_${userId}`;

async function getOrCreateVaultKey(userId: number): Promise<CryptoKey> {
    const lsKey = VAULT_LS_KEY(userId);
    let secret = localStorage.getItem(lsKey);

    if(!secret) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        secret = bufToBase64url(bytes.buffer as ArrayBuffer);
        localStorage.setItem(lsKey, secret);
    }

    const raw = base64urlToBuf(secret);
    const hkdfKey = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);

    return crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: new TextEncoder().encode(`vault-v1-${userId}`),
            info: new TextEncoder().encode(`e2e-private-key-protection`),
        },
        hkdfKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

async function encryptKeyBytes(rawKey: ArrayBuffer, userId: number): Promise<ArrayBuffer> {
    const vaultKey = await getOrCreateVaultKey(userId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultKey, rawKey);

    const result = new Uint8Array(12 + cipher.byteLength);
    result.set(iv);
    result.set(new Uint8Array(cipher), 12);
    return result.buffer as ArrayBuffer;
}

async function decryptKeyBytes(
    encryptedData: ArrayBuffer,
    userId: number,
): Promise<ArrayBuffer> {
    const vaultKey = await getOrCreateVaultKey(userId);
    const bytes    = new Uint8Array(encryptedData);
    return crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes.slice(0, 12) },
        vaultKey,
        bytes.slice(12).buffer as ArrayBuffer,
    );
}

// Key persistence в IndexedDB
const DB_NAME    = 'messenger-keys';
const STORE_NAME = 'keypairs';

function openDB(): Promise<IDBDatabase> {
    return new Promise((res, rej) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            (e.target as IDBOpenDBRequest).result.createObjectStore(STORE_NAME);
        };
        req.onsuccess = (e) => res((e.target as IDBOpenDBRequest).result);
        req.onerror   = (e) => rej((e.target as IDBOpenDBRequest).error);
    });
}

function idbGet(db: IDBDatabase, key: string): Promise<unknown> {
    return new Promise((res, rej) => {
        const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
        req.onsuccess = () => res(req.result ?? null);
        req.onerror   = () => rej(req.error);
    });
}

function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
    return new Promise((res, rej) => {
        const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value, key);
        req.onsuccess = () => res();
        req.onerror   = () => rej(req.error);
    });
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
    return new Promise((res, rej) => {
        const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(key);
        req.onsuccess = () => res();
        req.onerror   = () => rej(req.error);
    });
}

export async function savePrivateKey(userId: number, key: CryptoKey): Promise<void> {
    const rawKey    = await crypto.subtle.exportKey('pkcs8', key);
    const encrypted = await encryptKeyBytes(rawKey, userId);

    const db = await openDB();
    await idbPut(db, `privkey_${KEY_VERSION}_${userId}`, encrypted);
}

export async function loadPrivateKey(userId: number): Promise<CryptoKey | null> {
    const db = await openDB();

    // v4: encrypted ArrayBuffer
    const stored = await idbGet(db, `privkey_${KEY_VERSION}_${userId}`);

    if (stored instanceof ArrayBuffer || stored instanceof Uint8Array) {
        return decryptAndImport(
            stored instanceof Uint8Array ? (stored.buffer as ArrayBuffer) : stored,
            userId,
        );
    }

    // ── Migration: v3 → v4 (CryptoKey stored directly) ───────────────────────
    const legacy = await idbGet(db, `privkey_${KEY_VERSION_PREV}_${userId}`);

    if (legacy && typeof (legacy as CryptoKey).type === 'string') {
        // Це CryptoKey — мігруємо
        try {
            await savePrivateKey(userId, legacy as CryptoKey);
            await idbDelete(db, `privkey_${KEY_VERSION_PREV}_${userId}`);
            console.info('[E2E] Migrated private key v3 → v4 (encrypted storage)');
            return loadPrivateKey(userId);
        } catch (err) {
            console.error('[E2E] Migration failed:', err);
            return null;
        }
    }

    return null;
}

export async function deletePrivateKey(userId: number): Promise<void> {
    localStorage.removeItem(VAULT_LS_KEY(userId));
    const db = await openDB();
    await Promise.allSettled([
        idbDelete(db, `privkey_${KEY_VERSION}_${userId}`),
        idbDelete(db, `privkey_${KEY_VERSION_PREV}_${userId}`),
    ]);
}

// Internals
async function decryptAndImport(
    encryptedData: ArrayBuffer,
    userId: number,
): Promise<CryptoKey | null> {
    try {
        const rawKey = await decryptKeyBytes(encryptedData, userId);

        // Імпортуємо як NON-EXTRACTABLE навіть якщо XSS дістанеться до об'єкта
        return crypto.subtle.importKey(
            'pkcs8',
            rawKey,
            { name: 'X25519' },
            false, // non-extractable
            ['deriveKey', 'deriveBits'],
        );
    } catch (err) {

        console.warn('[E2E] Cannot decrypt private key (vault secret missing?):', err);
        return null;
    }
}

// Helpers
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