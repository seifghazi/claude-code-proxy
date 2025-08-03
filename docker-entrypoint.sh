#!/bin/sh

# Docker entrypoint script for Claude Code Proxy
# Starts both the Go proxy server and Remix frontend

set -e

echo "🚀 Starting Claude Code Proxy services..."
echo "========================================="

# Function to handle graceful shutdown
cleanup() {
    echo ""
    echo "🛑 Shutting down services..."
    pm2 delete all 2>/dev/null || true
    exit 0
}

# Trap signals for graceful shutdown
trap cleanup SIGTERM SIGINT

# Create PM2 ecosystem file
cat > /tmp/ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'proxy-server',
      script: './bin/proxy',
      cwd: '/app',
      env: {
        PORT: '${PORT}',
        READ_TIMEOUT: '${READ_TIMEOUT}s',
        WRITE_TIMEOUT: '${WRITE_TIMEOUT}s', 
        IDLE_TIMEOUT: '${IDLE_TIMEOUT}s',
        ANTHROPIC_FORWARD_URL: '${ANTHROPIC_FORWARD_URL}',
        ANTHROPIC_VERSION: '${ANTHROPIC_VERSION}',
        ANTHROPIC_MAX_RETRIES: '${ANTHROPIC_MAX_RETRIES}',
        DB_PATH: '${DB_PATH}'
      },
      error_file: '/dev/stderr',
      out_file: '/dev/stdout',
      log_file: '/dev/stdout',
      time: true
    },
    {
      name: 'web-server',
      script: 'npm',
      args: 'start',
      cwd: '/app/web',
      env: {
        PORT: '${WEB_PORT}',
        NODE_ENV: 'production'
      },
      error_file: '/dev/stderr',
      out_file: '/dev/stdout', 
      log_file: '/dev/stdout',
      time: true
    }
  ]
};
EOF

echo "📊 Configuration:"
echo "   - Proxy Server: http://localhost:${PORT}"
echo "   - Web Dashboard: http://localhost:${WEB_PORT}"
echo "   - Database: ${DB_PATH}"
echo "   - Anthropic API: ${ANTHROPIC_FORWARD_URL}"
echo "========================================="

# Start services with PM2
echo "🔄 Starting proxy server..."
pm2 start /tmp/ecosystem.config.js --only proxy-server --no-daemon &

# Wait for proxy to be ready
echo "⏳ Waiting for proxy server to start..."
timeout=30
while [ $timeout -gt 0 ]; do
    if wget --quiet --spider "http://localhost:${PORT}/health" 2>/dev/null; then
        echo "✅ Proxy server is ready"
        break
    fi
    sleep 1
    timeout=$((timeout - 1))
done

if [ $timeout -eq 0 ]; then
    echo "❌ Proxy server failed to start within 30 seconds"
    exit 1
fi

echo "🔄 Starting web server..."
pm2 start /tmp/ecosystem.config.js --only web-server --no-daemon &

# Wait for web server to be ready
echo "⏳ Waiting for web server to start..."
timeout=30
while [ $timeout -gt 0 ]; do
    if wget --quiet --spider "http://localhost:${WEB_PORT}" 2>/dev/null; then
        echo "✅ Web server is ready"
        break
    fi
    sleep 1
    timeout=$((timeout - 1))
done

if [ $timeout -eq 0 ]; then
    echo "❌ Web server failed to start within 30 seconds"
    exit 1
fi

echo ""
echo "✨ All services started successfully!"
echo "========================================="
echo "📊 Web Dashboard: http://localhost:${WEB_PORT}"
echo "🔌 API Proxy: http://localhost:${PORT}"
echo "💚 Health Check: http://localhost:${PORT}/health"
echo "========================================="
echo "💡 To use with Claude Code, set: ANTHROPIC_BASE_URL=http://localhost:${PORT}"
echo ""

# Keep container running and show logs
pm2 logs --raw