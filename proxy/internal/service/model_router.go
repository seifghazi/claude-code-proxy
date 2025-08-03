package service

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/seifghazi/claude-code-monitor/internal/config"
	"github.com/seifghazi/claude-code-monitor/internal/model"
	"github.com/seifghazi/claude-code-monitor/internal/provider"
)

type ModelRouter struct {
	config             *config.Config
	providers          map[string]provider.Provider
	subagentMappings   map[string]string             // agentName -> targetModel
	customAgentPrompts map[string]SubagentDefinition // promptHash -> definition
	logger             *log.Logger
}

type SubagentDefinition struct {
	Name           string
	TargetModel    string
	TargetProvider string
	FullPrompt     string // Store for debugging
}

func NewModelRouter(cfg *config.Config, providers map[string]provider.Provider, logger *log.Logger) *ModelRouter {
	router := &ModelRouter{
		config:             cfg,
		providers:          providers,
		subagentMappings:   cfg.Subagents.Mappings,
		customAgentPrompts: make(map[string]SubagentDefinition),
		logger:             logger,
	}

	router.loadCustomAgents()
	return router
}

// extractStaticPrompt extracts the portion before "Notes:" if it exists
func (r *ModelRouter) extractStaticPrompt(systemPrompt string) string {
	// Find the "Notes:" section
	notesIndex := strings.Index(systemPrompt, "\nNotes:")
	if notesIndex == -1 {
		notesIndex = strings.Index(systemPrompt, "\n\nNotes:")
	}

	if notesIndex != -1 {
		// Return only the part before "Notes:"
		return strings.TrimSpace(systemPrompt[:notesIndex])
	}

	// If no "Notes:" section, return the whole prompt
	return strings.TrimSpace(systemPrompt)
}

func (r *ModelRouter) loadCustomAgents() {
	r.logger.Printf("Loading custom agents from mappings: %+v", r.subagentMappings)

	for agentName, targetModel := range r.subagentMappings {
		// Try loading from project level first, then user level
		paths := []string{
			fmt.Sprintf(".claude/agents/%s.md", agentName),
			fmt.Sprintf("%s/.claude/agents/%s.md", os.Getenv("HOME"), agentName),
		}

		for _, path := range paths {
			r.logger.Printf("Trying to load agent from: %s", path)
			content, err := os.ReadFile(path)
			if err != nil {
				r.logger.Printf("Failed to read %s: %v", path, err)
				continue
			}

			r.logger.Printf("Successfully read agent file: %s (size: %d bytes)", path, len(content))

			// Parse agent file: metadata\n---\nsystem prompt
			parts := strings.Split(string(content), "\n---\n")
			r.logger.Printf("Agent file parts: %d", len(parts))
			if len(parts) >= 2 {
				systemPrompt := strings.TrimSpace(parts[1])
				r.logger.Printf("System prompt (first 200 chars): %.200s", systemPrompt)

				// Extract only the static part (before "Notes:" if it exists)
				staticPrompt := r.extractStaticPrompt(systemPrompt)
				hash := r.hashString(staticPrompt)

				r.logger.Printf("Static prompt after extraction (first 200 chars): %.200s", staticPrompt)

				// Determine provider for the target model
				providerName := r.getProviderNameForModel(targetModel)

				r.customAgentPrompts[hash] = SubagentDefinition{
					Name:           agentName,
					TargetModel:    targetModel,
					TargetProvider: providerName,
					FullPrompt:     staticPrompt,
				}

				r.logger.Printf("Loaded custom agent: %s (hash: %s) -> %s (provider: %s)",
					agentName, hash, targetModel, providerName)
				break
			} else {
				r.logger.Printf("Invalid agent file format for %s: expected at least 2 parts separated by ---", agentName)
			}
		}
	}

	r.logger.Printf("Total custom agents loaded: %d", len(r.customAgentPrompts))
}

// RouteRequest determines which provider and model to use for a request
func (r *ModelRouter) RouteRequest(req *model.AnthropicRequest) (provider.Provider, string, error) {
	originalModel := req.Model

	r.logger.Printf("RouteRequest: Model=%s, System messages count=%d", originalModel, len(req.System))

	// Debug: Print loaded custom agents
	r.logger.Printf("Loaded custom agents: %d", len(r.customAgentPrompts))
	for hash, def := range r.customAgentPrompts {
		r.logger.Printf("  Agent: %s (hash: %s) -> %s", def.Name, hash, def.TargetModel)
	}

	// Claude Code pattern: Check if we have exactly 2 system messages
	if len(req.System) == 2 {
		r.logger.Printf("System[0]: %.100s...", req.System[0].Text)
		r.logger.Printf("System[1]: %.100s...", req.System[1].Text)

		// First should be "You are Claude Code..."
		if strings.Contains(req.System[0].Text, "You are Claude Code") {
			// Second message could be either:
			// 1. A regular Claude Code prompt (no Notes: section)
			// 2. A subagent prompt (may have Notes: section)

			fullPrompt := req.System[1].Text

			// Extract static portion (before "Notes:" if it exists)
			staticPrompt := r.extractStaticPrompt(fullPrompt)
			promptHash := r.hashString(staticPrompt)

			r.logger.Printf("Static prompt hash: %s", promptHash)
			r.logger.Printf("Static prompt (first 200 chars): %.200s", staticPrompt)

			// Check if this matches a known custom agent
			if definition, exists := r.customAgentPrompts[promptHash]; exists {
				r.logger.Printf("Subagent '%s' detected -> routing to %s",
					definition.Name, definition.TargetModel)

				req.Model = definition.TargetModel
				provider := r.providers[definition.TargetProvider]
				if provider == nil {
					return nil, originalModel, fmt.Errorf("provider %s not found for model %s",
						definition.TargetProvider, definition.TargetModel)
				}

				return provider, originalModel, nil
			}

			// This is a regular Claude Code request (not a known subagent)
			r.logger.Printf("No matching subagent found for hash %s, using original model %s", promptHash, originalModel)
		}
	}

	// Default: use the original model and its provider
	providerName := r.getProviderNameForModel(originalModel)
	provider := r.providers[providerName]
	if provider == nil {
		return nil, originalModel, fmt.Errorf("no provider found for model %s", originalModel)
	}

	return provider, originalModel, nil
}

func (r *ModelRouter) hashString(s string) string {
	h := sha256.New()
	h.Write([]byte(s))
	fullHash := hex.EncodeToString(h.Sum(nil))
	shortHash := fullHash[:16]
	r.logger.Printf("Hashing string (length: %d) -> %s", len(s), shortHash)
	return shortHash
}

func (r *ModelRouter) getProviderNameForModel(model string) string {
	// Map models to providers
	if strings.HasPrefix(model, "claude") {
		return "anthropic"
	} else if strings.HasPrefix(model, "gpt") || strings.HasPrefix(model, "o") {
		return "openai"
	}
	// Default to anthropic
	return "anthropic"
}
