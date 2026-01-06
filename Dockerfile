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
RUN echo "🔧 Building Research Note for runtime environment injection..." && \
    echo "NODE_ENV: production"

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
