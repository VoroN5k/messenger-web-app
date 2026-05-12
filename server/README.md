# Vesper — Server

The NestJS backend for Vesper Messenger. Acts as a **blind courier** — routes encrypted packets, manages sessions, and stores ciphertext blobs, but is architecturally prevented from reading message content.

---

## Stack

| Library | Purpose |
|---|---|
| NestJS | Modular framework with DI, guards, interceptors |
| Prisma ORM | Type-safe DB access with migration history |
| PostgreSQL | Primary data store |
| Socket.io | Real-time events, WebRTC signaling, device sync |
| Redis | Socket.io pub/sub adapter (optional, for horizontal scaling) |
| JWT + bcryptjs | Authentication and password hashing |
| @otplib/preset-default | TOTP-based 2FA (Google Authenticator) |
| web-push | Web Push Notifications via VAPID |
| Supabase JS | File storage client |
| @nestjs-modules/mailer | Transactional email (SMTP) |
| geoip-lite | Session geolocation (offline database) |

---

## Module Overview

### `AuthModule`

Handles the full authentication lifecycle:

- `POST /auth/register` — creates account, sends verification email
- `POST /auth/login` — validates credentials + 2FA, issues JWT + refresh token
- `POST /auth/refresh` — rotates refresh token (atomic, reuse detection)
- `POST /auth/logout` / `logout-all` — invalidates sessions
- `GET /auth/sessions` — returns active sessions with IP geolocation
- `DELETE /auth/sessions/:id` — terminate specific session
- `POST /auth/forgot-password` / `reset-password` — token-based reset (1-hour TTL)
- `GET /auth/verify-email` — email verification link handler
- `POST /auth/2fa/setup|enable|disable` — TOTP management

**Refresh token security:** tokens are stored as SHA-256 hashes. On each rotation, the previous hash is saved in `prevRefreshToken`. If the old hash is presented again (replay), the server detects it and logs a warning without terminating all sessions (handles multi-tab race conditions gracefully).

### `ChatModule`

WebSocket gateway built on Socket.io. Key responsibilities:

- Message delivery to `conv_{id}` rooms
- Typing indicators
- WebRTC call signaling (offer/answer/ICE)
- Device sync signaling (VSP-1)
- Rate limiting per event type (in-memory sliding window)
- Scheduled message delivery (in-process `setTimeout`, reloaded on startup)

Each connected socket joins `user_{userId}` (for personal events) and `conv_{convId}` for every conversation the user is a member of.

### `ConversationsModule`

REST + service layer for conversation management:

- Paginated conversation list with last message, unread count, pinned message
- Cursor-based message pagination (`?cursor=`, `?after=`, `?around=`)
- Message CRUD with 15-minute edit window
- Emoji reactions (10 allowed emojis, toggle behaviour)
- File message support
- Multi-pin messages per conversation (max 20)
- Conversation clear: `scope=self` (watermark) or `scope=both` (soft-delete)
- Group sender key distribution (v2 X3DH envelopes)
- Scheduled message delivery support

`CleanupService` runs every 10 minutes to hard-delete soft-deleted messages past a 1-hour grace period and remove orphaned files from Supabase.

### `KeysModule`

Manages public key material:

- **v1** (legacy): raw X25519 public key, PBKDF2-encrypted private key
- **v2 identity**: X3DH key bundle (ik_sign_pub + ik_dh_pub + spk + spk_sig), Argon2id recovery blob
- **v3 device**: per-device X3DH bundles via `DevicesModule`

Bundle signature is verified server-side (`verifyKeyBundle` in `common/verify-bundle.ts`) using Node.js `crypto.verify` on the Ed25519 SPK signature before storing.

### `DevicesModule`

Registry of per-device X3DH bundles for v3 multi-device messaging:

- `POST /devices` — idempotent registration (same bundle → update `lastSeenAt`)
- Max 5 devices per user
- Bundle signature verified on registration
- `GET /keys/v3/device/:id` — fetch single device bundle
- `GET /keys/v3/devices/:userId` — fetch all device bundles for a user

### `UploadModule`

Wraps Supabase Storage:

- Files stored at `{userId}/{uuid}{ext}` (private bucket)
- Signed URLs generated server-side with 1-hour TTL, cached for 55 minutes
- All file URLs returned as `/storage/{bucket}/{path}` (server-relative proxy paths)
- `deleteFile` called on message soft-delete if no other messages reference the URL

### `OGModule`

Server-side Open Graph metadata fetcher with full SSRF protection:

- DNS resolution with private IP blocklist (RFC 1918, link-local, loopback, etc.)
- IPv4 and IPv6 private range detection
- Redirect following with per-hop DNS validation
- Response size capped at 512 KB
- 8-second timeout
- Results cached in-memory (10 min success, 2 min error)

### `ReportsModule`

User feedback and bug report system:

- Types: `BUG`, `FEATURE_REQUEST`, `FEEDBACK`, `OTHER`
- Statuses: `NEW → REVIEWED → RESOLVED → CLOSED`
- Admin note field for internal tracking
- Email notification to `ADMIN_EMAIL` on new report
- Screenshot URL cleaned from storage on `CLOSED`

---

## Database Schema Highlights

The full schema is in `prisma/schema.prisma`. Key design decisions:

