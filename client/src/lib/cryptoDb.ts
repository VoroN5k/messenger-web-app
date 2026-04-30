export const DB_NAME = 'messenger-e2e-v2';
export const DB_VERSION = 3;

export type StoreName = 'identity' | 'ratchet' | 'group_sender' | 'group_receiver' | 'msg_plaintext' | 'media_keys';

// Ordered list used by device-sync export/import; order is stable across versions.
export const SYNC_STORES: ReadonlyArray<{ name: StoreName; id: number; binary: boolean }> = [
    { name: 'identity',       id: 1, binary: true  },
    { name: 'ratchet',        id: 2, binary: true  },
    { name: 'group_sender',   id: 3, binary: true  },
    { name: 'group_receiver', id: 4, binary: true  },
    { name: 'msg_plaintext',  id: 5, binary: false },
    { name: 'media_keys',     id: 6, binary: true  },
] as const;

function open(): Promise<IDBDatabase> {
    return new Promise((res, rej) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('identity'))       db.createObjectStore('identity');
            if (!db.objectStoreNames.contains('ratchet'))        db.createObjectStore('ratchet');
            if (!db.objectStoreNames.contains('group_sender'))   db.createObjectStore('group_sender');
            if (!db.objectStoreNames.contains('group_receiver')) db.createObjectStore('group_receiver');
            if (!db.objectStoreNames.contains('msg_plaintext'))  db.createObjectStore('msg_plaintext');
            if (!db.objectStoreNames.contains('media_keys'))     db.createObjectStore('media_keys');
        };
        req.onsuccess = () => res(req.result);
        req.onerror   = () => rej(req.error);
    });
}

function idbGet<T>(db: IDBDatabase, store: StoreName, key: string): Promise<T | null> {
    return new Promise((res, rej) => {
        const req = db.transaction(store, 'readonly').objectStore(store).get(key);
        req.onsuccess = () => res((req.result as T) ?? null);
        req.onerror   = () => rej(req.error);
    });
}

function idbPut(db: IDBDatabase, store: StoreName, key: string, value: unknown): Promise<void> {
    return new Promise((res, rej) => {
        const req = db.transaction(store, 'readwrite').objectStore(store).put(value, key);
        req.onsuccess = () => res();
        req.onerror   = () => rej(req.error);
    });
}

function idbDelete(db: IDBDatabase, store: StoreName, key: string): Promise<void> {
    return new Promise((res, rej) => {
        const req = db.transaction(store, 'readwrite').objectStore(store).delete(key);
        req.onsuccess = () => res();
        req.onerror   = () => rej(req.error);
    });
}

function idbClear(db: IDBDatabase, store: StoreName): Promise<void> {
    return new Promise((res, rej) => {
        const req = db.transaction(store, 'readwrite').objectStore(store).clear();
        req.onsuccess = () => res();
        req.onerror   = () => rej(req.error);
    });
}

// Vault encryption for private key bytes stored in IndexedDB.
// A random secret is kept in localStorage; AES-256-GCM derived from it protects
// the IndexedDB blobs. Both live in the same origin so the threat model is
// identical to the browser's same-origin storage, not PIN protection
// (PIN recovery is handled separately via Argon2id in the WASM worker).

const VAULT_LS_KEY = (userId: number) => `v2_vault_${userId}`;

async function vaultKey(userId: number): Promise<CryptoKey> {
    const lsKey = VAULT_LS_KEY(userId);
    let secret = localStorage.getItem(lsKey);
    if (!secret) {
        const rand = crypto.getRandomValues(new Uint8Array(32));
        secret = buf2b64(rand.buffer as ArrayBuffer);
        localStorage.setItem(lsKey, secret);
    }
    const raw = b642buf(secret);
    const hkdf = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32).buffer as ArrayBuffer, info: te('v2-identity-vault').buffer as ArrayBuffer },
        hkdf,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

async function vaultEncrypt(userId: number, data: Uint8Array): Promise<ArrayBuffer> {
    const key = await vaultKey(userId);
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const ct  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, key, data.buffer as ArrayBuffer);
    const out = new Uint8Array(12 + ct.byteLength);
    out.set(iv);
    out.set(new Uint8Array(ct), 12);
    return out.buffer as ArrayBuffer;
}

async function vaultDecrypt(userId: number, data: ArrayBuffer): Promise<Uint8Array> {
    const key   = await vaultKey(userId);
    const bytes = new Uint8Array(data);
    const pt    = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes.slice(0, 12) },
        key,
        bytes.slice(12).buffer as ArrayBuffer,
    );
    return new Uint8Array(pt);
}

