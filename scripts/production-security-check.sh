#!/bin/sh

# production-security-check.sh - Pre-deployment security validation
echo "🔒 Running production security checks..."

# Check 1: Verify no API keys in client bundle
echo "Checking for exposed API keys in build..."
if find dist/ -name "*.js" -exec grep -l "AIza\|sk-" {} \; | grep -q .; then
    echo "❌ ERROR: API keys found in client bundle!"
    exit 1
fi

# Check 2: Verify environment variables are set
echo "Checking required environment variables..."
REQUIRED_VARS="GEMINI_API_KEY DATABASE_URL VITE_NEON_AUTH_URL"
for var in $REQUIRED_VARS; do
    if [ -z "$(eval echo \$$var)" ]; then
        echo "❌ ERROR: Required environment variable $var is not set"
        exit 1
    fi
done

# Check 3: Verify CSP policy includes auth domains
echo "Checking CSP policy includes auth domains..."
if ! grep -q "login.microsoftonline.com" nginx.conf; then
    echo "❌ ERROR: Microsoft auth domain missing from CSP"
    exit 1
fi

# Check 4: Verify security headers are present
echo "Checking security headers..."
REQUIRED_HEADERS="Strict-Transport-Security X-Content-Type-Options X-Frame-Options"
for header in $REQUIRED_HEADERS; do
    if ! grep -q "$header" nginx.conf; then
        echo "❌ ERROR: Security header $header missing"
        exit 1
    fi
done

# Check 5: Verify no debug logging in production
echo "Checking for debug console.log statements..."
if find dist/ -name "*.js" -exec grep -l "console\.log.*\[.*\]" {} \; | grep -q .; then
    echo "⚠️ WARNING: Debug logging found in production build"
fi

echo "✅ Production security checks completed"
echo "🚀 Application ready for secure deployment"