**No plaintext messages.** The `Message.content` column always holds ciphertext. The server has no access to decryption keys.

**Soft delete with grace period.** Messages are marked `deletedAt` first, then hard-deleted by `CleanupService` after 1 hour. This allows "undo" at the client level and avoids immediate storage deletion cascades.

**Per-user conversation membership.** `ConversationMember` tracks `lastReadAt` (for unread counts), `clearedAt` (for per-user clear), `isPinned`, and `isArchived` — all per-user state that doesn't affect other members.

**Multi-device envelopes.** `MessageKeyEnvelope` stores `(messageId, deviceId, ciphertext)` tuples — one per device per message in v3 mode.

---

## Development

```bash
cd server
npm install
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET, etc.
npx prisma migrate dev
npm run start:dev
```

### Useful commands

```bash
npm run start:dev        # watch mode
npm run build            # compile TypeScript
npx prisma studio        # visual DB browser
npx prisma migrate dev   # create and apply a new migration
npx prisma migrate reset # reset DB (dev only)
```

### Adding a migration

```bash
# After modifying prisma/schema.prisma:
npx prisma migrate dev --name describe_your_change
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret (min 32 characters) |
| `COOKIE_SECURE` | `"true"` in production (sets Secure; SameSite=None on refresh token cookie) |
| `CLIENT_URL` | Frontend origin (CORS allowlist + email link base) |
| `SERVER_URL` | Backend public URL (email verification link base) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `SUPABASE_STORAGE_BUCKET` | Storage bucket name |
| `VAPID_EMAIL` | `mailto:` address for Web Push VAPID |
| `VAPID_PUBLIC_KEY` | VAPID public key |
| `VAPID_PRIVATE_KEY` | VAPID private key |
| `MAIL_HOST` | SMTP hostname |
| `MAIL_PORT` | SMTP port (587 for STARTTLS) |
| `MAIL_USER` | SMTP username |
| `MAIL_PASS` | SMTP password |
| `ADMIN_EMAIL` | Recipient for report notifications |
| `PORT` | Server port (default: 4000) |
| `REDIS_URL` | Redis URL — enables Socket.io pub/sub adapter |

---

## WebSocket Event Reference

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `sendMessage` | `{ conversationId, content, envelopes?, senderDeviceId?, fileUrl?, replyToId?, metadata?, scheduledAt? }` | Send a message |
| `markAsRead` | `{ conversationId }` | Mark conversation as read |
| `typing` | `{ conversationId, isTyping }` | Typing indicator |
| `editMessage` | `{ messageId, content }` | Edit a message |
| `deleteMessage` | `{ messageId }` | Soft-delete a message |
| `toggleReaction` | `{ messageId, emoji }` | Add or remove a reaction |
| `pinMessage` | `{ conversationId, messageId }` | Pin a message |
| `unpinMessage` | `{ conversationId, messageId }` | Unpin a message |
| `forwardMessage` | `{ messageId, targetConversationId, reEncryptedContent? }` | Forward a message |
| `callUser` | `{ callId, conversationId, targetUserId, callType }` | Initiate a call |
| `callAccept` | `{ callId, callType }` | Accept incoming call |
| `callReject` | `{ callId, conversationId }` | Reject incoming call |
| `callEnd` | `{ callId, conversationId }` | End active call |
| `sdpOffer` / `sdpAnswer` | `{ callId, offer/answer }` | WebRTC SDP relay |
| `iceCandidate` | `{ callId, candidate }` | ICE candidate relay |
| `notifyKeyRotated` | — | Notify peers that this user's keys changed |
| `deviceSyncStart` | `{ sessionId, ekSource, sdpOffer }` | Start device sync (source) |
| `deviceSyncJoin` | `{ sessionId, ekTarget }` | Join device sync (target) |
| `deviceSyncRelayAnswer` | `{ sessionId, sdpAnswer }` | Relay SDP answer |
| `deviceSyncIce` | `{ sessionId, candidate }` | Relay ICE candidate |
| `deviceSyncAbort` | `{ sessionId }` | Abort sync session |

### Server → Client

| Event | Description |
|---|---|
| `onMessage` | New message delivered to a conversation |
| `messageEdited` | Message content updated |
| `messageDeleted` | Message soft-deleted |
| `reactionToggled` | Reactions updated for a message |
| `conversationRead` | Another member read the conversation |
| `onTyping` | Typing indicator from another member |
| `userStatusChanged` | User came online or went offline |
| `messagePinned` / `messageUnpinned` | Pinned message changed |
| `addedToConversation` | Client was added to a new conversation |
| `peerKeyRotated` | A contact regenerated their E2E keys |
| `senderKeyRedistributionRequested` | Group member needs a new sender key |
| `incomingCall` | Incoming call notification |
| `callAccepted` / `callRejected` / `callEnded` / `callBusy` | Call state events |
| `sdpOffer` / `sdpAnswer` / `iceCandidate` | WebRTC signaling relay |
| `deviceSyncOffer` / `deviceSyncPeerJoined` / `deviceSyncPeerAnswer` | Sync session signaling |
| `deviceSyncAborted` / `deviceSyncError` | Sync session failure |
| `rateLimited` | Client exceeded rate limit for an event |