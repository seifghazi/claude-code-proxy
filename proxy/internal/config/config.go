package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Server    ServerConfig
	Anthropic AnthropicConfig
	Storage   StorageConfig
}

type ServerConfig struct {
	Port         string
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	IdleTimeout  time.Duration
}

type AnthropicConfig struct {
	BaseURL    string
	Version    string
	MaxRetries int
}

type StorageConfig struct {
	RequestsDir string
	DBPath      string
}

func Load() (*Config, error) {
	cfg := &Config{
		Server: ServerConfig{
			Port:         getEnv("PORT", "3001"),
			ReadTimeout:  getDuration("READ_TIMEOUT", 600*time.Second),  // Increased to 10 minutes
			WriteTimeout: getDuration("WRITE_TIMEOUT", 600*time.Second), // Increased to 10 minutes
			IdleTimeout:  getDuration("IDLE_TIMEOUT", 600*time.Second),  // Increased to 10 minutes
		},
		Anthropic: AnthropicConfig{
			BaseURL:    getEnv("ANTHROPIC_FORWARD_URL", "https://api.anthropic.com"),
			Version:    getEnv("ANTHROPIC_VERSION", "2023-06-01"),
			MaxRetries: getInt("ANTHROPIC_MAX_RETRIES", 3),
		},
		Storage: StorageConfig{
			DBPath: getEnv("DB_PATH", "requests.db"),
		},
	}

	return cfg, nil
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
