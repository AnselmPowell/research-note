#!/bin/bash

# Railway Build Script for Research Note
# This script ensures environment variables are available during build

echo "🚀 Railway Build Script Starting..."

# Show environment variables status (without exposing values)
echo "📋 Environment Variables Status:"
echo "NODE_ENV: ${NODE_ENV:-'not set'}"
echo "GEMINI_API_KEY: $([ -n "$GEMINI_API_KEY" ] && echo "SET (${#GEMINI_API_KEY} chars)" || echo "MISSING")"
echo "GOOGLE_SEARCH_KEY: $([ -n "$GOOGLE_SEARCH_KEY" ] && echo "SET" || echo "MISSING")"
echo "GOOGLE_SEARCH_CX: $([ -n "$GOOGLE_SEARCH_CX" ] && echo "SET" || echo "MISSING")"
echo "OPENAI_API_KEY: $([ -n "$OPENAI_API_KEY" ] && echo "SET" || echo "MISSING")"
echo "DATABASE_URL: $([ -n "$DATABASE_URL" ] && echo "SET" || echo "MISSING")"
echo "VITE_NEON_AUTH_URL: $([ -n "$VITE_NEON_AUTH_URL" ] && echo "SET" || echo "MISSING")"
echo "VITE_MICROSOFT_CLIENT_ID: $([ -n "$VITE_MICROSOFT_CLIENT_ID" ] && echo "SET" || echo "MISSING")"

# Validate required environment variables
if [ -z "$GEMINI_API_KEY" ]; then
    echo "❌ ERROR: GEMINI_API_KEY is required but not set"
    echo "💡 Please check your Railway environment variables"
    exit 1
fi

echo "✅ Environment validation passed"

# Set production environment
export NODE_ENV=production

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --silent

# Build the application
echo "🏗️ Building application..."
npm run build

echo "✅ Build completed successfully!"
