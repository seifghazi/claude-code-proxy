.PHONY: all build run clean install dev test test-proxy test-coverage

# Default target
all: install build

# Install dependencies
install:
	@echo "📦 Installing Go dependencies..."
	cd proxy && go mod download
	@echo "📦 Installing Node dependencies..."
	cd web && npm install

# Build both services
build: build-proxy build-web

build-proxy:
	@echo "🔨 Building proxy server..."
	cd proxy && go build -o ../bin/proxy cmd/proxy/main.go

build-web:
	@echo "🔨 Building web interface..."
	cd web && npm run build

# Run in development mode
dev:
	@echo "🚀 Starting development servers..."
	./run.sh

# Run proxy only
run-proxy:
	cd proxy && go run cmd/proxy/main.go

# Run web only
run-web:
	cd web && npm run dev

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf bin/
	rm -rf web/build/
	rm -rf web/.cache/
	rm -f requests.db
	rm -rf requests/

# Testing
test: test-proxy

test-proxy:
	@echo "🧪 Running proxy tests..."
	cd proxy && go test -v ./...

test-coverage:
	@echo "📊 Running tests with coverage..."
	cd proxy && go test -v -coverprofile=coverage.out ./...
	cd proxy && go tool cover -html=coverage.out -o coverage.html
	@echo "📊 Coverage report generated: proxy/coverage.html"

# Database operations
db-reset:
	@echo "🗑️  Resetting database..."
	rm -f requests.db
	rm -rf requests/

# Help
help:
	@echo "Claude Code Monitor - Available targets:"
	@echo "  make install    - Install all dependencies"
	@echo "  make build      - Build both services"
	@echo "  make dev        - Run in development mode"
	@echo "  make run-proxy  - Run proxy server only"
	@echo "  make run-web    - Run web interface only"
	@echo "  make clean      - Clean build artifacts"
	@echo "  make db-reset   - Reset database"
	@echo "  make help       - Show this help message"