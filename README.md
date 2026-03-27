# 🦇 Vesper Messenger

> **A fully open-source, decentralized messenger with absolute End-to-End (E2E) encryption for text, media, and voice/video calls.**

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)
[![100% Open Source](https://img.shields.io/badge/100%25-Open_Source-blue.svg)](#manifesto)

Vesper is built on a simple premise: **Privacy is a fundamental human right.** Unlike mainstream messengers that hold the keys to your data on their servers, Vesper is built on a strict **Zero-Knowledge Architecture**. The server acts only as a blind courier—it routes encrypted packets but physically cannot read your messages, view your files, or access your private keys.

## 🛡️ The Manifesto

We believe that true security relies on transparency, not obscurity. Closed-source messengers ask you to *trust* them. Vesper asks you to *verify* the code yourself. Every cryptographic operation happens locally on your device.

## ✨ Killer Features

* 🔒 **Absolute E2E Encryption:** Not just text. Images, files, and voice messages are encrypted locally using AES-GCM (256-bit) before ever touching the network.
* 📞 **Secure P2P Calls:** High-quality Audio & Video calls powered by WebRTC. Traffic is encrypted via DTLS/SRTP with advanced NAT traversal (STUN/TURN).
* 💣 **Self-Destructing Messages:** Set granular local timers for sensitive payloads. Once the time is up, the message is wiped from both devices.
* 🔐 **PBKDF2 Encrypted Vault:** Your private E2E keys never leave your device unencrypted. They are secured in a local vault, protected by a Recovery PIN and hashed using PBKDF2 (600,000 iterations).
* 📴 **XSS-Resistant Offline Queue:** Unsent messages are held strictly **in-memory**. We do not use `localStorage` or `IndexedDB` for offline queues, ensuring that malicious browser extensions or XSS attacks cannot steal your unsent plaintext drafts.

## 🧠 Cryptographic Architecture

Vesper uses state-of-the-art, audited cryptographic primitives provided by the native Web Crypto API:

* **Key Exchange:** `X25519` (Elliptic Curve Diffie-Hellman) for generating shared secrets.
* **Message & File Encryption:** `AES-GCM` (256-bit) with securely generated `iv` (Initialization Vectors) for every payload.
* **Media Handling:** Each uploaded file gets a randomly generated, single-use symmetric key. The file is encrypted locally, and the key is transmitted within the E2E-encrypted text metadata.
* **Local Vault:** Private keys are encrypted before storage using a key derived from the user's PIN via `PBKDF2` (SHA-256).

## 🛠️ Tech Stack

**Frontend (Client):**
* Next.js 15 / React 19
* TailwindCSS v4 (Dark Cyber/Minimalist UI)
* Zustand (State Management)
* Web Crypto API
* WebRTC API

**Backend (Server):**
* NestJS
* Prisma ORM & PostgreSQL
* Socket.io (Real-time signaling and messaging)
* JWT Authentication

**Infrastructure:**
* Metered / Coturn (STUN/TURN for WebRTC NAT Traversal)

## 🚀 Getting Started

Want to run your own secure Vesper instance? Follow these steps:

### Prerequisites
* Node.js (v20+)
* PostgreSQL Database

### 1. Clone the repository
```bash
git clone https://github.com/VoroN5k/messenger-web-app.git

cd messenger-web-app

cd server
npm install
```

#### Copy the environment file and configure your Postgres DB & JWT Secrets
```
cp .env.example .env
```

#### Run Prisma migrations
```
npx prisma migrate dev
```

#### Start the server
```
npm run start:dev
```

### 2. Setup the Backend (Server)
```
cd server
npm install
```

#### Copy the environment file and configure your Postgres DB & JWT Secrets
```
cp .env.example .env
```

#### Run Prisma migrations
```
npx prisma migrate dev
```

#### Start the server
```
npm run start:dev
```

## ⚖️ Legal & Safe Harbor

Vesper is developed purely as a technological tool to protect the legitimate privacy of digital communications. The authors and contributors:

    Do not condone, support, or encourage the use of this software for any illegal activities (including but not limited to CSAM, terrorism, or illicit trade).

    Do not have the technical ability to decrypt, read, or intercept user communications due to the mathematical nature of End-to-End encryption.

    Provide this software "AS IS", without warranties of any kind.

If you host a public instance of Vesper, you are responsible for managing Abuse Reports and complying with the local laws of your jurisdiction regarding public, unencrypted channels.

## 🤝 Contributing

Security relies on peer review. We welcome contributions, bug reports, and security audits from the community.

    Fork the Project

    Create your Feature Branch (git checkout -b feature/AmazingFeature)

    Commit your Changes (git commit -m 'Add some AmazingFeature')

    Push to the Branch (git push origin feature/AmazingFeature)

    Open a Pull Request

## 📄 License

Distributed under the MIT License. See LICENSE for more information.