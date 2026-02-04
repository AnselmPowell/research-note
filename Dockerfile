# Research Note - Railway Deployment Dockerfile
# Multi-stage build for optimal production image size

# Stage 1: Build the application
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --silent

# Copy source code
COPY . .

# Build without environment variables (they'll be injected at runtime)
RUN echo "[ENV-TRACE] ========================================" && \
    echo "[ENV-TRACE] DOCKER BUILD STAGE - CHECKING ENV VARS" && \
    echo "[ENV-TRACE] ========================================" && \
    echo "[ENV-TRACE] NODE_ENV: production" && \
    echo "[ENV-TRACE] Checking Railway variables in build stage:" && \
    echo "[ENV-TRACE] GEMINI_API_KEY present: $(if [ -n "$GEMINI_API_KEY" ]; then echo 'YES (length: '${#GEMINI_API_KEY}')'; else echo 'NO'; fi)" && \
    echo "[ENV-TRACE] GOOGLE_SEARCH_KEY present: $(if [ -n "$GOOGLE_SEARCH_KEY" ]; then echo 'YES (length: '${#GOOGLE_SEARCH_KEY}')'; else echo 'NO'; fi)" && \
    echo "[ENV-TRACE] VITE_NEON_AUTH_URL present: $(if [ -n "$VITE_NEON_AUTH_URL" ]; then echo 'YES (length: '${#VITE_NEON_AUTH_URL}')'; else echo 'NO'; fi)" && \
    echo "[ENV-TRACE] DATABASE_URL present: $(if [ -n "$DATABASE_URL" ]; then echo 'YES (length: '${#DATABASE_URL}')'; else echo 'NO'; fi)" && \
    echo "[ENV-TRACE] ⚠️  WARNING: If any variables show 'YES' here, they are being baked into the build!" && \
    echo "[ENV-TRACE] ✅ EXPECTED: All should show 'NO' for runtime injection" && \
    echo "[ENV-TRACE] ========================================"

# Build the application with empty environment variables
ENV NODE_ENV=production
RUN npm run build

# Verify build output
RUN ls -la dist/ && echo "✅ Build artifacts created"

# Stage 2: Production server with Nginx
FROM nginx:alpine AS production

# Copy built application from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy environment injection script
COPY inject-env.sh /inject-env.sh
RUN chmod +x /inject-env.sh

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

# Start with environment injection
CMD ["/inject-env.sh"]
