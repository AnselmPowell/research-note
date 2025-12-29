#!/bin/sh

# Docker entrypoint script for Research Note
# Handles environment variable injection at runtime for Railway deployment

set -e

echo "🚀 Starting Research Note deployment..."
echo "📍 Environment: ${NODE_ENV:-production}"

# Function to inject environment variables into built JS files
inject_env_vars() {
    echo "🔧 Injecting environment variables into built application..."
    
    # Find the main JS bundle (Vite creates hashed filenames)
    MAIN_JS=$(find /usr/share/nginx/html/assets -name "index-*.js" | head -1)
    
    if [ -n "$MAIN_JS" ] && [ -f "$MAIN_JS" ]; then
        echo "📦 Found main bundle: $(basename "$MAIN_JS")"
        
        # Create temporary file with environment variables injected
        # Replace placeholder values with actual environment variables
        sed -i "s|PLACEHOLDER_GEMINI_API_KEY|${GEMINI_API_KEY}|g" "$MAIN_JS" 2>/dev/null || true
        sed -i "s|PLACEHOLDER_GOOGLE_SEARCH_KEY|${GOOGLE_SEARCH_KEY}|g" "$MAIN_JS" 2>/dev/null || true
        sed -i "s|PLACEHOLDER_GOOGLE_SEARCH_CX|${GOOGLE_SEARCH_CX}|g" "$MAIN_JS" 2>/dev/null || true
        sed -i "s|PLACEHOLDER_OPENAI_API_KEY|${OPENAI_API_KEY}|g" "$MAIN_JS" 2>/dev/null || true
        sed -i "s|PLACEHOLDER_DATABASE_URL|${DATABASE_URL}|g" "$MAIN_JS" 2>/dev/null || true
        
        echo "✅ Environment variables injected successfully"
    else
        echo "⚠️  Warning: Main JS bundle not found, using build-time environment variables"
    fi
}

# Function to validate critical environment variables
validate_env() {
    echo "🔍 Validating environment configuration..."
    
    if [ -z "$GEMINI_API_KEY" ]; then
        echo "❌ ERROR: GEMINI_API_KEY is required but not set"
        echo "💡 Please set the GEMINI_API_KEY environment variable in Railway"
        exit 1
    fi
    
    echo "✅ Required environment variables are present"
    
    # Log optional configuration status (without exposing values)
    [ -n "$GOOGLE_SEARCH_KEY" ] && echo "✅ Google Search API configured" || echo "⚠️  Google Search API not configured (Web Search disabled)"
    [ -n "$OPENAI_API_KEY" ] && echo "✅ OpenAI API configured" || echo "⚠️  OpenAI API not configured (No fallback available)"
    [ -n "$DATABASE_URL" ] && echo "✅ Database configured" || echo "⚠️  Database not configured (Using fallback)"
}

# Function to prepare the application
prepare_app() {
    echo "📝 Preparing application files..."
    
    # Ensure proper permissions
    chown -R nginx:nginx /usr/share/nginx/html
    chmod -R 755 /usr/share/nginx/html
    
    # Create nginx cache directory
    mkdir -p /var/cache/nginx
    chown -R nginx:nginx /var/cache/nginx
    
    echo "✅ Application prepared successfully"
}

# Main deployment process
main() {
    echo "=" "=" "=" "=" "=" "=" "=" "=" "=" "="
    echo "🏗️  Research Note - Railway Deployment"
    echo "=" "=" "=" "=" "=" "=" "=" "=" "=" "="
    
    validate_env
    prepare_app
    inject_env_vars
    
    echo ""
    echo "🎉 Research Note is ready!"
    echo "🌐 Application will be available on Railway's provided URL"
    echo "📊 Health check: /health"
    echo ""
    echo "Starting nginx..."
}

# Run main function
main

# Execute the original command (nginx)
exec "$@"
