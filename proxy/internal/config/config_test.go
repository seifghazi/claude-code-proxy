package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLoad(t *testing.T) {
	// Save original environment variables
	originalConfigPath := os.Getenv("CONFIG_PATH")
	originalPort := os.Getenv("PORT")
	originalAnthropicURL := os.Getenv("ANTHROPIC_FORWARD_URL")
	originalOpenAIKey := os.Getenv("OPENAI_API_KEY")

	// Restore after test
	defer func() {
		os.Setenv("CONFIG_PATH", originalConfigPath)
		os.Setenv("PORT", originalPort)
		os.Setenv("ANTHROPIC_FORWARD_URL", originalAnthropicURL)
		os.Setenv("OPENAI_API_KEY", originalOpenAIKey)
	}()

	t.Run("LoadWithValidConfigFile", func(t *testing.T) {
		// Create a temporary config file
		tempDir := t.TempDir()
		configPath := filepath.Join(tempDir, "config.yaml")
		configContent := `
server:
  port: 8080
  timeouts:
    read: 5m
    write: 5m
    idle: 5m

providers:
  anthropic:
    base_url: "https://api.anthropic.com"
    version: "2023-06-01"
    max_retries: 3
  openai:
    base_url: "https://api.openai.com"

storage:
  db_path: "test.db"

subagents:
  mappings:
    test-agent: "gpt-4"
`
		err := os.WriteFile(configPath, []byte(configContent), 0644)
		if err != nil {
			t.Fatalf("Failed to write config file: %v", err)
		}

		// Set config path
		os.Setenv("CONFIG_PATH", configPath)

		// Load config
		cfg, err := Load()
		if err != nil {
			t.Fatalf("Failed to load config: %v", err)
		}

		// Verify values
		if cfg.Server.Port != "8080" {
			t.Errorf("Expected port 8080, got %s", cfg.Server.Port)
		}
		if cfg.Anthropic.BaseURL != "https://api.anthropic.com" {
			t.Errorf("Expected Anthropic URL https://api.anthropic.com, got %s", cfg.Anthropic.BaseURL)
		}
		if cfg.Storage.DBPath != "test.db" {
			t.Errorf("Expected DB path test.db, got %s", cfg.Storage.DBPath)
		}
		if cfg.Subagents.Mappings["test-agent"] != "gpt-4" {
			t.Errorf("Expected subagent mapping test-agent: gpt-4, got %s", cfg.Subagents.Mappings["test-agent"])
		}
	})

	t.Run("LoadWithDefaults", func(t *testing.T) {
		// Clear environment variables
		os.Unsetenv("CONFIG_PATH")
		os.Unsetenv("PORT")

		// Create empty config directory
		tempDir := t.TempDir()
		os.Setenv("CONFIG_PATH", filepath.Join(tempDir, "nonexistent.yaml"))

		// Load config (should use defaults)
		cfg, err := Load()
		if err != nil {
			t.Fatalf("Failed to load config with defaults: %v", err)
		}

		// Verify default values
		if cfg.Server.Port != "3001" {
			t.Errorf("Expected default port 3001, got %s", cfg.Server.Port)
		}
		if cfg.Server.ReadTimeout != 10*time.Minute {
			t.Errorf("Expected default read timeout 10m, got %v", cfg.Server.ReadTimeout)
		}
		if cfg.Anthropic.BaseURL != "https://api.anthropic.com" {
			t.Errorf("Expected default Anthropic URL, got %s", cfg.Anthropic.BaseURL)
		}
		if cfg.Storage.DBPath != "requests.db" {
			t.Errorf("Expected default DB path requests.db, got %s", cfg.Storage.DBPath)
		}
	})

	t.Run("EnvironmentVariableOverrides", func(t *testing.T) {
		// Create a config file
		tempDir := t.TempDir()
		configPath := filepath.Join(tempDir, "config.yaml")
		configContent := `
server:
  port: 8080
providers:
  anthropic:
    base_url: "https://api.anthropic.com"
  openai:
    api_key: "file-key"
`
		err := os.WriteFile(configPath, []byte(configContent), 0644)
		if err != nil {
			t.Fatalf("Failed to write config file: %v", err)
		}

		// Set environment variables
		os.Setenv("CONFIG_PATH", configPath)
		os.Setenv("PORT", "9090")
		os.Setenv("ANTHROPIC_FORWARD_URL", "https://custom.anthropic.com")
		os.Setenv("OPENAI_API_KEY", "env-key")

		// Load config
		cfg, err := Load()
		if err != nil {
			t.Fatalf("Failed to load config: %v", err)
		}

		// Verify environment overrides
		if cfg.Server.Port != "9090" {
			t.Errorf("Expected port override 9090, got %s", cfg.Server.Port)
		}
		if cfg.Anthropic.BaseURL != "https://custom.anthropic.com" {
			t.Errorf("Expected Anthropic URL override, got %s", cfg.Anthropic.BaseURL)
		}
		if cfg.OpenAI.APIKey != "env-key" {
			t.Errorf("Expected OpenAI API key override, got %s", cfg.OpenAI.APIKey)
		}
	})

	t.Run("InvalidYAML", func(t *testing.T) {
		// Create invalid YAML file
		tempDir := t.TempDir()
		configPath := filepath.Join(tempDir, "invalid.yaml")
		configContent := `
server:
  port: [this is invalid
`
		err := os.WriteFile(configPath, []byte(configContent), 0644)
		if err != nil {
			t.Fatalf("Failed to write config file: %v", err)
		}

		os.Setenv("CONFIG_PATH", configPath)

		// Should still load with defaults (error is logged but not returned)
		cfg, err := Load()
		if err != nil {
			t.Fatalf("Expected config to load with defaults despite invalid YAML: %v", err)
		}

		// Should have default values
		if cfg.Server.Port != "3001" {
			t.Errorf("Expected default port 3001 after invalid YAML, got %s", cfg.Server.Port)
		}
	})
}

func TestConfig_ParseTimeouts(t *testing.T) {
	tests := []struct {
		name            string
		timeoutStr      string
		expectedMinutes int
		expectError     bool
	}{
		{"Valid minutes", "5m", 5, false},
		{"Valid seconds", "30s", 0, false}, // Will be 30 seconds, not minutes
		{"Valid hours", "2h", 120, false},
		{"Empty string", "", 10, false},          // Should use default
		{"Invalid format", "invalid", 10, false}, // Should use default
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// This test would require exposing the parseTimeout function
			// or testing it indirectly through the Load function
			// For now, we'll skip the implementation details
		})
	}
}
