# Deployment Guide

This guide covers deploying Vesper to production. The reference target is **Fly.io** (what the project currently uses), but the steps translate to any container-based host.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Infrastructure Overview](#infrastructure-overview)
- [Database Setup](#database-setup)
- [Supabase Storage Setup](#supabase-storage-setup)
- [VAPID Keys](#vapid-keys)
- [Server Deployment (Fly.io)](#server-deployment-flyio)
- [Client Deployment (Vercel)](#client-deployment-vercel)
- [Redis (Optional)](#redis-optional)
- [Environment Variables Reference](#environment-variables-reference)
- [Post-Deployment Checklist](#post-deployment-checklist)
- [Self-Hosted (Docker Compose)](#self-hosted-docker-compose)

---

## Prerequisites

- A PostgreSQL 15+ database (Neon, Railway, Supabase, or self-hosted)
- A Supabase project (for file storage)
- An SMTP provider (Resend, Postmark, Mailgun, etc.)
- flyctl CLI installed (`curl -L https://fly.io/install.sh | sh`)

---

## Infrastructure Overview

```
                    ┌─────────────────────┐
                    │   Vercel (Client)   │
                    │   Next.js 15        │
                    └─────────┬───────────┘
                              │ HTTPS / WSS
                    ┌─────────▼───────────┐
                    │   Fly.io (Server)   │
                    │   NestJS            │
                    └──┬──────┬──────┬───┘
                       │      │      │
              ┌────────▼┐  ┌──▼──┐  ┌▼──────────────────┐
              │PostgreSQL│  │Redis│  │Supabase Storage    │
              │(Neon)    │  │     │  │(encrypted files)   │
              └──────────┘  └─────┘  └────────────────────┘
```

---

## Database Setup

### Neon (recommended for Fly.io)

1. Create a project at [neon.tech](https://neon.tech)
2. Copy the connection string (pooled version for production)
3. Run migrations:

```bash
cd server
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

> Use `migrate deploy` (not `migrate dev`) in production — it only applies pending migrations without creating new ones.

---

## Supabase Storage Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **Storage → New bucket**, name it (e.g. `vesper-files`), set to **private**
3. Go to **Project Settings → API** and copy:
    - `Project URL` → `SUPABASE_URL`
    - `service_role` key → `SUPABASE_SERVICE_KEY` (keep this secret)
4. Set the bucket name → `SUPABASE_STORAGE_BUCKET`

**RLS policy** — because uploads go through the NestJS server (not directly from the browser), the service role key bypasses RLS. No additional policies are needed, but you should restrict the service key to storage operations only via Supabase dashboard.

---

## VAPID Keys

Generate a VAPID key pair for Web Push:

```bash
npx web-push generate-vapid-keys
```

Copy the output:
- **Public key** → `VAPID_PUBLIC_KEY` (server) and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (client)
- **Private key** → `VAPID_PRIVATE_KEY` (server only — never expose to client)
- Set `VAPID_EMAIL` to `mailto:your@email.com`

---

## Server Deployment (Fly.io)

### Initial setup

```bash
cd server

# Create the app (first time only)
fly launch --name vesper-server --region ams --no-deploy

# Set secrets (do not put these in fly.toml)
fly secrets set \
  DATABASE_URL="postgresql://..." \
  JWT_SECRET="$(openssl rand -hex 32)" \
  SUPABASE_URL="https://xxx.supabase.co" \
  SUPABASE_SERVICE_KEY="eyJ..." \
  SUPABASE_STORAGE_BUCKET="vesper-files" \
  VAPID_EMAIL="mailto:admin@yourdomain.com" \
  VAPID_PUBLIC_KEY="BF..." \
  VAPID_PRIVATE_KEY="xxx" \
  MAIL_HOST="smtp.resend.com" \
  MAIL_PORT="587" \
  MAIL_USER="resend" \
  MAIL_PASS="re_..." \
  CLIENT_URL="https://your-client.vercel.app" \
  SERVER_URL="https://vesper-server.fly.dev" \
  ADMIN_EMAIL="admin@yourdomain.com" \
  COOKIE_SECURE="true"
```

### `fly.toml` (example)

```toml
app = "vesper-server"
primary_region = "ams"

[build]

[env]
  PORT = "4000"
  NODE_ENV = "production"

[http_service]
  internal_port = 4000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1

  [http_service.concurrency]
    type = "connections"
    hard_limit = 500
    soft_limit = 400

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
```

### Deploy

```bash
fly deploy
```

### WebSocket support

Fly.io supports WebSocket connections out of the box. The Socket.io gateway runs on path `/rt` — ensure your proxy/load balancer does not strip the `Upgrade` header.

---

## Client Deployment (Vercel)

```bash
cd client

# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Set the following environment variables in the Vercel dashboard (or `vercel env add`):

```
NEXT_PUBLIC_API_URL=https://vesper-server.fly.dev/api
NEXT_PUBLIC_SOCKET_URL=https://vesper-server.fly.dev
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BF...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
```

---

## Redis (Optional)

Redis is required for:
- Socket.io pub/sub when running **multiple server instances** (horizontal scaling)
- Distributed device sync session state

### Fly.io Redis (Upstash)

```bash
fly redis create --name vesper-redis --region ams --plan free-6m
fly redis status vesper-redis  # copy the redis:// URL
fly secrets set REDIS_URL="redis://..."
```

Without Redis, the server falls back to in-memory session state and Socket.io in-process mode — this works fine for a single-instance deployment.

---

## Environment Variables Reference

### Server (complete)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret for signing access tokens (min 32 chars) |
| `COOKIE_SECURE` | ✅ | Must be `"true"` in production (HTTPS) |
| `CLIENT_URL` | ✅ | Frontend origin — used for CORS and email links |
| `SERVER_URL` | ✅ | Backend origin — used in email verification links |
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase service role key |
| `SUPABASE_STORAGE_BUCKET` | ✅ | Storage bucket name |
| `VAPID_EMAIL` | ✅ | `mailto:` address for VAPID |
| `VAPID_PUBLIC_KEY` | ✅ | VAPID public key |
| `VAPID_PRIVATE_KEY` | ✅ | VAPID private key |
| `MAIL_HOST` | ✅ | SMTP host |
| `MAIL_PORT` | ✅ | SMTP port (usually 587) |
| `MAIL_USER` | ✅ | SMTP username |
| `MAIL_PASS` | ✅ | SMTP password |
| `ADMIN_EMAIL` | ✅ | Email to receive report notifications |
| `PORT` | — | Server port (default: 4000) |
| `REDIS_URL` | — | Redis connection URL (enables pub/sub adapter) |

### Client (complete)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | Backend REST API base URL |
| `NEXT_PUBLIC_SOCKET_URL` | ✅ | WebSocket server URL (origin only, no path) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ✅ | VAPID public key for push subscriptions |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase URL (for extracting storage paths from URLs) |

---

## Post-Deployment Checklist

- [ ] `GET https://your-server.fly.dev/api/health` returns `{"status":"ok"}`
- [ ] Registration email arrives within 60 seconds
- [ ] Password reset email arrives within 60 seconds
- [ ] File upload works and signed URLs resolve
- [ ] WebSocket connects (check browser DevTools → Network → WS)
- [ ] Push notifications work on Chrome (requires HTTPS)
- [ ] `COOKIE_SECURE=true` is set — verify `Set-Cookie` response has `Secure; SameSite=None`
- [ ] Database migrations are up to date: `npx prisma migrate status`
- [ ] VAPID keys match between server and client

---

## Self-Hosted (Docker Compose)

For a fully self-hosted deployment without Fly.io or Vercel:

```yaml
# docker-compose.yml (example — adapt to your needs)
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: vesper
      POSTGRES_USER: vesper
      POSTGRES_PASSWORD: changeme
    volumes:
      - pg_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

  server:
    build: ./server
    depends_on: [postgres, redis]
    environment:
      DATABASE_URL: postgresql://vesper:changeme@postgres:5432/vesper
      REDIS_URL: redis://redis:6379
      COOKIE_SECURE: "true"
      # ... other secrets via .env file or secrets manager
    ports:
      - "4000:4000"

  client:
    build: ./client
    environment:
      NEXT_PUBLIC_API_URL: https://your-domain.com/api
      NEXT_PUBLIC_SOCKET_URL: https://your-domain.com
      # ...
    ports:
      - "3000:3000"

volumes:
  pg_data:
```

> **Note:** You will need to configure a reverse proxy (nginx, Caddy, Traefik) in front of the client and server to handle HTTPS and WebSocket upgrades. HTTPS is required for `Secure` cookies, Web Push, and the Web Crypto API in some browsers.