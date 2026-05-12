# Contributing to Vesper

Thank you for your interest in contributing. Security-critical software especially benefits from external review — every pair of eyes matters.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Development Setup](#development-setup)
- [Branch & Commit Conventions](#branch--commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Cryptography Contributions](#cryptography-contributions)
- [Reporting Security Vulnerabilities](#reporting-security-vulnerabilities)

---

## Code of Conduct

Be respectful. Disagreements about technical approaches are expected and healthy — personal attacks are not. Contributions that introduce backdoors, weaken cryptographic guarantees, or add undisclosed telemetry will be rejected.

---

## Ways to Contribute

**Code**
- Bug fixes
- New features (open an issue first to discuss scope)
- Performance improvements
- Test coverage expansion

**Non-code**
- Security audits of the Rust crypto library or TypeScript E2E layer
- Documentation improvements
- UI translation (`client/messages/en.json`, `client/messages/uk.json`)
- Bug reports via GitHub Issues

---

## Development Setup

### Requirements

| Tool | Version |
|---|---|
| Node.js | 20+ |
| Rust | stable (1.75+) |
| wasm-pack | 0.12+ |
| PostgreSQL | 15+ |
| Redis | 7+ (optional) |

### First-time setup

```bash
# 1. Fork and clone
git clone https://github.com/<your-fork>/messenger-web-app.git
cd messenger-web-app

# 2. Build WASM crypto (required before starting the client)
cd crypto/wasm
wasm-pack build --target web --out-dir ../../client/src/wasm
cd ../..

# 3. Server
cd server
npm install
cp .env.example .env        # fill in DATABASE_URL, JWT_SECRET, etc.
npx prisma migrate dev
npm run start:dev

# 4. Client (new terminal)
cd client
npm install
cp .env.example .env.local  # fill in NEXT_PUBLIC_API_URL, etc.
npm run dev
```

### Running crypto tests

```bash
cd crypto
cargo test                   # all tests across all modules
cargo test double_ratchet    # specific module
cargo test device_sync       # VSP-1 protocol
cargo test -- --nocapture    # show println! output
```

---

## Branch & Commit Conventions

### Branch naming

```
feat/short-description
fix/issue-number-description
crypto/what-changed
docs/what-changed
refactor/what-changed
```

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(chat): add self-destruct timer UI
fix(e2e): handle ratchet decrypt error on page reload
crypto(group): fix MAX_SKIP boundary in receiver chain
docs: update deployment guide for Redis adapter
test(double-ratchet): add out-of-order delivery edge cases
```

---

## Pull Request Process

1. **One concern per PR.** Do not mix feature work with unrelated refactoring.
2. **Write tests** for new behaviour, especially in the crypto library.
3. **Update documentation** if you change public APIs, env variables, or the schema.
4. **Run existing tests** before submitting — a failing CI blocks merge.
5. Fill in the PR description: what changed, why, how to test it.
6. Request review from at least one maintainer.

PRs that touch `crypto/core/src/` require review from a maintainer with cryptography background before merge. This is non-negotiable.

---

## Cryptography Contributions

The `crypto/core` crate is the most sensitive part of the codebase.

- Read the existing module documentation carefully. Every design decision is intentional.
- Do **not** introduce new crate dependencies without prior discussion.
- Do **not** change KDF parameters, nonce generation, or AAD construction without a written rationale in the PR description.
- Property-based tests using `proptest` are preferred for new crypto primitives.
- If you find a flaw in the protocol, see [Reporting Security Vulnerabilities](#reporting-security-vulnerabilities) — do not open a public PR.

---

## Reporting Security Vulnerabilities

**Do not open a public GitHub issue for security vulnerabilities.**

Report them privately via [GitHub Security Advisories](https://github.com/VoroN5k/messenger-web-app/security/advisories/new) or by emailing the maintainer directly (address visible in Git commit history).

Include:
- A clear description of the vulnerability
- Steps to reproduce or a proof-of-concept
- Your assessment of impact and exploitability
- A proposed fix if you have one

You will receive an acknowledgement within 72 hours. Critical issues are patched within 14 days.