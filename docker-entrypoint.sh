#!/bin/sh
set -e

echo "[Entrypoint] ========================================"
echo "[Entrypoint] Research Note - Starting Services"
echo "[Entrypoint] ========================================"

# 1. Inject frontend env vars
echo "[Entrypoint] Injecting frontend environment..."
/inject-env.sh > /dev/null 2>&1 &
sleep 2

# 2. Start backend
echo "[Entrypoint] Starting backend API..."
cd /app/backend
NODE_ENV=production node server.js > /var/log/backend.log 2>&1 &
BACKEND_PID=$!
echo "[Entrypoint] ✅ Backend started (PID: $BACKEND_PID)"

# 3. Wait for backend health
echo "[Entrypoint] Waiting for backend..."
for i in $(seq 1 30); do
  if wget --quiet --spider http://localhost:3001/api/health 2>/dev/null; then
    echo "[Entrypoint] ✅ Backend healthy"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "[Entrypoint] ⚠️  Backend health timeout"
  fi
  sleep 1
done

# 4. Start Nginx
echo "[Entrypoint] Starting Nginx..."
echo "[Entrypoint] ========================================"
exec nginx -g "daemon off;"
