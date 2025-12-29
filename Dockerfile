# Research Note - Railway Deployment Dockerfile
# Multi-stage build for optimal production image size

# Stage 1: Build the application
FROM node:20-alpine AS builder

# Accept build arguments from Railway
ARG GEMINI_API_KEY
ARG GOOGLE_SEARCH_KEY
ARG GOOGLE_SEARCH_CX
ARG OPENAI_API_KEY
ARG DATABASE_URL
ARG NODE_ENV=production

# Set environment variables for the build process
ENV GEMINI_API_KEY=$GEMINI_API_KEY
ENV GOOGLE_SEARCH_KEY=$GOOGLE_SEARCH_KEY
ENV GOOGLE_SEARCH_CX=$GOOGLE_SEARCH_CX
ENV OPENAI_API_KEY=$OPENAI_API_KEY
ENV DATABASE_URL=$DATABASE_URL
ENV NODE_ENV=$NODE_ENV

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --silent

# Copy source code
COPY . .

# Debug: Show what we're building with
RUN echo "🔧 Building Research Note..." && \
    echo "NODE_ENV: $NODE_ENV" && \
    echo "Has GEMINI_API_KEY: $([ -n "$GEMINI_API_KEY" ] && echo "YES" || echo "NO")" && \
    echo "Has GOOGLE_SEARCH: $([ -n "$GOOGLE_SEARCH_KEY" ] && echo "YES" || echo "NO")"

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
