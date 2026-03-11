.PHONY: all build run clean install dev

# Default target
all: install build

# Install dependencies
install:
	@echo "📦 Installing Go dependencies..."
	cd proxy && go mod download
	@echo "📦 Installing Node dependencies..."
	cd web && npm install

# Build single binary (frontend → copy → Go)
build: build-web copy-frontend build-proxy

build-proxy:
	@echo "🔨 Building proxy server..."
	cd proxy && CGO_ENABLED=1 go build -o ../bin/proxy cmd/proxy/main.go

build-web:
	@echo "🔨 Building web interface..."
	cd web && npm run build

copy-frontend:
	@echo "📋 Copying frontend assets into Go embed directory..."
	rm -rf proxy/frontend/dist
	cp -r web/build/client proxy/frontend/dist

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
	rm -rf proxy/frontend/dist
	mkdir -p proxy/frontend/dist
	touch proxy/frontend/dist/.gitkeep
	rm -f requests.db
	rm -rf requests/

# Database operations
db-reset:
	@echo "🗑️  Resetting database..."
	rm -f requests.db
	rm -rf requests/

# Help
help:
	@echo "Claude Code Monitor - Available targets:"
	@echo "  make install    - Install all dependencies"
	@echo "  make build      - Build single binary (frontend + Go)"
	@echo "  make dev        - Run in development mode"
	@echo "  make run-proxy  - Run proxy server only"
	@echo "  make run-web    - Run web interface only"
	@echo "  make clean      - Clean build artifacts"
	@echo "  make db-reset   - Reset database"
	@echo "  make help       - Show this help message"
