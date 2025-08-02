package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/joho/godotenv"
	"gopkg.in/yaml.v3"
)

type Config struct {
	Server    ServerConfig    `yaml:"server"`
	Providers ProvidersConfig `yaml:"providers"`
	Storage   StorageConfig   `yaml:"storage"`
	Subagents SubagentsConfig `yaml:"subagents"`
	// Legacy fields for backward compatibility
	Anthropic AnthropicConfig
}

type ServerConfig struct {
	Port     string         `yaml:"port"`
	Timeouts TimeoutsConfig `yaml:"timeouts"`
	// Legacy fields
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	IdleTimeout  time.Duration
}

type TimeoutsConfig struct {
	Read  string `yaml:"read"`
	Write string `yaml:"write"`
	Idle  string `yaml:"idle"`
}

type ProvidersConfig struct {
	Anthropic AnthropicProviderConfig `yaml:"anthropic"`
	OpenAI    OpenAIProviderConfig    `yaml:"openai"`
}

type AnthropicProviderConfig struct {
	BaseURL    string `yaml:"base_url"`
	Version    string `yaml:"version"`
	MaxRetries int    `yaml:"max_retries"`
}

type OpenAIProviderConfig struct {
	BaseURL string `yaml:"base_url"`
	APIKey  string `yaml:"api_key"`
}

type AnthropicConfig struct {
	BaseURL    string
	Version    string
	MaxRetries int
}

type StorageConfig struct {
	RequestsDir string `yaml:"requests_dir"`
	DBPath      string `yaml:"db_path"`
}

type SubagentsConfig struct {
	Mappings map[string]string `yaml:"mappings"`
}

func Load() (*Config, error) {
	// Load .env file if it exists
	// Look for .env file in the project root (one level up from proxy/)
	envPath := filepath.Join("..", ".env")
	if err := godotenv.Load(envPath); err != nil {
		// If .env doesn't exist in parent directory, try current directory
		if err := godotenv.Load(".env"); err != nil {
			// .env file is optional, so we just log and continue
			// This allows the app to work with system environment variables only
		}
	}

	// Start with default configuration
	cfg := &Config{
		Server: ServerConfig{
			Port:         getEnv("PORT", "3001"),
			ReadTimeout:  getDuration("READ_TIMEOUT", 600*time.Second),
			WriteTimeout: getDuration("WRITE_TIMEOUT", 600*time.Second),
			IdleTimeout:  getDuration("IDLE_TIMEOUT", 600*time.Second),
		},
		Providers: ProvidersConfig{
			Anthropic: AnthropicProviderConfig{
				BaseURL:    getEnv("ANTHROPIC_FORWARD_URL", "https://api.anthropic.com"),
				Version:    getEnv("ANTHROPIC_VERSION", "2023-06-01"),
				MaxRetries: getInt("ANTHROPIC_MAX_RETRIES", 3),
			},
			OpenAI: OpenAIProviderConfig{
				BaseURL: getEnv("OPENAI_BASE_URL", "https://api.openai.com"),
				APIKey:  getEnv("OPENAI_API_KEY", ""),
			},
		},
		Storage: StorageConfig{
			DBPath: getEnv("DB_PATH", "requests.db"),
		},
		Subagents: SubagentsConfig{
			Mappings: make(map[string]string),
		},
		// Legacy field for backward compatibility
		Anthropic: AnthropicConfig{
			BaseURL:    getEnv("ANTHROPIC_FORWARD_URL", "https://api.anthropic.com"),
			Version:    getEnv("ANTHROPIC_VERSION", "2023-06-01"),
			MaxRetries: getInt("ANTHROPIC_MAX_RETRIES", 3),
		},
	}

	// Try to load from YAML config file if specified
	configPath := getEnv("CONFIG_PATH", "../config.yaml")
	if configPath != "" {
		if err := cfg.loadFromFile(configPath); err != nil {
			// Log error but continue with defaults
			fmt.Printf("Warning: Failed to load config from %s: %v\n", configPath, err)
		}
	}

	// After loading from file, apply any timeout conversions if needed
	if cfg.Server.Timeouts.Read != "" {
		if duration, err := time.ParseDuration(cfg.Server.Timeouts.Read); err == nil {
			cfg.Server.ReadTimeout = duration
		}
	}
	if cfg.Server.Timeouts.Write != "" {
		if duration, err := time.ParseDuration(cfg.Server.Timeouts.Write); err == nil {
			cfg.Server.WriteTimeout = duration
		}
	}
	if cfg.Server.Timeouts.Idle != "" {
		if duration, err := time.ParseDuration(cfg.Server.Timeouts.Idle); err == nil {
			cfg.Server.IdleTimeout = duration
		}
	}

	// Sync legacy Anthropic config with new structure
	cfg.Anthropic = AnthropicConfig{
		BaseURL:    cfg.Providers.Anthropic.BaseURL,
		Version:    cfg.Providers.Anthropic.Version,
		MaxRetries: cfg.Providers.Anthropic.MaxRetries,
	}

	return cfg, nil
}

func (c *Config) loadFromFile(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	return yaml.Unmarshal(data, c)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getDuration(key string, defaultValue time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}

	duration, err := time.ParseDuration(value)
	if err != nil {
		return defaultValue
	}

	return duration
}

func getInt(key string, defaultValue int) int {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}

	intValue, err := strconv.Atoi(value)
	if err != nil {
		return defaultValue
	}

	return intValue
}
