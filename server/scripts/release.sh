#!/bin/sh
# Release script — runs inside the production container before traffic is cut over.
# fly.io executes this via [deploy] release_command in fly.toml.
#
# Prisma requires a direct (non-pooled) connection for migrations.
# Set DIRECT_URL to the Supabase direct connection string (port 5432).
# If DIRECT_URL is not set, fall back to DATABASE_URL.
set -e

echo "[release] Running database migrations..."
DATABASE_URL="${DIRECT_URL:-$DATABASE_URL}" npx prisma migrate deploy
echo "[release] Migrations applied successfully."
