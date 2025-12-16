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

// RoutingDecision contains the result of routing analysis
type RoutingDecision struct {
	Provider      provider.Provider
	OriginalModel string
	TargetModel   string
}

type ModelRouter struct {
	config             *config.Config
	providers          map[string]provider.Provider
	subagentMappings   map[string]string             // agentName -> targetModel
	customAgentPrompts map[string]SubagentDefinition // promptHash -> definition
	modelProviderMap   map[string]string             // model -> provider mapping
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
		modelProviderMap:   initializeModelProviderMap(),
		logger:             logger,
	}

	// Only load custom agents if subagents are enabled
	if cfg.Subagents.Enable {
		router.loadCustomAgents()
	} else {
		logger.Println("")
		logger.Println("ℹ️  Subagent routing is disabled")
		logger.Println("   Enable it in config.yaml to route Claude Code agents to different LLM providers")
		logger.Println("")
	}
	return router
}

// initializeModelProviderMap creates a mapping of model names to their providers
func initializeModelProviderMap() map[string]string {
	modelMap := make(map[string]string)

	// OpenAI models
	openaiModels := []string{
		// GPT-5 family
		"gpt-5", "gpt-5-mini", "gpt-5-nano",

		// GPT-4.1 family
		"gpt-4.1", "gpt-4.1-2025-04-14",
		"gpt-4.1-mini", "gpt-4.1-mini-2025-04-14",
		"gpt-4.1-nano", "gpt-4.1-nano-2025-04-14",

		// GPT-4.5
		"gpt-4.5-preview", "gpt-4.5-preview-2025-02-27",

		// GPT-4o variants
		"gpt-4o", "gpt-4o-2024-08-06",
		"gpt-4o-mini", "gpt-4o-mini-2024-07-18",

		// GPT-3.5 variants
		"gpt-3.5-turbo", "gpt-3.5-turbo-0125", "gpt-3.5-turbo-1106", "gpt-3.5-turbo-instruct",

		// O1 series
		"o1", "o1-2024-12-17",
		"o1-pro", "o1-pro-2025-03-19",
		"o1-mini", "o1-mini-2024-09-12",

		// O3 series
		"o3-pro", "o3-pro-2025-06-10",
		"o3", "o3-2025-04-16",
		"o3-mini", "o3-mini-2025-01-31",
	}

	for _, model := range openaiModels {
		modelMap[model] = "openai"
	}

	// Anthropic models
	anthropicModels := []string{
		"claude-opus-4-1-20250805",
		"claude-opus-4-20250514",
		"claude-sonnet-4-20250514",
		"claude-sonnet-4-5-20250929",
		"claude-opus-4-5-20251101",
		"claude-3-7-sonnet-20250219",
		"claude-3-5-haiku-20241022",
	}

	for _, model := range anthropicModels {
		modelMap[model] = "anthropic"
	}

	return modelMap
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

		found := false
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
				found = true
				break
			}
		}

		// Log warning if subagent is mapped but definition not found
		if !found {
			r.logger.Printf("⚠️  Subagent '%s' is mapped to '%s' but definition file not found in:\n", agentName, targetModel)
			for _, path := range paths {
				r.logger.Printf("      - %s\n", path)
			}
		}
	}

	// Pretty print loaded subagents
	if len(r.customAgentPrompts) > 0 {
		r.logger.Println("")
		r.logger.Println("🤖 Subagent Model Mappings:")
		r.logger.Println("──────────────────────────────────────")

		for _, def := range r.customAgentPrompts {
			r.logger.Printf("   \033[36m%s\033[0m → \033[32m%s\033[0m",
				def.Name, def.TargetModel)
		}

		r.logger.Println("──────────────────────────────────────")
		r.logger.Println("")
	}
}

// DetermineRoute analyzes the request and returns routing information without modifying the request
func (r *ModelRouter) DetermineRoute(req *model.AnthropicRequest) (*RoutingDecision, error) {
	decision := &RoutingDecision{
		OriginalModel: req.Model,
		TargetModel:   req.Model, // default to original
	}

	// Check if subagents are enabled
	if !r.config.Subagents.Enable {
		// Subagents disabled, use default provider
		providerName := r.getProviderNameForModel(decision.TargetModel)
		decision.Provider = r.providers[providerName]
		if decision.Provider == nil {
			return nil, fmt.Errorf("no provider found for model %s", decision.TargetModel)
		}
		return decision, nil
	}

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
				r.logger.Printf("\033[36m%s\033[0m → \033[32m%s\033[0m",
					req.Model, definition.TargetModel)

				decision.TargetModel = definition.TargetModel
				decision.Provider = r.providers[definition.TargetProvider]
				if decision.Provider == nil {
					return nil, fmt.Errorf("provider %s not found for model %s",
						definition.TargetProvider, definition.TargetModel)
				}

				return decision, nil
			}
		}
	}

	// Default: use the original model and its provider
	providerName := r.getProviderNameForModel(decision.TargetModel)
	decision.Provider = r.providers[providerName]
	if decision.Provider == nil {
		return nil, fmt.Errorf("no provider found for model %s", decision.TargetModel)
	}

	return decision, nil
}

func (r *ModelRouter) hashString(s string) string {
	h := sha256.New()
	h.Write([]byte(s))
	fullHash := hex.EncodeToString(h.Sum(nil))
	shortHash := fullHash[:16]
	return shortHash
}

func (r *ModelRouter) getProviderNameForModel(model string) string {
	if provider, exists := r.modelProviderMap[model]; exists {
		return provider
	}

	// Default to anthropic
	r.logger.Printf("⚠️  Model '%s' doesn't match any known patterns, defaulting to anthropic", model)
	return "anthropic"
}
