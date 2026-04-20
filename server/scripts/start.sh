#!/bin/sh
set -e

MAIN_JS=$(find /app/dist -name "main.js" | head -1)

if [ -z "$MAIN_JS" ]; then
  echo "❌ ERROR: main.js not found in /app/dist!"
  echo "Contents of /app/dist:"
  find /app/dist -type f | head -30
  exit 1
fi

echo "✅ Starting: node $MAIN_JS"
exec node "$MAIN_JS"
