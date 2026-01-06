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

# Debug: Show build environment (Railway variables will be available during build)
RUN echo "🔧 Building Research Note..." && \
    echo "NODE_ENV: production" && \
    echo "Railway build environment ready"

# Build the application - Railway environment variables automatically available
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