// Identity key blob

// Private parts stored encrypted: ikDhSecret(32) || ikSignSeed(32) || spkSecret(32) = 96 bytes
// Public parts stored in plaintext alongside: ikSignPub(32) || ikDhPub(32) || spkPub(32) || spkSig(64) = 160 bytes

export interface IdentityKeys {
    ikSignSeed:  Uint8Array; // 32 — Ed25519 seed
    ikSignPub:   Uint8Array; // 32
    ikDhSecret:  Uint8Array; // 32 — X25519 secret
    ikDhPub:     Uint8Array; // 32
    spkSecret:   Uint8Array; // 32 — signed prekey
    spkPub:      Uint8Array; // 32
    spkSig:      Uint8Array; // 64 — Ed25519 signature of spkPub by ikSign
}

export async function saveIdentityKeys(userId: number, keys: IdentityKeys): Promise<void> {
    const db = await open();
    const privBlob = new Uint8Array(96);
    privBlob.set(keys.ikDhSecret, 0);
    privBlob.set(keys.ikSignSeed, 32);
    privBlob.set(keys.spkSecret,  64);
    const encrypted = await vaultEncrypt(userId, privBlob);
    privBlob.fill(0);

    const pubBlob = new Uint8Array(160);
    pubBlob.set(keys.ikSignPub, 0);
    pubBlob.set(keys.ikDhPub,   32);
    pubBlob.set(keys.spkPub,    64);
    pubBlob.set(keys.spkSig,    96);

    await idbPut(db, 'identity', String(userId), { enc: encrypted, pub: pubBlob.buffer });
}

export async function loadIdentityKeys(userId: number): Promise<IdentityKeys | null> {
    const db = await open();
    const rec = await idbGet<{ enc: ArrayBuffer; pub: ArrayBuffer }>(db, 'identity', String(userId));
    if (!rec) return null;
    try {
        const priv   = await vaultDecrypt(userId, rec.enc);
        const pubArr = new Uint8Array(rec.pub);
        const keys: IdentityKeys = {
            ikDhSecret:  priv.slice(0, 32),
            ikSignSeed:  priv.slice(32, 64),
            spkSecret:   priv.slice(64, 96),
            ikSignPub:   pubArr.slice(0, 32),
            ikDhPub:     pubArr.slice(32, 64),
            spkPub:      pubArr.slice(64, 96),
            spkSig:      pubArr.slice(96, 160),
        };
        priv.fill(0);
        return keys;
    } catch {
        return null;
    }
}

export async function deleteIdentityKeys(userId: number): Promise<void> {
    const db = await open();
    localStorage.removeItem(VAULT_LS_KEY(userId));
    await idbDelete(db, 'identity', String(userId));
}

// DR session blobs — keyed by convKey = [myId, peerId].sort().join(':')

export async function saveRatchetSession(convKey: string, bytes: Uint8Array): Promise<void> {
    const db = await open();
    await idbPut(db, 'ratchet', convKey, bytes.buffer as ArrayBuffer);
}

export async function loadRatchetSession(convKey: string): Promise<Uint8Array | null> {
    const db = await open();
    const buf = await idbGet<ArrayBuffer>(db, 'ratchet', convKey);
    return buf ? new Uint8Array(buf) : null;
}

// Methods to reset ratchet sessions

export async function deleteRatchetSession(convKey: string): Promise<void> {
    const db = await open();
    await idbDelete(db, 'ratchet', convKey);
}

export async function clearAllRatchetSessions(): Promise<void> {
    const db = await open();
    await idbClear(db, 'ratchet');
}

// Group sender session blobs — keyed by convId

export async function saveGroupSender(convId: number, bytes: Uint8Array): Promise<void> {
    const db = await open();
    await idbPut(db, 'group_sender', String(convId), bytes.buffer as ArrayBuffer);
}

export async function loadGroupSender(convId: number): Promise<Uint8Array | null> {
    const db = await open();
    const buf = await idbGet<ArrayBuffer>(db, 'group_sender', String(convId));
    return buf ? new Uint8Array(buf) : null;
}

export async function deleteGroupSender(convId: number): Promise<void> {
    const db = await open();
    await idbDelete(db, 'group_sender', String(convId));
}

// Group receiver session blobs — keyed by `${convId}:${senderId}`

export async function saveGroupReceiver(convId: number, senderId: number, bytes: Uint8Array): Promise<void> {
    const db = await open();
    await idbPut(db, 'group_receiver', `${convId}:${senderId}`, bytes.buffer as ArrayBuffer);
}

