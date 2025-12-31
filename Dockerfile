# Research Note - Railway Deployment Dockerfile
# Multi-stage build for optimal production image size

# Stage 1: Build the application
FROM node:20-alpine AS builder

# Accept non-sensitive build arguments from Railway
ARG NODE_ENV=production
ARG VITE_NEON_AUTH_URL
ARG VITE_MICROSOFT_CLIENT_ID
ARG VITE_MICROSOFT_TENANT_ID

# Set environment variables for the build process (non-sensitive only)
ENV NODE_ENV=$NODE_ENV
ENV VITE_NEON_AUTH_URL=$VITE_NEON_AUTH_URL
ENV VITE_MICROSOFT_CLIENT_ID=$VITE_MICROSOFT_CLIENT_ID
ENV VITE_MICROSOFT_TENANT_ID=$VITE_MICROSOFT_TENANT_ID

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --silent

# Copy source code
COPY . .

# Debug: Show what we're building with (non-sensitive info only)
RUN echo "🔧 Building Research Note..." && \
    echo "NODE_ENV: $NODE_ENV" && \
    echo "Has NEON_AUTH_URL: $([ -n "$VITE_NEON_AUTH_URL" ] && echo "YES" || echo "NO")" && \
    echo "Has MICROSOFT_CLIENT_ID: $([ -n "$VITE_MICROSOFT_CLIENT_ID" ] && echo "YES" || echo "NO")"

# Build the application
RUN npm run build

# Verify build output
RUN ls -la dist/ && echo "✅ Build artifacts created"

# Stage 2: Production server with Nginx
FROM nginx:alpine AS production

# Copy built application from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
