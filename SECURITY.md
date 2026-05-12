# Security Policy

## Supported Versions

Vesper is currently in active development. Security fixes are applied to the latest commit on `main`. There are no versioned release branches at this time.

| Branch | Supported |
|---|---|
| `main` | ✅ Yes |
| Older forks / snapshots | ❌ No |

---

## Threat Model

Understanding what Vesper protects against (and what it does not) is essential for evaluating the security of a deployment.

### In scope

| Threat | Mitigation |
|---|---|
| Server compromise / insider threat | Zero-knowledge architecture — server never holds plaintext or private keys |
| Network interception (MITM) | TLS for transport; Signal Double Ratchet for E2E |
| Passive server-side logging | Content is ciphertext; only metadata (timestamps, membership) is readable |
| Replay attacks | AES-GCM AEAD + monotonic sequence numbers in AAD (device sync), ratchet forward secrecy (DM) |
| Ciphertext reordering (group) | Ed25519 signature covers `key_id \|\| iteration \|\| ciphertext` |
| PIN brute-force on stolen recovery blob | Argon2id (32 MB, 2 passes) — GPU-resistant |
| Refresh token theft / reuse | Tokens are rotated on every use; the previous token hash is stored for reuse detection |
| XSS access to unsent message drafts | Offline queue held in-memory only; never written to `localStorage` or `IndexedDB` |
| SSRF in OG metadata fetcher | DNS validation against private IP blocklists before each outbound request |
| Malformed key bundles | Ed25519 SPK signature verified server-side (`verifyKeyBundle`) and client-side (X3DH) before any DH step |

### Out of scope

| Threat | Notes |
|---|---|
| Compromise of the end-user's device | If the device is owned, all bets are off — this is true of any E2E messenger |
| Metadata analysis at the network level | Vesper does not implement traffic padding or onion routing |
| Malicious server returning crafted key bundles | Key pinning / transparency log is not yet implemented |
| Physical access to an unlocked device | Session stays active; Recovery PIN is not required after initial unlock |

---

## Cryptographic Assumptions

Vesper's security rests on the following assumptions:

1. **X25519 is secure** — computational Diffie-Hellman assumption in Curve25519.
2. **Ed25519 is secure** — discrete log assumption; collision resistance of SHA-512.
3. **AES-256-GCM is secure** — AES is a pseudorandom permutation; GCM provides authenticated encryption.
4. **Argon2id is memory-hard** — adversary cannot significantly reduce key derivation cost by parallelisation.
5. **HKDF-SHA256 is a secure KDF** — PRF assumption on HMAC-SHA256.
6. **The browser's CSPRNG is trustworthy** — `crypto.getRandomValues()` is assumed to produce unpredictable output.

If any of these assumptions breaks (e.g. a new cryptanalytic result), the affected components would need to be replaced. The modular structure of `crypto/core` is designed to make such replacements feasible.

---

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

### How to report

1. Open a [GitHub Security Advisory](https://github.com/VoroN5k/messenger-web-app/security/advisories/new) on this repository, **or**
2. Email the maintainer directly — the address is visible in the Git commit history.

### What to include

- A clear description of the vulnerability and affected component
- Steps to reproduce or a proof-of-concept (even partial is helpful)
- Your assessment of severity and exploitability
- Suggested fix or mitigating control, if you have one

### What to expect

| Timeline | Action |
|---|---|
| Within 72 hours | Acknowledgement of your report |
| Within 7 days | Initial assessment and severity classification |
| Within 14 days | Patch for Critical / High severity issues |
| After patch | Public disclosure coordinated with reporter |

We follow responsible disclosure. If you need more time to prepare a write-up, just let us know and we will delay the public disclosure accordingly.

---

## Known Limitations

- **No key transparency / pinning.** A malicious server could serve a different key bundle for a user and facilitate a MITM attack on future sessions. Safety numbers / key fingerprint comparison (like Signal's Safety Numbers) is planned but not yet implemented.
- **Metadata leakage.** The server can observe who communicates with whom and when, even though it cannot read the content.
- **Single-server deployment.** Federation is not supported. Self-hosters must trust the instance operator.