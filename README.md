# 🦇 Vesper Messenger

> **Open-source, decentralised messenger with absolute end-to-end encryption for text, media, voice messages, and video calls.**

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)
[![100% Open Source](https://img.shields.io/badge/100%25-Open_Source-blue.svg)](#manifesto)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)
[![NestJS](https://img.shields.io/badge/NestJS-latest-red)](https://nestjs.com)
[![Rust](https://img.shields.io/badge/Crypto-Rust%20%2B%20WASM-orange)](https://www.rust-lang.org)

---

## The Manifesto

Privacy is a fundamental human right. Vesper is built on a strict **Zero-Knowledge Architecture** — the server acts as a blind courier, routing encrypted packets without ever being able to read your messages, view your files, or access your private keys.

True security relies on transparency, not obscurity. Every cryptographic operation in Vesper happens locally on your device, implemented in audited Rust compiled to WebAssembly.

---

## Feature Overview

| Category | Features |
|---|---|
| **Messaging** | Text, file attachments, voice messages, reactions, replies, forwarding, message editing, self-destructing messages, scheduled messages |
| **Media** | Per-file random AES-256-GCM keys, local encryption before upload, signed URLs for retrieval |
| **Calls** | Peer-to-peer audio & video via WebRTC (DTLS/SRTP), screen sharing, STUN/TURN NAT traversal |
| **Groups & Channels** | Signal Sender Key protocol, per-member key distribution, multi-pin messages, role management |
| **Security** | Signal Double Ratchet (DM), X3DH key exchange, Argon2id PIN vault, 2FA (TOTP), per-device key bundles |
| **Multi-device** | Per-device X25519 key pairs, per-message envelopes for each device, device sync via VSP-1 over WebRTC DataChannel |
| **Account** | Email verification, password reset, session management with geolocation, device list, account deletion |
| **Admin** | Report management dashboard (bug reports, feature requests, feedback), status & note system |

---

## Cryptographic Architecture

All cryptographic primitives are implemented in **Rust** and compiled to **WebAssembly**, running inside a dedicated Web Worker. The main thread never handles raw key material.

### Direct Messages — Signal Double Ratchet (v2)

```
Alice                                    Bob
──────                                   ───
generateKeyPair()                        publishBundle()
                  ─── X3DH init ──▶
                  ◀── shared secret ────
         Double Ratchet session established
         Every message: new chain key step
         Forward secrecy + break-in recovery
```

- **Key Exchange:** X3DH (Extended Triple Diffie-Hellman) with X25519
- **Ratchet:** Signal Double Ratchet — new message key every step
- **Wire format:** `v2:<base64url>` — flags(1) | [x3dh_init(65)] | dr_wire(40+ct)
- **Out-of-order delivery:** skipped message key cache, bounded by `MAX_SKIP=1000`

### Multi-Device Messages (v3)

Each physical browser generates an independent X25519 device key pair (stored in `localStorage`). When sending a message, the content is encrypted with a random one-time AES-256-GCM key, and that key is wrapped in a per-device Double Ratchet envelope for every recipient device.

```
Wire: v3:<base64url(iv(12) || AES-GCM-CT)>
Envelopes: [ { deviceId, DR-encrypted(messageKey) } × N ]
```

### Group Encryption — Signal Sender Key

Each sender maintains one ratcheting sender chain per group. Members receive a `SenderKeyDistributionMessage` (delivered over individual Double Ratchet sessions) containing the current chain state. Every broadcast message carries an Ed25519 signature verified before decryption.

```
Wire: v2g:<base64url(key_id(4)|iteration(4)|sig(64)|ct)>
```

### PIN-Protected Key Vault

Private keys are never stored in plaintext. At rest they are encrypted with a key derived from the user's Recovery PIN via **Argon2id** (WASM preset: 32 MB, 2 passes). The encrypted blob is stored server-side; the PIN never leaves the device.

```
Blob: version(1) | m_cost(4) | t_cost(4) | p_cost(4) | salt(16) | nonce(12) | AES-GCM-CT
AAD covers version + KDF params + salt — tampering with parameters breaks decryption
```

### Device Sync — VSP-1

Secure history transfer between two devices of the same account over a WebRTC DataChannel.

```
Source                              Target
──────                              ──────
(ek_s, EK_S) = keygen()            (ek_t, EK_T) = keygen()
          ─── EK_S (signaling) ──▶
          ◀── EK_T (signaling) ────
dh = X25519(ek_s, EK_T)            dh = X25519(ek_t, EK_S)
K  = HKDF(salt=OTP, ikm=dh, …)     K  = HKDF(salt=OTP, ikm=dh, …)
         DataChannel opens → VSP-1 chunked transfer
```

Chunks: `nonce(12) || AES-256-GCM(lz4_frame(plaintext), aad=seq_be(4))`  
Manifest: `HMAC-SHA256` authenticated, verified with constant-time comparison before any data is imported.

### Primitives Summary

| Purpose | Algorithm |
|---|---|
| Key agreement | X25519 (x25519-dalek) |
| Identity / signing | Ed25519 (ed25519-dalek) |
| Symmetric encryption | AES-256-GCM (aes-gcm) |
| KDF (sessions) | HKDF-SHA256 |
| KDF (PIN vault) | Argon2id |
| HMAC (manifests) | HMAC-SHA256 |
| Compression (sync) | LZ4 Frame |

---

## Tech Stack

### Client
- **Next.js 15 / React 19** — App Router, server components
- **TailwindCSS v4** — dark cyber/minimalist UI with JetBrains Mono
- **Zustand** — global auth & UI state with persist middleware
- **Web Crypto API** — browser-native AES-GCM for media, HKDF for legacy keys
- **WebRTC API** — peer-to-peer calls and VSP-1 device sync
- **IndexedDB** — encrypted local storage for ratchet sessions, plaintext cache, media keys
- **Rust → WASM** — all Signal protocol crypto in a Web Worker (`crypto.worker.ts`)

### Server
- **NestJS** — modular, guard-based architecture
- **Prisma ORM + PostgreSQL** — type-safe database access with migrations
- **Socket.io** — real-time messaging, typing indicators, WebRTC signaling
- **Redis** (optional) — Socket.io adapter for horizontal scaling, sync session store
- **JWT + HttpOnly cookies** — access token (15 min) + rotating refresh token (7 days)
- **OTPLIB** — TOTP-based 2FA (Google Authenticator compatible)
- **Supabase Storage** — encrypted file storage with server-side signed URLs
- **web-push** — Web Push Notifications via VAPID

### Infrastructure
- **Metered / Coturn** — STUN/TURN servers for WebRTC NAT traversal
- **Fly.io** — containerised deployment

---

## Repository Structure

```
vesper/
├── client/                  # Next.js frontend
│   └── src/
│       ├── app/             # Pages (chat, auth, settings, admin)
│       ├── components/      # UI components
│       ├── hooks/           # useE2E, useMessages, useWebRTC, useDeviceSync …
│       ├── lib/             # crypto.ts, cryptoDb.ts, mediaEncryption.ts …
│       ├── store/           # Zustand stores
│       └── workers/         # crypto.worker.ts (WASM bridge)
├── crypto/                  # Rust crypto library
│   ├── core/                # messenger-crypto-core (platform-agnostic)
│   │   └── src/
│   │       ├── double_ratchet.rs
│   │       ├── x3dh.rs
│   │       ├── group/       # Signal Sender Key
│   │       ├── pin_key.rs   # Argon2id vault
│   │       └── device_sync.rs # VSP-1 protocol
│   └── wasm/                # wasm-bindgen bindings
└── server/                  # NestJS backend
    ├── prisma/              # Schema + migrations
    └── src/
        ├── auth/            # JWT, sessions, 2FA, email
        ├── chat/            # WebSocket gateway, rate limiting, device sync signaling
        ├── conversations/   # Messages, reactions, sender keys, pinning
        ├── devices/         # v3 device bundle registry
        ├── keys/            # X3DH bundles, recovery blobs
        ├── push/            # Web Push notifications
        └── upload/          # Supabase storage, signed URLs
```

---

## Getting Started

### Prerequisites

- Node.js v20+
- PostgreSQL 15+
- Rust toolchain + `wasm-pack` (for building crypto)
- Redis (optional, required for multi-instance deployments)

### 1. Clone the repository

```bash
git clone https://github.com/VoroN5k/messenger-web-app.git
cd messenger-web-app
```

### 2. Build the WASM crypto module

```bash
cd crypto/wasm
wasm-pack build --target web --out-dir ../../client/src/wasm
cd ../..
```

### 3. Set up the server

```bash
cd server
npm install
cp .env.example .env
# Edit .env: DATABASE_URL, JWT_SECRET, SUPABASE_*, VAPID_*, MAIL_*, CLIENT_URL
npx prisma migrate dev
npm run start:dev
```

### 4. Set up the client

```bash
cd client
npm install
cp .env.example .env.local
# Edit .env.local: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SOCKET_URL, NEXT_PUBLIC_VAPID_PUBLIC_KEY
npm run dev
```

The application will be available at `http://localhost:3000`.

### Environment Variables

**Server (`server/.env`)**

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing access tokens |
| `COOKIE_SECURE` | Set to `true` in production (HTTPS) |
| `CLIENT_URL` | Frontend origin (for CORS and email links) |
| `SERVER_URL` | Backend origin (for email verification links) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `SUPABASE_STORAGE_BUCKET` | Storage bucket name |
| `VAPID_EMAIL` | VAPID contact email |
| `VAPID_PUBLIC_KEY` | VAPID public key |
| `VAPID_PRIVATE_KEY` | VAPID private key |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_USER` / `MAIL_PASS` | SMTP credentials |
| `ADMIN_EMAIL` | Email address for report notifications |
| `REDIS_URL` | (optional) Redis URL for Socket.io adapter |

**Client (`client/.env.local`)**

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API base URL |
| `NEXT_PUBLIC_SOCKET_URL` | WebSocket server URL |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key for push subscriptions |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (for storage path parsing) |

---

## Security Model

### What the server can see
- Encrypted ciphertext blobs (cannot decrypt without private keys)
- Encrypted media files (per-file keys are transmitted inside E2E-encrypted messages)
- Encrypted recovery blob (Argon2id-protected; PIN never transmitted)
- Metadata: timestamps, conversation membership, file sizes

### What the server cannot see
- Message plaintext
- File contents
- Recovery PIN
- Private keys (never transmitted)

### Key security properties
- **Forward secrecy:** compromising current keys does not expose past messages
- **Break-in recovery (DM):** after a compromise is healed, future messages are secure
- **Authentication:** Ed25519 signatures on all group messages prevent signature-stripping
- **XSS resistance for offline queue:** unsent messages held in-memory only — never written to `localStorage` or `IndexedDB`
- **Refresh token rotation:** tokens are rotated on every use; reuse detection alerts the server
- **SSRF protection:** server-side URL previews (OG metadata) use DNS validation + private IP blocklist

---

## API Overview

| Resource | Description |
|---|---|
| `POST /auth/register` | Register with email verification |
| `POST /auth/login` | Login with optional 2FA |
| `POST /auth/refresh` | Rotate refresh token |
| `GET /auth/sessions` | List active sessions with geolocation |
| `POST /keys/v2` | Publish X3DH key bundle |
| `GET /keys/v2/:userId` | Fetch peer's key bundle |
| `POST /keys/v2/recovery` | Save Argon2id-encrypted recovery blob |
| `POST /devices` | Register device bundle (v3 multi-device) |
| `GET /keys/v3/devices/:userId` | List all device bundles for a user |
| `GET /conversations` | Paginated conversation list |
| `GET /conversations/:id/messages` | Messages with cursor pagination |
| `POST /conversations/:id/sender-keys` | Distribute group sender key |
| `POST /upload` | Upload encrypted file |
| `GET /files/signed` | Get signed URL for a stored file |

WebSocket events follow the Socket.io protocol on path `/rt`. Key events include `sendMessage`, `onMessage`, `typing`, `deviceSyncStart/Join/RelayAnswer/Ice`, `callUser/Accept/Reject`, and `notifyKeyRotated`.

---

## Contributing

Security depends on peer review. Contributions, bug reports, and security audits are welcome.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push the branch: `git push origin feature/my-feature`
5. Open a Pull Request

For security vulnerabilities, please open a private issue rather than a public one.

---

## Legal & Safe Harbor

Vesper is developed as a technological tool to protect the legitimate privacy of digital communications.

The authors and contributors do not condone or support use of this software for illegal activities, do not have the technical ability to decrypt or intercept user communications, and provide this software "AS IS" without warranties of any kind.

If you host a public instance of Vesper, you are responsible for managing abuse reports and complying with local laws regarding public communications platforms.

---

## License

Distributed under the MIT License. See `LICENSE` for details.