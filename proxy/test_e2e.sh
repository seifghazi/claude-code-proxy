#!/bin/bash

# End-to-End test script for LLM Proxy
# This script starts the server, runs basic tests, and cleans up

set -e

echo "🧪 Starting End-to-End Tests for LLM Proxy"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
TEST_PORT=3002
TEST_DB="test_requests.db"
TEST_CONFIG="test_config.yaml"

# Cleanup function
cleanup() {
    echo "🧹 Cleaning up..."
    if [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null || true
    fi
    rm -f $TEST_DB $TEST_CONFIG
}

# Set trap to cleanup on exit
trap cleanup EXIT

# Create test configuration
echo "📝 Creating test configuration..."
cat > $TEST_CONFIG << EOF
server:
  port: $TEST_PORT
  timeouts:
    read: 1m
    write: 1m
    idle: 1m

providers:
  anthropic:
    base_url: "https://api.anthropic.com"
    version: "2023-06-01"
    max_retries: 1

storage:
  db_path: "$TEST_DB"
EOF

# Build the proxy
echo "🔨 Building proxy..."
cd proxy && go build -o ../bin/test-proxy cmd/proxy/main.go && cd ..

# Start the server
echo "🚀 Starting test server on port $TEST_PORT..."
CONFIG_PATH=$TEST_CONFIG PORT=$TEST_PORT ./bin/test-proxy &
SERVER_PID=$!

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 3

# Function to check response
check_response() {
    local endpoint=$1
    local expected_status=$2
    local test_name=$3
    
    response=$(curl -s -w "\n%{http_code}" http://localhost:$TEST_PORT$endpoint)
    status_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓${NC} $test_name: Status $status_code"
        return 0
    else
        echo -e "${RED}✗${NC} $test_name: Expected $expected_status, got $status_code"
        echo "Response body: $body"
        return 1
    fi
}

# Run tests
echo ""
echo "🧪 Running tests..."
echo ""

# Test 1: Health check
check_response "/health" "200" "Health check"

# Test 2: Get requests (should be empty initially)
response=$(curl -s http://localhost:$TEST_PORT/api/requests)
if echo "$response" | grep -q '"requests":\[\]'; then
    echo -e "${GREEN}✓${NC} Get requests: Returns empty array initially"
else
    echo -e "${RED}✗${NC} Get requests: Expected empty array"
    echo "Response: $response"
fi

# Test 3: Models endpoint
check_response "/v1/models" "200" "Models endpoint"

# Test 4: Invalid endpoint
check_response "/invalid" "404" "404 for invalid endpoint"

# Test 5: Chat completions endpoint (should return helpful error)
response=$(curl -s -X POST -H "Content-Type: application/json" \
    -d '{"model":"gpt-4","messages":[]}' \
    http://localhost:$TEST_PORT/v1/chat/completions)
if echo "$response" | grep -q "This is an Anthropic proxy"; then
    echo -e "${GREEN}✓${NC} Chat completions: Returns helpful error message"
else
    echo -e "${RED}✗${NC} Chat completions: Expected Anthropic proxy error"
    echo "Response: $response"
fi

# Test 6: Delete requests
response=$(curl -s -X DELETE http://localhost:$TEST_PORT/api/requests)
if echo "$response" | grep -q '"deleted":0'; then
    echo -e "${GREEN}✓${NC} Delete requests: Works with empty database"
else
    echo -e "${RED}✗${NC} Delete requests: Expected deletion count"
    echo "Response: $response"
fi

# Test 7: Conversations endpoint
check_response "/api/conversations" "200" "Conversations endpoint"

echo ""
echo "🎉 End-to-End tests completed!"
echo ""

# Cleanup is handled by trap