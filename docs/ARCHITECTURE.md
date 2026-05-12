# Architecture

This document explains the internal design of Vesper — how the pieces fit together and why they were built the way they were.

---

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [Client Architecture](#client-architecture)
- [Server Architecture](#server-architecture)
- [Cryptography Layer](#cryptography-layer)
- [Real-Time Layer](#real-time-layer)
- [Storage Layout](#storage-layout)
- [Message Lifecycle](#message-lifecycle)
- [Key Lifecycle](#key-lifecycle)
- [Device Sync — VSP-1](#device-sync--vsp-1)
- [Design Decisions & Trade-offs](#design-decisions--trade-offs)

---

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                             │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Next.js UI  │    │  useE2E hook │    │ WASM Worker  │  │
│  │  (React 19)  │◀──▶│  IndexedDB   │◀──▶│ (Rust crypto)│  │
│  └──────┬───────┘    └──────────────┘    └──────────────┘  │
│         │ HTTP / WebSocket                                   │
└─────────┼───────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────────┐
│                       NestJS Server                          │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ REST API     │    │ Socket.io    │    │ Prisma ORM   │  │
│  │ (HTTP)       │    │ Gateway      │    │              │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         └──────────────────┴──────────────────┘           │
└─────────────────────────────┬───────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        PostgreSQL           Redis        Supabase Storage
        (persistent)     (pub/sub,        (encrypted files)
                          sessions)
```

---

## Client Architecture

### Layer separation

```
app/          ← Pages and route handlers (Next.js App Router)
components/   ← Presentational components (no business logic)
hooks/        ← All stateful logic (useE2E, useMessages, useWebRTC …)
lib/          ← Pure functions (crypto.ts, cryptoDb.ts, mediaEncryption.ts …)
store/        ← Global state (Zustand — auth only)
workers/      ← crypto.worker.ts (WASM bridge, runs in separate thread)
```

### State management philosophy

- **Zustand** is used only for auth state (`useAuthStore`) — user object + access token + hydration flag.
- **React state / hooks** own all other UI and domain state. There is no global message store.
- **IndexedDB** (via `cryptoDb.ts`) is the persistent layer for ratchet sessions, plaintext cache, and media keys.
- **In-memory only** for the offline message queue (`useOfflineQueue`) — intentional security decision.

### The E2E hook (`useE2E`)

`useE2E` is the central coordination point for all cryptographic operations. It is a module-level singleton (not component-local) so that ratchet state is shared across all components without re-initialisation on re-render.

```
Module globals (not React state):
  identity: IdentityKeys | null       ← loaded from IndexedDB
  currentUserId: number | null
  drLocks: Map<string, Promise>        ← serialise DR ops per pair
  groupLocks: Map<number, Promise>     ← serialise group ops per conv
  v3DrLocks: Map<string, Promise>      ← per-device DR ops
  deviceBundleCache: Map               ← avoid redundant fetches
```

The hook exposes `encrypt`, `decrypt`, `encryptForGroup`, `decryptFromGroup`, `encryptV3`, `decryptV3`, and key management functions (`setupRecovery`, `resetToNewKeys`, `unlockWithPin`).

### Concurrency safety

Each Double Ratchet session requires serialised access — calling `encrypt` and `decrypt` concurrently on the same session produces corrupt state. All DR and group operations are wrapped in `withLock`, which chains operations on a per-session `Promise` to enforce serial execution.

---

## Server Architecture

### Module structure

```
AppModule
├── AuthModule       JWT auth, sessions, 2FA, email verification
├── ChatModule       WebSocket gateway, rate limiters, device sync signaling
├── ConversationsModule  Messages, reactions, sender keys, pinning, cleanup
├── KeysModule       X3DH bundles, recovery blobs, upgrade notifications
├── DevicesModule    v3 device bundle registry
├── FriendsModule    Friend requests, search
├── UsersModule      Profiles, avatars, status emoji
├── UploadModule     Supabase storage, signed URL generation
├── FilesModule      Signed URL endpoint for clients
├── PushModule       Web Push (VAPID)
├── OGModule         Open Graph metadata fetcher (SSRF-protected)
└── ReportsModule    Bug/feedback reports, admin dashboard
```

### Guard hierarchy

```
ThrottlerGuard      ← global rate limiter (configurable per route)
JwtAuthGuard        ← HTTP endpoints
WsJwtGuard          ← WebSocket events (re-verifies token per event)
Admin check         ← inline role check in controller (reports, etc.)
```

### Session management

Sessions are stored in PostgreSQL. Each row holds:
- SHA-256 hash of the refresh token (raw token is in an HttpOnly cookie)
- `prevRefreshToken` — hash of the previous token, for reuse detection
- `userAgent`, `ipAddress` — for the session list UI
- `expiresAt` — hard TTL (7 days)

On refresh: the old session row is updated atomically (`prevRefreshToken ← current hash`, `refreshToken ← new hash`). If the old hash is found in `prevRefreshToken`, it means a previously-rotated token was replayed — the server logs a warning but does not terminate all sessions (multi-tab race condition mitigation).

---

## Cryptography Layer

### WASM Worker isolation

All Signal protocol operations run in `crypto.worker.ts`, a dedicated Web Worker. The main thread communicates via a typed RPC protocol (`cryptoWorkerClient.ts`). This means:

- Private key material never touches the main thread's heap
- WASM memory is isolated from the DOM
- Long-running Argon2id hashing doesn't block the UI

### IndexedDB schema (`messenger-e2e-v2`, version 3)

| Store | Key | Value | Description |
|---|---|---|---|
| `identity` | `userId` | `{ enc: ArrayBuffer, pub: ArrayBuffer }` | Identity keys (private encrypted by vault key) |
| `ratchet` | `"userId1:userId2"` or `"dN:dM"` | `ArrayBuffer` | DR session bytes |
| `group_sender` | `conversationId` | `ArrayBuffer` | Sender chain state |
| `group_receiver` | `"convId:senderId"` | `ArrayBuffer` | Receiver chain state |
| `msg_plaintext` | `messageId` | `{ content, isLegacy }` | Decrypted text cache |
| `media_keys` | `messageId` | `ArrayBuffer (key32+iv12)` | AES-GCM key+iv for files |

Private identity key bytes are encrypted by a **vault key** derived from a random secret stored in `localStorage` via HKDF-SHA256. This protects against straightforward IndexedDB extraction while keeping the vault accessible across page loads.

### Wire format evolution

| Prefix | Version | Description |
|---|---|---|
| *(none)* | v1 | Legacy: AES-GCM with ECDH shared key, PBKDF2 vault |
| `v2:` | v2 | Signal Double Ratchet (DM) |
| `v2g:` | v2 | Signal Sender Key (group) |
| `v3:` | v3 | Multi-device: AES-GCM content + per-device DR envelopes |

The codebase maintains backward-compatible decryption for v1 ciphertext (`cryptoLegacy.ts`) so old messages remain readable.

---

## Real-Time Layer

### Socket.io room topology

```
user_{userId}       ← all sockets for a user (push notifications, key rotation)
conv_{convId}       ← all members of a conversation (messages, typing, reactions)
dsync_{sessionId}   ← device sync session participants (max 2 sockets)
```

### Rate limiting

Per-event in-memory rate limiters (`WsRateLimiter`) with sliding window:

| Event | Limit |
|---|---|
| `sendMessage` | 60 / min |
| `typing` | 20 / min |
| `toggleReaction` | 30 / min |
| `deleteMessage` / `editMessage` | 30 / min |
| `sendFriendRequest` | 10 / min |
| `callUser` | 10 / min |
| `deviceSyncStart` / `Join` | 5 / min |

### Scheduled messages

When a message with `scheduledAt` in the future is saved, the server calls `setTimeout` for the delivery delay and stores the message with `scheduledAt` set. On server restart, `onModuleInit` re-loads all pending scheduled messages and re-schedules them.

---

## Storage Layout

### PostgreSQL (via Prisma)

Key tables and their purpose:

| Table | Purpose |
|---|---|
| `User` | Account, credentials, 2FA, recovery blobs |
| `Session` | Refresh tokens (hashed), device metadata |
| `Device` | v3 per-device X3DH bundles |
| `Conversation` | Chats (DIRECT / GROUP / CHANNEL) |
| `ConversationMember` | Membership, roles, read receipts, pin/archive per user |
| `Message` | Content (ciphertext), file metadata, envelopes reference |
| `MessageKeyEnvelope` | Per-device DR-encrypted message key (v3) |
| `GroupSenderKey` | X3DH-wrapped sender key distributions |
| `UserKeyBundleV2` | User's X3DH public bundle |
| `PinnedMessage` | Multi-pin per conversation |
| `Report` | Bug reports / feedback |

### Supabase Storage

Files are uploaded as `{userId}/{uuid}{ext}`. Access is always via **signed URLs** (1-hour TTL, server-side cached with 5-minute buffer). The raw Supabase URL is never exposed to the client — all file URLs are stored and returned as `/storage/{bucket}/{path}` proxy paths.

---

## Message Lifecycle

### Sending (Direct, v3)

```
User types → sendMessage()
  → encryptV3(plaintext, recipientUserId)
      → generate random messageKey (32 bytes)
      → AES-GCM encrypt content → "v3:<base64(iv||ct)>"
      → fetch recipient device bundles + own other devices
      → for each device: drDeviceEncrypt(myDeviceId, deviceId, messageKey)
      → returns { content, envelopes[] }
  → socket.emit('sendMessage', { content, envelopes, senderDeviceId })
  → optimistic message added to UI (plaintext, _pendingCipher for echo matching)

Server:
  → saves Message row (ciphertext content)
  → saves MessageKeyEnvelope rows (one per device)
  → broadcasts onMessage to conv_{convId}

Client (echo / recipient):
  → onMessage handler
  → find envelope for myDeviceId
  → drDeviceDecrypt(senderDeviceId, myDeviceId, envelope.ciphertext) → messageKey
  → AES-GCM decrypt content → plaintext
  → savePlaintext(messageId, plaintext) to IndexedDB
  → replace optimistic message in UI
```

### Receiving a file

```
Sender:
  → encryptMedia(fileBlob) → { encryptedBlob, key, iv }
  → upload encryptedBlob to /upload → { url }
  → packMediaKey(key, iv) → 44 bytes
  → MEDIA_KEY_PREFIX + b64(packed) → sent as message content through DR
  → setPendingMediaKey(fileUrl, key, iv) in-memory

Recipient:
  → decryptContent(message.content) → decoded starts with "mk:"
  → unpackMediaKey(b64Dec(decoded.slice(3))) → { key, iv }
  → saveMediaKey(messageId, key, iv) to IndexedDB

Rendering:
  → loadMediaKey(messageId) from IndexedDB
  → fetch signed URL for fileUrl
  → fetch encrypted blob
  → decryptMedia(blob, key, iv) → plaintext blob
  → createObjectURL → display
```

---

## Key Lifecycle

```
Registration:
  → generateIdentityKeys() in WASM worker
  → saveIdentityKeys(userId, keys) → encrypted to IndexedDB
  → POST /keys/v2 { bundle: b64(ik_sign_pub||ik_dh_pub||spk_pub||spk_sig||0x00) }
  → redirect to /auth/setup-recovery

Recovery PIN setup:
  → pack identity key bytes (256 bytes total)
  → wasm.encryptKeyWithPin(keyBytes, pin) → Argon2id blob
  → POST /keys/v2/recovery { encryptedBlob }

New device login:
  → GET /keys/v2/recovery → encryptedBlob
  → prompt user for PIN
  → wasm.decryptKeyWithPin(blobBytes, pin) → keyBytes
  → reconstruct IdentityKeys, save to IndexedDB
  → register device bundle (POST /devices)

Key rotation (reset):
  → generateIdentityKeys() → new keys
  → DELETE /conversations/sender-keys/mine-all
  → POST /keys/v2 with new bundle
  → clearDeviceKeys() → new per-device keys
  → POST /devices with new device bundle
  → status → 'needs-setup' → prompt for new Recovery PIN
```

---

## Device Sync — VSP-1

The VSP-1 protocol transfers all IndexedDB stores (identity, ratchet sessions, group keys, message plaintext, media keys) from one device to another over an authenticated WebRTC DataChannel, secured by a QR-code OTP.

### Why WebRTC DataChannel?

- End-to-end between the two devices; server cannot read transfer content
- Ordered, reliable delivery (SCTP)
- Natural flow control via `bufferedAmount` API

### Signaling sequence

```
Source device                 Server (signaling)           Target device
─────────────                 ──────────────────           ─────────────
deviceSyncStart({             stores session,
  sessionId, ekSource,    →   emits deviceSyncReady
  sdpOffer })

                                                    ← deviceSyncJoin({
                                                         sessionId,
                                                         ekTarget })
                              forwards ekSource +
                              sdpOffer to target   →  deviceSyncOffer(…)
deviceSyncPeerJoined     ←    forwards ekTarget
  ({ ekTarget })              to source
                                                    ← deviceSyncRelayAnswer
deviceSyncPeerAnswer     ←    relays sdpAnswer          ({ sdpAnswer })
  ({ sdpAnswer })

  ← ICE candidates flow via deviceSyncIce in both directions →

DataChannel opens
VSP-1 chunked transfer begins
```

### Data integrity

After all chunks are transferred, the source sends a signed manifest (`HMAC-SHA256` over `version || count || [id(8) || sha256(32)] × N`). The target verifies the HMAC, then checks the SHA-256 of every received record against the manifest before importing anything. A single mismatch aborts the import.

---

## Design Decisions & Trade-offs

### Why Rust + WASM instead of the Web Crypto API?

The Web Crypto API provides AES-GCM and HKDF but does not support X25519, Ed25519, or the Signal Double Ratchet. Implementing the full Signal protocol stack in TypeScript would be error-prone and hard to audit. Rust offers memory safety, a strong type system, and the `zeroize` crate for guaranteed key scrubbing — qualities that matter in a cryptography library.

### Why IndexedDB for ratchet state instead of the server?

The server must remain zero-knowledge. Storing ratchet session state server-side would give the server everything it needs to decrypt messages. IndexedDB is the only persistent storage available in a browser that stays local to the device.

### Why not use localStorage for the offline queue?

`localStorage` is synchronous and accessible to any JavaScript running on the same origin. An XSS vulnerability could silently exfiltrate unsent plaintext drafts. The offline queue is held in React state (in-memory) and lost on page refresh — this is an intentional security trade-off.

### Why per-device key pairs instead of one key pair per user?

If every device shares the same private key, adding a new device requires transmitting the private key securely — which requires an already-secured channel (the Recovery PIN vault). Per-device keys mean each device can be registered independently with only the public identity signing key for bundle authenticity, and the server can fan out per-device message envelopes.

### Why Argon2id instead of PBKDF2 for the PIN vault?

PBKDF2-SHA256 (even at 600,000 iterations) is parallelisable on GPU hardware at approximately 1 billion iterations per second per GPU. Argon2id at 32 MB memory forces sequential memory accesses, reducing GPU parallelism by roughly 3 orders of magnitude for the same wall-clock time. The upgrade was implemented in the Rust WASM layer while maintaining a migration path for existing v1 blobs.