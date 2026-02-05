#!/bin/sh
set -e

echo "[Entrypoint] ========================================"
echo "[Entrypoint] Research Note - Starting Services"
echo "[Entrypoint] ========================================"

# 0. Kill ALL nginx processes (including PID 25 from base image)
echo "[Entrypoint] Stopping ALL nginx processes..."
ps aux | grep nginx | grep -v grep || echo "No nginx processes"
# Kill by PID found on port 8080
PORT_8080_PID=$(netstat -tlnp 2>/dev/null | grep :8080 | awk '{print $7}' | cut -d'/' -f1)
if [ -n "$PORT_8080_PID" ]; then
  echo "[Entrypoint] Killing nginx on port 8080 (PID: $PORT_8080_PID)"
  kill -9 $PORT_8080_PID 2>/dev/null || true
fi
# Kill all nginx processes by name
pkill -9 nginx 2>/dev/null || true
killall -9 nginx 2>/dev/null || true
sleep 2
echo "[Entrypoint] After cleanup - checking port 8080:"
netstat -tlnp 2>/dev/null | grep :8080 || echo "✅ Port 8080 is free"
ps aux | grep nginx | grep -v grep || echo "✅ No nginx processes running"

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
  # Try curl first, fallback to wget
  if command -v curl >/dev/null 2>&1; then
    if curl -s -f http://localhost:3001/api/health >/dev/null 2>&1; then
      echo "[Entrypoint] ✅ Backend healthy (via curl)"
      BACKEND_HEALTHY=true
      break
    fi
  elif wget --quiet --spider http://localhost:3001/api/health 2>/dev/null; then
    echo "[Entrypoint] ✅ Backend healthy (via wget)"
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

# 4. Configure nginx port (Railway uses PORT env var)
NGINX_PORT=${PORT:-8080}
echo "[Entrypoint] Railway PORT env var: $PORT"
echo "[Entrypoint] Configuring Nginx to listen on port $NGINX_PORT..."
echo "[Entrypoint] Checking what's using port $NGINX_PORT..."
netstat -tlnp 2>/dev/null | grep :$NGINX_PORT || echo "Port $NGINX_PORT is free"
sed -i "s/listen 8080;/listen $NGINX_PORT;/" /etc/nginx/nginx.conf
echo "[Entrypoint] Nginx config updated. Verifying..."
grep "listen" /etc/nginx/nginx.conf | head -5

# 5. Start Nginx
echo "[Entrypoint] Starting Nginx..."
echo "[Entrypoint] ========================================"
exec nginx -g "daemon off;"