export async function loadGroupReceiver(convId: number, senderId: number): Promise<Uint8Array | null> {
    const db = await open();
    const buf = await idbGet<ArrayBuffer>(db, 'group_receiver', `${convId}:${senderId}`);
    return buf ? new Uint8Array(buf) : null;
}

export async function deleteGroupReceiver(convId: number, senderId: number): Promise<void> {
    const db = await open();
    await idbDelete(db, 'group_receiver', `${convId}:${senderId}`);
}

export async function deleteAllGroupReceivers(convId: number): Promise<void> {
    // Can't prefix-scan in basic IDB; store tracks which senders we have
    // so just load all keys and delete matching ones via cursor
    const db = await open();
    return new Promise((res, rej) => {
        const tx    = db.transaction('group_receiver', 'readwrite');
        const store = tx.objectStore('group_receiver');
        const req   = store.openCursor();
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) { res(); return; }
            if ((cursor.key as string).startsWith(`${convId}:`)) cursor.delete();
            cursor.continue();
        };
        req.onerror = () => rej(req.error);
    });
}

// ---------------------------------------------------------------------------
// Plaintext cache — maps messageId → decrypted content.
// Signal DR is one-way: once a message is decrypted the session moves forward
// and that ciphertext can never be decrypted again. This cache lets us survive
// page reloads without losing message history.
// ---------------------------------------------------------------------------

export async function savePlaintext(
    msgId: number,
    content: string,
    isLegacy = false,
): Promise<void> {
    const db = await open();
    await idbPut(db, 'msg_plaintext', String(msgId), { content, isLegacy });
}

export async function loadPlaintext(
    msgId: number,
): Promise<{ content: string; isLegacy: boolean } | null> {
    const db = await open();
    return idbGet<{ content: string; isLegacy: boolean }>(db, 'msg_plaintext', String(msgId));
}

// ---------------------------------------------------------------------------
// Media keys — AES-256-GCM key+iv for file/audio messages.
// Stored as packed ArrayBuffer: key(32) || iv(12) = 44 bytes.
// Keyed by messageId so FileBubble/VoiceBubble can decrypt without DR.
// ---------------------------------------------------------------------------

export async function saveMediaKey(
    messageId: number,
    key: Uint8Array,
    iv: Uint8Array,
): Promise<void> {
    const db = await open();
    const buf = new Uint8Array(44);
    buf.set(key, 0);
    buf.set(iv, 32);
    await idbPut(db, 'media_keys', String(messageId), buf.buffer as ArrayBuffer);
}

export async function loadMediaKey(
    messageId: number,
): Promise<{ key: Uint8Array; iv: Uint8Array } | null> {
    const db = await open();
    const buf = await idbGet<ArrayBuffer>(db, 'media_keys', String(messageId));
    if (!buf) return null;
    const arr = new Uint8Array(buf);
    return { key: arr.slice(0, 32), iv: arr.slice(32, 44) };
}

// In-memory map for the send→echo round-trip.
// When a file is sent, we store key+iv by fileUrl.
// When the server echo arrives (with the assigned messageId), we move the entry to IndexedDB.
const pendingMediaKeys = new Map<string, { key: Uint8Array; iv: Uint8Array }>();

export function setPendingMediaKey(fileUrl: string, key: Uint8Array, iv: Uint8Array): void {
    pendingMediaKeys.set(fileUrl, { key: new Uint8Array(key), iv: new Uint8Array(iv) });
}

export function consumePendingMediaKey(
    fileUrl: string,
): { key: Uint8Array; iv: Uint8Array } | null {
    const val = pendingMediaKeys.get(fileUrl) ?? null;
    if (val) pendingMediaKeys.delete(fileUrl);
    return val;
}

// ---------------------------------------------------------------------------
// Full wipe
// ---------------------------------------------------------------------------

export async function clearAllCryptoState(userId: number): Promise<void> {
    const db = await open();
    localStorage.removeItem(VAULT_LS_KEY(userId));
    pendingMediaKeys.clear();
    await Promise.all([
        idbClear(db, 'identity'),
        idbClear(db, 'ratchet'),
        idbClear(db, 'group_sender'),
        idbClear(db, 'group_receiver'),
        idbClear(db, 'msg_plaintext'),
        idbClear(db, 'media_keys'),
    ]);
}

// ---------------------------------------------------------------------------
// Device-sync export / import helpers
// ---------------------------------------------------------------------------

