#!/bin/sh

# inject-env.sh - Runtime environment variable injection for Railway
# This replaces build-time environment variable injection

echo "🔧 Injecting environment variables at runtime..."

# Create JavaScript file with environment variables
cat > /usr/share/nginx/html/env-config.js << EOF
window.ENV = {
  GEMINI_API_KEY: "${GEMINI_API_KEY}",
  GOOGLE_SEARCH_KEY: "${GOOGLE_SEARCH_KEY}",
  GOOGLE_SEARCH_CX: "${GOOGLE_SEARCH_CX}",
  OPENAI_API_KEY: "${OPENAI_API_KEY}",
  DATABASE_URL: "${DATABASE_URL}",
  VITE_NEON_AUTH_URL: "${VITE_NEON_AUTH_URL}",
  VITE_MICROSOFT_CLIENT_ID: "${VITE_MICROSOFT_CLIENT_ID}",
  VITE_MICROSOFT_TENANT_ID: "${VITE_MICROSOFT_TENANT_ID}",
  NODE_ENV: "production"
};
EOF

echo "✅ Environment variables injected"

# Start nginx
nginx -g "daemon off;"
