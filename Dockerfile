# Multi-stage Dockerfile for Claude Code Proxy
# Builds both Go proxy server and Remix frontend in a single container

# Stage 1: Build Go Backend
FROM golang:1.21-alpine AS go-builder

WORKDIR /app

# Install build dependencies including gcc for CGO
RUN apk add --no-cache git gcc musl-dev sqlite-dev

# Copy Go modules
COPY proxy/go.mod proxy/go.sum ./proxy/
WORKDIR /app/proxy
RUN go mod download

# Copy Go source code
COPY proxy/ ./
# Build with CGO enabled for SQLite support
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o /app/bin/proxy cmd/proxy/main.go

# Stage 2: Build Node.js Frontend
FROM node:20-alpine AS node-builder

WORKDIR /app

# Copy package files
COPY web/package*.json ./web/
WORKDIR /app/web
RUN npm ci

# Copy web source code and build
COPY web/ ./
RUN npm run build

# Clean up dev dependencies after build
RUN npm ci --only=production && npm cache clean --force

# Stage 3: Production Runtime
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache sqlite wget

# Create app user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Copy built Go binary
COPY --from=go-builder /app/bin/proxy ./bin/proxy
RUN chmod +x ./bin/proxy

# Copy built Remix application
COPY --from=node-builder /app/web/build ./web/build
COPY --from=node-builder /app/web/package*.json ./web/
COPY --from=node-builder /app/web/node_modules ./web/node_modules

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown -R appuser:appgroup /app

# Copy startup script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Environment variables with defaults
ENV PORT=3001
ENV WEB_PORT=5173
ENV READ_TIMEOUT=600
ENV WRITE_TIMEOUT=600
ENV IDLE_TIMEOUT=600
ENV ANTHROPIC_FORWARD_URL=https://api.anthropic.com
ENV ANTHROPIC_VERSION=2023-06-01
ENV ANTHROPIC_MAX_RETRIES=3
ENV DB_PATH=/app/data/requests.db

# Expose ports
EXPOSE 3001 5173

# Switch to app user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:3001/health > /dev/null || exit 1

# Start both services
CMD ["./docker-entrypoint.sh"]