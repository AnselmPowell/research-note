#!/bin/sh
set -e

echo "[Entrypoint] ========================================"
echo "[Entrypoint] Research Note - Starting Services"
echo "[Entrypoint] ========================================"

# 0. Kill any existing nginx processes
echo "[Entrypoint] Stopping default nginx..."
pkill -9 nginx 2>/dev/null || true
killall -9 nginx 2>/dev/null || true
sleep 2

# 1. Inject frontend env vars
echo "[Entrypoint] Injecting frontend environment..."
/inject-env.sh > /dev/null 2>&1 &
sleep 2

# 2. Start backend
echo "[Entrypoint] Starting backend API..."
cd /app/backend
NODE_ENV=production node server.js 2>&1 | tee /var/log/backend.log &
BACKEND_PID=$!
echo "[Entrypoint] ✅ Backend started (PID: $BACKEND_PID)"

# 3. Wait for backend health
echo "[Entrypoint] Waiting for backend..."
BACKEND_HEALTHY=false
for i in $(seq 1 30); do
  if wget --quiet --spider http://localhost:3001/api/health 2>/dev/null; then
    echo "[Entrypoint] ✅ Backend healthy"
    BACKEND_HEALTHY=true
    break
  fi
  sleep 1
done

if [ "$BACKEND_HEALTHY" = "false" ]; then
  echo "[Entrypoint] ⚠️  Backend health timeout - showing backend logs:"
  cat /var/log/backend.log 2>/dev/null || echo "No backend logs found"
  echo "[Entrypoint] Checking if backend process is running..."
  ps aux | grep node || echo "No node processes found"
fi

# 4. Start Nginx
echo "[Entrypoint] Starting Nginx..."
echo "[Entrypoint] ========================================"
exec nginx -g "daemon off;"
