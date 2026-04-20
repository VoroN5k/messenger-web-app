# ─── Stage 1: Alpine base ───────────────────────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ─── Stage 2: Install all dependencies ──────────────────────────────────────
FROM base AS deps
COPY package*.json ./
RUN npm ci

# ─── Stage 3: Development (hot-reload via bind mount) ───────────────────────
FROM base AS development
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 4000
CMD ["npm", "run", "start:dev"]

# ─── Stage 4: Build ──────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma client into /app/generated/prisma
RUN npx prisma generate
RUN npm run build
# Debug: show where main.js ended up so we can fix CMD if needed
RUN echo "=== dist layout ===" && find /app/dist -name "main.js" || echo "❌ main.js NOT FOUND"

# ─── Stage 5: Production ─────────────────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libc6-compat

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nestjs

# Install only production dependencies
COPY --chown=nestjs:nodejs package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output and Prisma artifacts
COPY --from=builder --chown=nestjs:nodejs /app/dist          ./dist
COPY --from=builder --chown=nestjs:nodejs /app/generated     ./generated
COPY --chown=nestjs:nodejs prisma          ./prisma
COPY --chown=nestjs:nodejs prisma.config.ts ./prisma.config.ts
COPY --chown=nestjs:nodejs scripts         ./scripts

USER nestjs
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["sh", "scripts/start.sh"]
