# ─── Stage 1: Alpine base ───────────────────────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ─── Stage 2: Install all dependencies ──────────────────────────────────────
# npm install instead of npm ci — package-lock.json generated on Windows contains
# only win32 platform binaries; Linux Docker can't validate it with npm ci.
FROM base AS deps
COPY package*.json ./
RUN npm install --prefer-offline 2>/dev/null || npm install

# ─── Stage 3: Development (hot-reload via bind mount) ───────────────────────
FROM base AS development
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]

# ─── Stage 4: Build (NEXT_PUBLIC_* must be baked in at build time) ──────────
FROM base AS builder

# Accept public env vars as build args (they will be embedded in the JS bundle)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
# Backend URL used by Next.js rewrites (server-side proxy) — not exposed to the browser
ARG BACKEND_URL

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV BACKEND_URL=$BACKEND_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ─── Stage 5: Production (Next.js standalone output) ────────────────────────
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Standalone output bundles its own minimal server.js + node_modules subset
COPY --from=builder           /app/public        ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
