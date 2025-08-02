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
	for agentName, targetModel := range r.subagentMappings {
		// Try loading from project level first, then user level
		paths := []string{
			fmt.Sprintf(".claude/agents/%s.md", agentName),
			fmt.Sprintf("%s/.claude/agents/%s.md", os.Getenv("HOME"), agentName),
		}

		for _, path := range paths {
			content, err := os.ReadFile(path)
			if err != nil {
				continue
			}

			// Parse agent file: metadata\n---\nsystem prompt
			parts := strings.Split(string(content), "\n---\n")
			if len(parts) >= 2 {
				systemPrompt := strings.TrimSpace(parts[1])

				// Extract only the static part (before "Notes:" if it exists)
				staticPrompt := r.extractStaticPrompt(systemPrompt)
				hash := r.hashString(staticPrompt)

				// Determine provider for the target model
				providerName := r.getProviderNameForModel(targetModel)

				r.customAgentPrompts[hash] = SubagentDefinition{
					Name:           agentName,
					TargetModel:    targetModel,
					TargetProvider: providerName,
					FullPrompt:     staticPrompt,
				}

				r.logger.Printf("Loaded custom agent: %s (hash: %s) -> %s",
					agentName, hash, targetModel)
				break
			}
		}
	}
}

// RouteRequest determines which provider and model to use for a request
func (r *ModelRouter) RouteRequest(req *model.AnthropicRequest) (provider.Provider, string, error) {
	originalModel := req.Model

	// Claude Code pattern: Check if we have exactly 2 system messages
	if len(req.System) == 2 {
		// First should be "You are Claude Code..."
		if strings.Contains(req.System[0].Text, "You are Claude Code") {
			// Second message could be either:
			// 1. A regular Claude Code prompt (no Notes: section)
			// 2. A subagent prompt (may have Notes: section)

			fullPrompt := req.System[1].Text

			// Extract static portion (before "Notes:" if it exists)
			staticPrompt := r.extractStaticPrompt(fullPrompt)
			promptHash := r.hashString(staticPrompt)

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
			r.logger.Printf("Regular Claude Code request detected, using original model %s", originalModel)
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
	return hex.EncodeToString(h.Sum(nil))[:16]
}

func (r *ModelRouter) getProviderNameForModel(model string) string {
	// Map models to providers
	if strings.HasPrefix(model, "claude") {
		return "anthropic"
	} else if strings.HasPrefix(model, "gpt") {
		return "openai"
	}
	// Default to anthropic
	return "anthropic"
}
