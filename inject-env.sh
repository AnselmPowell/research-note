#!/bin/sh

# inject-env.sh - Secure runtime environment variable injection for Railway
# SECURITY: Only injects client-safe variables (VITE_* prefixed)
# Server-side API keys remain in process.env and are not exposed to browser

echo "[ENV-TRACE] ========================================"
echo "[ENV-TRACE] RUNTIME INJECTION - CONTAINER STARTUP"
echo "[ENV-TRACE] ========================================"
echo "[ENV-TRACE] Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo "[ENV-TRACE] "
echo "[ENV-TRACE] === RAILWAY ENVIRONMENT VARIABLES CHECK ==="
echo "[ENV-TRACE] "

# Check each variable and log its presence/length
echo "[ENV-TRACE] CLIENT-SAFE VARIABLES (will be injected to window.ENV):"
echo "[ENV-TRACE] - VITE_NEON_AUTH_URL: $(if [ -n "$VITE_NEON_AUTH_URL" ]; then echo "✅ PRESENT (length: ${#VITE_NEON_AUTH_URL})"; else echo "❌ MISSING"; fi)"
echo "[ENV-TRACE] - VITE_MICROSOFT_CLIENT_ID: $(if [ -n "$VITE_MICROSOFT_CLIENT_ID" ]; then echo "✅ PRESENT (length: ${#VITE_MICROSOFT_CLIENT_ID})"; else echo "❌ MISSING"; fi)"
echo "[ENV-TRACE] - VITE_MICROSOFT_TENANT_ID: $(if [ -n "$VITE_MICROSOFT_TENANT_ID" ]; then echo "✅ PRESENT (value: $VITE_MICROSOFT_TENANT_ID)"; else echo "❌ MISSING (will default to 'common')"; fi)"
echo "[ENV-TRACE] "
echo "[ENV-TRACE] SERVER-SIDE VARIABLES (only capability flags exposed):"
echo "[ENV-TRACE] - GEMINI_API_KEY: $(if [ -n "$GEMINI_API_KEY" ]; then echo "✅ PRESENT (length: ${#GEMINI_API_KEY})"; else echo "❌ MISSING"; fi)"
echo "[ENV-TRACE] - GOOGLE_SEARCH_KEY: $(if [ -n "$GOOGLE_SEARCH_KEY" ]; then echo "✅ PRESENT (length: ${#GOOGLE_SEARCH_KEY})"; else echo "❌ MISSING"; fi)"
echo "[ENV-TRACE] - OPENAI_API_KEY: $(if [ -n "$OPENAI_API_KEY" ]; then echo "✅ PRESENT (length: ${#OPENAI_API_KEY})"; else echo "❌ MISSING"; fi)"
echo "[ENV-TRACE] - DATABASE_URL: $(if [ -n "$DATABASE_URL" ]; then echo "✅ PRESENT (length: ${#DATABASE_URL})"; else echo "❌ MISSING"; fi)"
echo "[ENV-TRACE] "
echo "[ENV-TRACE] === CREATING env-config.js ==="

# Create JavaScript file with ONLY client-safe environment variables
cat > /usr/share/nginx/html/env-config.js << EOF
// [ENV-TRACE] This file is generated at RUNTIME by inject-env.sh
// [ENV-TRACE] Generated at: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

// Client-safe environment variables (safe for browser exposure)
window.ENV = {
  VITE_NEON_AUTH_URL: "${VITE_NEON_AUTH_URL}",
  VITE_MICROSOFT_CLIENT_ID: "${VITE_MICROSOFT_CLIENT_ID}",
  VITE_MICROSOFT_TENANT_ID: "${VITE_MICROSOFT_TENANT_ID}",
  NODE_ENV: "production"
};

// Server capability indicators (no sensitive data exposed)
window.SERVER_CONFIG = {
  hasGeminiKey: ${GEMINI_API_KEY:+true},
  hasGoogleSearch: ${GOOGLE_SEARCH_KEY:+true},
  hasOpenAI: ${OPENAI_API_KEY:+true},
  hasDatabase: ${DATABASE_URL:+true}
};

console.log('[ENV-TRACE] ========================================');
console.log('[ENV-TRACE] BROWSER - env-config.js LOADED');
console.log('[ENV-TRACE] ========================================');
console.log('[ENV-TRACE] window.ENV:', window.ENV);
console.log('[ENV-TRACE] window.SERVER_CONFIG:', window.SERVER_CONFIG);
console.log('[ENV-TRACE] ');
console.log('[ENV-TRACE] CLIENT-SAFE VARIABLES:');
console.log('[ENV-TRACE] - VITE_NEON_AUTH_URL:', window.ENV.VITE_NEON_AUTH_URL ? '✅ PRESENT (length: ' + window.ENV.VITE_NEON_AUTH_URL.length + ')' : '❌ MISSING');
console.log('[ENV-TRACE] - VITE_MICROSOFT_CLIENT_ID:', window.ENV.VITE_MICROSOFT_CLIENT_ID ? '✅ PRESENT (length: ' + window.ENV.VITE_MICROSOFT_CLIENT_ID.length + ')' : '❌ MISSING');
console.log('[ENV-TRACE] ');
console.log('[ENV-TRACE] SERVER CAPABILITY FLAGS:');
console.log('[ENV-TRACE] - hasGeminiKey:', window.SERVER_CONFIG.hasGeminiKey ? '✅ TRUE' : '❌ FALSE');
console.log('[ENV-TRACE] - hasGoogleSearch:', window.SERVER_CONFIG.hasGoogleSearch ? '✅ TRUE' : '❌ FALSE');
console.log('[ENV-TRACE] - hasOpenAI:', window.SERVER_CONFIG.hasOpenAI ? '✅ TRUE' : '❌ FALSE');
console.log('[ENV-TRACE] - hasDatabase:', window.SERVER_CONFIG.hasDatabase ? '✅ TRUE' : '❌ FALSE');
console.log('[ENV-TRACE] ========================================');
EOF

echo "[ENV-TRACE] ✅ env-config.js created at: /usr/share/nginx/html/env-config.js"
echo "[ENV-TRACE] "
echo "[ENV-TRACE] === FILE CONTENTS PREVIEW ==="
head -n 20 /usr/share/nginx/html/env-config.js
echo "[ENV-TRACE] === END PREVIEW ==="
echo "[ENV-TRACE] "
echo "[ENV-TRACE] ✅ Secure environment variables injected (API keys protected)"
echo "[ENV-TRACE] 🚀 Starting Nginx..."
echo "[ENV-TRACE] ========================================"

# Start nginx
nginx -g "daemon off;"
