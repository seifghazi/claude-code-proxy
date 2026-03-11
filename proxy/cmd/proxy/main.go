package main

import (
	"context"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"

	"github.com/seifghazi/claude-code-monitor/frontend"
	"github.com/seifghazi/claude-code-monitor/internal/config"
	"github.com/seifghazi/claude-code-monitor/internal/handler"
	"github.com/seifghazi/claude-code-monitor/internal/middleware"
	"github.com/seifghazi/claude-code-monitor/internal/provider"
	"github.com/seifghazi/claude-code-monitor/internal/service"
)

func main() {
	logger := log.New(os.Stdout, "proxy: ", log.LstdFlags|log.Lshortfile)

	cfg, err := config.Load()
	if err != nil {
		logger.Fatalf("❌ Failed to load configuration: %v", err)
	}

	// Initialize providers
	providers := make(map[string]provider.Provider)
	providers["anthropic"] = provider.NewAnthropicProvider(&cfg.Providers.Anthropic)
	providers["openai"] = provider.NewOpenAIProvider(&cfg.Providers.OpenAI)

	// Initialize model router
	modelRouter := service.NewModelRouter(cfg, providers, logger)

	// Use legacy anthropic service for backward compatibility
	anthropicService := service.NewAnthropicService(&cfg.Anthropic)

	// Use SQLite storage
	storageService, err := service.NewSQLiteStorageService(&cfg.Storage)
	if err != nil {
		logger.Fatalf("❌ Failed to initialize SQLite storage: %v", err)
	}
	logger.Println("🗿 SQLite database ready")

	h := handler.New(anthropicService, storageService, logger, modelRouter)

	r := mux.NewRouter()

	corsHandler := handlers.CORS(
		handlers.AllowedOrigins([]string{"*"}),
		handlers.AllowedMethods([]string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}),
		handlers.AllowedHeaders([]string{"*"}),
	)

	r.Use(middleware.Logging)

	r.HandleFunc("/v1/chat/completions", h.ChatCompletions).Methods("POST")
	r.HandleFunc("/v1/messages", h.Messages).Methods("POST")
	r.HandleFunc("/v1/models", h.Models).Methods("GET")
	r.HandleFunc("/health", h.Health).Methods("GET")

	r.HandleFunc("/api/requests", h.GetRequests).Methods("GET")
	r.HandleFunc("/api/requests", h.DeleteRequests).Methods("DELETE")
	r.HandleFunc("/api/conversations", h.GetConversations).Methods("GET")
	r.HandleFunc("/api/conversations/{id}", h.GetConversationByID).Methods("GET")
	r.HandleFunc("/api/conversations/project", h.GetConversationsByProject).Methods("GET")

	// Serve embedded frontend assets
	distFS, err := fs.Sub(frontend.Assets, "dist")
	if err != nil {
		logger.Fatalf("❌ Failed to create sub filesystem: %v", err)
	}
	fileServer := http.FileServer(http.FS(distFS))

	// Serve static assets (JS, CSS, fonts, etc.)
	r.PathPrefix("/assets/").Handler(fileServer)

	// SPA fallback: serve index.html for all non-API, non-asset paths
	r.NotFoundHandler = http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		// Let API routes return 404 normally
		if strings.HasPrefix(req.URL.Path, "/api/") || strings.HasPrefix(req.URL.Path, "/v1/") {
			h.NotFound(w, req)
			return
		}
		// Try to serve the file directly first (e.g. favicon.ico)
		f, err := distFS.Open(strings.TrimPrefix(req.URL.Path, "/"))
		if err == nil {
			f.Close()
			fileServer.ServeHTTP(w, req)
			return
		}
		// Fall back to index.html for SPA routing
		indexHTML, err := fs.ReadFile(distFS, "index.html")
		if err != nil {
			h.NotFound(w, req)
			return
		}
		w.Header().Set("Content-Type", "text/html")
		w.Write(indexHTML)
	})

	srv := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      corsHandler(r),
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
		IdleTimeout:  cfg.Server.IdleTimeout,
	}

	// Detect HTTP/HTTPS proxy from environment
	proxyEnvVars := []string{"HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "NO_PROXY", "no_proxy"}
	var detectedProxy bool
	for _, env := range proxyEnvVars {
		if val := os.Getenv(env); val != "" {
			if !detectedProxy {
				logger.Println("⚠️  HTTP/HTTPS proxy detected! All outbound API requests will be routed through:")
				detectedProxy = true
			}
			logger.Printf("   %s=%s", env, val)
		}
	}
	if !detectedProxy {
		logger.Println("⚠️  No HTTP/HTTPS proxy detected. If you are behind a firewall, API calls may fail!")
		logger.Println("   Set proxy environment variables before starting:")
		logger.Printf("     export HTTP_PROXY=http://your-proxy:port")
		logger.Printf("     export HTTPS_PROXY=http://your-proxy:port")
		logger.Printf("     export NO_PROXY=localhost,127.0.0.1")
	}

	go func() {
		logger.Printf("🚀 Claude Code Monitor Server running on http://localhost:%s", cfg.Server.Port)
		logger.Printf("📡 API endpoints available at:")
		logger.Printf("   - POST http://localhost:%s/v1/messages (Anthropic format)", cfg.Server.Port)
		logger.Printf("   - GET  http://localhost:%s/v1/models", cfg.Server.Port)
		logger.Printf("   - GET  http://localhost:%s/health", cfg.Server.Port)
		logger.Printf("🎨 Web UI available at:")
		logger.Printf("   - GET  http://localhost:%s/ (Request Visualizer)", cfg.Server.Port)
		logger.Printf("   - GET  http://localhost:%s/api/requests (Request API)", cfg.Server.Port)
		logger.Println("")
		logger.Println("👉 To use with Claude Code, run:")
		logger.Printf("   export ANTHROPIC_BASE_URL=http://localhost:%s", cfg.Server.Port)
		logger.Println("   claude")
		logger.Println("")

		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatalf("❌ Server failed to start: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Println("🛑 Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatalf("❌ Server forced to shutdown: %v", err)
	}

	logger.Println("✅ Server exited")
}
