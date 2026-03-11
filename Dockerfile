# Multi-stage Dockerfile for Claude Code Proxy
# Builds a single Go binary with embedded frontend assets

# Stage 1: Build Node.js Frontend
FROM node:20-alpine AS node-builder

WORKDIR /app/web

COPY web/package*.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

# Stage 2: Build Go Binary with embedded frontend
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

# Copy built frontend assets into embed directory
COPY --from=node-builder /app/web/build/client ./frontend/dist

# Build with CGO enabled for SQLite support
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o /app/bin/proxy cmd/proxy/main.go

# Stage 3: Production Runtime
FROM alpine:3.19

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache sqlite wget

# Create app user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Copy built Go binary (includes embedded frontend)
COPY --from=go-builder /app/bin/proxy ./bin/proxy
RUN chmod +x ./bin/proxy

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown -R appuser:appgroup /app

# Environment variables with defaults
ENV PORT=3001
ENV READ_TIMEOUT=600
ENV WRITE_TIMEOUT=600
ENV IDLE_TIMEOUT=600
ENV ANTHROPIC_FORWARD_URL=https://api.anthropic.com
ENV ANTHROPIC_VERSION=2023-06-01
ENV ANTHROPIC_MAX_RETRIES=3
ENV DB_PATH=/app/data/requests.db

# Expose single port
EXPOSE 3001

# Switch to app user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:3001/health > /dev/null || exit 1

# Start single binary
CMD ["./bin/proxy"]
