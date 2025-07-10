# Claude Code Proxy

![Claude Code Proxy Demo](demo.gif)

A dual-purpose monitoring solution that serves as both a proxy for Claude Code requests and a visualization dashboard for your Claude API conversations.

## What It Does

Claude Code Proxy serves two main purposes:

1. **Claude Code Proxy**: Intercepts and monitors requests from Claude Code (claude.ai/code) to the Anthropic API, allowing you to see what Claude Code is doing in real-time
2. **Conversation Viewer**: Displays and analyzes your Claude API conversations with a beautiful web interface

## Features

- **Transparent Proxy**: Routes Claude Code requests through the monitor without disruption
- **Request Monitoring**: SQLite-based logging of all API interactions
- **Live Dashboard**: Real-time visualization of requests and responses
- **Conversation Analysis**: View full conversation threads with tool usage
- **Easy Setup**: One-command startup for both services

## Quick Start

### Prerequisites
- Go 1.20+
- Node.js 18+
- Claude Code

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/claude-code-monitor.git
   cd claude-code-monitor
   ```

2. **Set up your environment variables**
   ```bash
   cp .env.example .env
   ```

3. **Install and run** (first time)
   ```bash
   make install  # Install all dependencies
   make dev      # Start both services
   ```
   
   Or use the script that does both:
   ```bash
   ./run.sh
   ```

4. **Subsequent runs** (after initial setup)
   ```bash
   make dev
   # or
   ./run.sh
   ```

5. **Using with Claude Code**

To use this proxy with Claude Code, set:
```bash
export ANTHROPIC_BASE_URL=http://localhost:3001
```

Then launch Claude Code using the `claude` command.

This will route Claude Code's requests through the proxy for monitoring.

### Access Points
- **Web Dashboard**: http://localhost:5173
- **API Proxy**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

## Advanced Usage

### Running Services Separately

If you need to run services independently:

```bash
# Run proxy only
make run-proxy

# Run web interface only (in another terminal)
make run-web
```

### Available Make Commands

```bash
make install    # Install all dependencies
make build      # Build both services
make dev        # Run in development mode
make clean      # Clean build artifacts
make db-reset   # Reset database
make help       # Show all commands
```

## Configuration

Create a `.env` file with:
```
PORT=3001
DB_PATH=requests.db
ANTHROPIC_FORWARD_URL=https://api.anthropic.com
```

See `.env.example` for all available options.


## Project Structure

```
claude-code-monitor/
├── proxy/                  # Go proxy server
│   ├── cmd/               # Application entry points
│   ├── internal/          # Internal packages
│   └── go.mod            # Go dependencies
├── web/                   # React Remix frontend
│   ├── app/              # Remix application
│   └── package.json      # Node dependencies
├── run.sh                # Start script
├── .env.example          # Environment template
└── README.md            # This file
```

## Features in Detail

### Request Monitoring
- All API requests logged to SQLite database
- Searchable request history
- Request/response body inspection
- Conversation threading

### Prompt Analysis
- Automatic prompt grading
- Best practices evaluation
- Complexity assessment
- Response quality metrics

### Web Dashboard
- Real-time request streaming
- Interactive request explorer
- Conversation visualization
- Performance metrics

## License

MIT License - see [LICENSE](LICENSE) for details.