/** Count all records across every sync-eligible store. */
export async function countSyncRecords(): Promise<number> {
    const db = await open();
    const counts = await Promise.all(
        SYNC_STORES.map(({ name }) =>
            new Promise<number>((res, rej) => {
                const req = db.transaction(name, 'readonly').objectStore(name).count();
                req.onsuccess = () => res(req.result);
                req.onerror   = () => rej(req.error);
            }),
        ),
    );
    return counts.reduce((a, b) => a + b, 0);
}

/**
 * Async iterator over every IDB record in all sync stores.
 * Yields one record at a time so callers can apply backpressure.
 *
 * Yielded value:
 *   storeId  — numeric ID (see SYNC_STORES)
 *   key      — string IDB key
 *   payload  — STORE_ID(1) || KEY_LEN(2 BE) || KEY_UTF8 || VALUE_BYTES
 */
export async function* exportSyncRecords(): AsyncGenerator<{
    storeId: number;
    key: string;
    payload: Uint8Array;
}> {
    const db  = await open();
    const enc = new TextEncoder();

    for (const { name, id: storeId, binary } of SYNC_STORES) {
        yield* cursorIterator(db, name, storeId, binary, enc);
    }
}

async function* cursorIterator(
    db: IDBDatabase,
    storeName: StoreName,
    storeId: number,
    binary: boolean,
    enc: TextEncoder,
): AsyncGenerator<{ storeId: number; key: string; payload: Uint8Array }> {
    // Read all keys + values in one synchronous transaction before yielding.
    // Cursor-based iteration yields across async gaps (drainDC, WASM calls) which
    // causes the IDB transaction to auto-commit → "transaction not active" error.
    const pairs = await new Promise<Array<{ key: string; value: unknown }>>((res, rej) => {
        const tx      = db.transaction(storeName, 'readonly');
        const store   = tx.objectStore(storeName);
        const keysReq = store.getAllKeys();
        const valsReq = store.getAll();
        tx.oncomplete = () =>
            res(keysReq.result.map((k, i) => ({ key: String(k), value: valsReq.result[i] })));
        tx.onerror  = () => rej(tx.error);
        tx.onabort  = () => rej(new Error(`IDB transaction aborted on ${storeName}`));
    });

    for (const { key, value } of pairs) {
        const keyBytes = enc.encode(key);
        let valueBytes: Uint8Array;
        if (binary && value instanceof ArrayBuffer) {
            valueBytes = new Uint8Array(value);
        } else {
            valueBytes = enc.encode(JSON.stringify(value));
        }

        const payload = new Uint8Array(1 + 2 + keyBytes.length + valueBytes.length);
        payload[0] = storeId;
        payload[1] = (keyBytes.length >> 8) & 0xff;
        payload[2] = keyBytes.length & 0xff;
        payload.set(keyBytes, 3);
        payload.set(valueBytes, 3 + keyBytes.length);

        yield { storeId, key, payload };
    }
}

/**
 * Parse a raw chunk payload (as produced by exportSyncRecords) and
 * write the record to IndexedDB. Safe to call concurrently for different keys.
 */
export async function importSyncRecord(payload: Uint8Array): Promise<void> {
    if (payload.length < 4) throw new Error('sync record too short');

    const storeId  = payload[0];
    const keyLen   = (payload[1] << 8) | payload[2];
    if (payload.length < 3 + keyLen) throw new Error('sync record truncated');

    const dec      = new TextDecoder();
    const key      = dec.decode(payload.slice(3, 3 + keyLen));
    const rawValue = payload.slice(3 + keyLen);

    const meta = SYNC_STORES.find(s => s.id === storeId);
    if (!meta) throw new Error(`unknown store id: ${storeId}`);

    const db = await open();
    const value: unknown = meta.binary
        ? rawValue.buffer.slice(rawValue.byteOffset, rawValue.byteOffset + rawValue.byteLength) as ArrayBuffer
        : JSON.parse(dec.decode(rawValue));

    await new Promise<void>((res, rej) => {
        const req = db.transaction(meta.name, 'readwrite').objectStore(meta.name).put(value, key);
        req.onsuccess = () => res();
        req.onerror   = () => rej(req.error);
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function te(s: string): Uint8Array { return new TextEncoder().encode(s); }
function buf2b64(buf: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function b642buf(s: string): ArrayBuffer {
    const p = s.replace(/-/g, '+').replace(/_/g, '/');
    const r = atob(p.padEnd(p.length + (4 - p.length % 4) % 4, '='));
    const b = new Uint8Array(r.length);
    for (let i = 0; i < r.length; i++) b[i] = r.charCodeAt(i);
    return b.buffer as ArrayBuffer;
}
