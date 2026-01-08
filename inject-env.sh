#!/bin/sh

# inject-env.sh - Secure runtime environment variable injection for Railway
# SECURITY: Only injects client-safe variables (VITE_* prefixed)
# Server-side API keys remain in process.env and are not exposed to browser

echo "🔧 Injecting client-safe environment variables at runtime..."

# Create JavaScript file with ONLY client-safe environment variables
cat > /usr/share/nginx/html/env-config.js << EOF
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

console.log('🔒 Runtime environment loaded:', {
  authConfigured: !!window.ENV.VITE_NEON_AUTH_URL,
  microsoftConfigured: !!window.ENV.VITE_MICROSOFT_CLIENT_ID,
  serverCapabilities: window.SERVER_CONFIG
});
EOF

echo "✅ Secure environment variables injected (API keys protected)"

# Start nginx
nginx -g "daemon off;"
