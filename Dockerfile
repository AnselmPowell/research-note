# Research Note - Backend + Frontend Deployment

# ============================================
# Stage 1: Build Frontend
# ============================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY package*.json ./
RUN npm ci --silent

COPY . .
ENV NODE_ENV=production

RUN echo "[ENV-TRACE] ========================================" && \
    echo "[ENV-TRACE] DOCKER BUILD STAGE - CHECKING ENV VARS" && \
    echo "[ENV-TRACE] ========================================" && \
    echo "[ENV-TRACE] NODE_ENV: production" && \
    echo "[ENV-TRACE] GEMINI_API_KEY present: $(if [ -n "$GEMINI_API_KEY" ]; then echo 'YES'; else echo 'NO'; fi)" && \
    echo "[ENV-TRACE] DATABASE_URL present: $(if [ -n "$DATABASE_URL" ]; then echo 'YES'; else echo 'NO'; fi)" && \
    echo "[ENV-TRACE] ✅ EXPECTED: All should show 'NO' for runtime injection" && \
    echo "[ENV-TRACE] ========================================"

RUN npm run build
RUN ls -la dist/ && echo "✅ Frontend build artifacts created"

# ============================================
# Stage 2: Prepare Backend
# ============================================
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci --production --silent

COPY backend/ .
RUN echo "✅ Backend dependencies installed"

# ============================================
# Stage 3: Production Runtime (Node + Nginx)
# ============================================
FROM node:20-alpine AS production

RUN apk add --no-cache nginx

RUN mkdir -p /run/nginx /var/log/nginx

COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

COPY --from=backend-builder /app/backend /app/backend

COPY nginx.conf /etc/nginx/nginx.conf
COPY inject-env.sh /inject-env.sh
COPY docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /inject-env.sh /docker-entrypoint.sh

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["/docker-entrypoint.sh"]
