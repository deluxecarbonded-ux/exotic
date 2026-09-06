#!/usr/bin/env bash
# Exotic — one-command restore after a sandbox recycle.
# Recycles wipe node_modules and .next (platform snapshot excludes them);
# everything else (code, locales, public/sfx, .env.local) persists.
# Usage:  cd /home/user/exotic && ./run.sh
set -u

cd "$(dirname "$0")"

echo "── Exotic restore ──────────────────────────────"

# 1) dependencies
if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
  echo "[1/3] node_modules missing → npm install…"
  npm i --no-audit --no-fund || { echo "npm install failed"; exit 1; }
else
  echo "[1/3] node_modules present ✓"
fi

# 2) production build
if [ ! -f .next/BUILD_ID ]; then
  echo "[2/3] build missing → next build…"
  npm run build || { echo "build failed"; exit 1; }
else
  echo "[2/3] build present ✓"
fi

# 3) serve on :3000 with a supervisor — if the server ever crashes it
#    restarts within 2s instead of leaving the app dead
echo "[3/3] starting server on port 3000 (auto-restart enabled)…"
set -a; . ./.env.local 2>/dev/null; set +a
while true; do
  npx next start -p 3000
  code=$?
  echo "⚠ server exited (code $code) — restarting in 2s…"
  sleep 2
done
