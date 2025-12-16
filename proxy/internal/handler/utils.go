package handler

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/seifghazi/claude-code-monitor/internal/model"
)

// SanitizeHeaders removes sensitive headers before logging/storage
func SanitizeHeaders(headers http.Header) http.Header {
	sanitized := make(http.Header)

	sensitiveHeaders := []string{
		"x-api-key",
		"api-key",
		"authorization",
		"anthropic-api-key",
		"openai-api-key",
		"bearer",
	}

	for key, values := range headers {
		lowerKey := strings.ToLower(key)
		isSensitive := false

		for _, sensitive := range sensitiveHeaders {
			if strings.Contains(lowerKey, sensitive) {
				isSensitive = true
				break
			}
		}

		if isSensitive {
			// Calculate SHA256 hash for each sensitive header value
			hashedValues := make([]string, len(values))
			for i, value := range values {
				hash := sha256.Sum256([]byte(value))
				hashedValues[i] = fmt.Sprintf("sha256:%x", hash)
			}
			sanitized[key] = hashedValues
		} else {
			sanitized[key] = values
		}
	}

	return sanitized
}

// ConversationDiffAnalyzer analyzes conversation flows to identify new vs repeated content
type ConversationDiffAnalyzer struct{}

// NewConversationDiffAnalyzer creates a new conversation diff analyzer
func NewConversationDiffAnalyzer() *ConversationDiffAnalyzer {
	return &ConversationDiffAnalyzer{}
}

// ConversationFlowData represents the flow analysis of a conversation
type ConversationFlowData struct {
	TotalMessages     int                    `json:"totalMessages"`
	NewMessages       []int                  `json:"newMessages"`       // Indices of new messages
	DuplicateMessages []int                  `json:"duplicateMessages"` // Indices of duplicate messages
	MessageHashes     []string               `json:"messageHashes"`     // Content hashes for deduplication
	ConversationHash  string                 `json:"conversationHash"`  // Hash of entire conversation
	PreviousHash      string                 `json:"previousHash"`      // Hash of previous conversation state
	Changes           []ConversationChange   `json:"changes"`           // Detailed changes
	FlowMetadata      map[string]interface{} `json:"flowMetadata"`      // Additional metadata
}

// ConversationChange represents a specific change in the conversation
type ConversationChange struct {
	Type        string `json:"type"`        // "added", "modified", "context"
	MessageIdx  int    `json:"messageIdx"`  // Index of the message
	Role        string `json:"role"`        // Role of the message
	ContentHash string `json:"contentHash"` // Hash of the content
	Preview     string `json:"preview"`     // Short preview of content
	Timestamp   string `json:"timestamp"`   // When this change was detected
}

// AnalyzeConversationFlow analyzes a conversation to identify what's new vs repeated
func (c *ConversationDiffAnalyzer) AnalyzeConversationFlow(messages []model.AnthropicMessage, previousConversation []model.AnthropicMessage) *ConversationFlowData {
	totalMessages := len(messages)

	// Create hashes for current conversation
	currentHashes := make([]string, totalMessages)
	for i, msg := range messages {
		currentHashes[i] = c.hashMessage(msg)
	}

	// Create hashes for previous conversation (if any)
	var previousHashes []string
	if previousConversation != nil {
		previousHashes = make([]string, len(previousConversation))
		for i, msg := range previousConversation {
			previousHashes[i] = c.hashMessage(msg)
		}
	}

	// Identify new vs duplicate messages
	newMessages := []int{}
	duplicateMessages := []int{}
	changes := []ConversationChange{}

	// Simple approach: messages that appear after the previous conversation length are new
	previousLength := len(previousHashes)

	for i, msg := range messages {
		isNew := i >= previousLength

		// More sophisticated check: compare hashes
		if !isNew && i < len(previousHashes) {
			isNew = currentHashes[i] != previousHashes[i]
		}

		if isNew {
			newMessages = append(newMessages, i)
			changes = append(changes, ConversationChange{
				Type:        "added",
				MessageIdx:  i,
				Role:        msg.Role,
				ContentHash: currentHashes[i],
				Preview:     c.getMessagePreview(msg),
				Timestamp:   fmt.Sprintf("%d", time.Now().Unix()),
			})
		} else {
			duplicateMessages = append(duplicateMessages, i)
			changes = append(changes, ConversationChange{
				Type:        "context",
				MessageIdx:  i,
				Role:        msg.Role,
				ContentHash: currentHashes[i],
				Preview:     c.getMessagePreview(msg),
				Timestamp:   fmt.Sprintf("%d", time.Now().Unix()),
			})
		}
	}

	// If no previous conversation, consider a reasonable threshold of "new" vs "context"
	if previousConversation == nil && totalMessages > 1 {
		// Heuristic: last 30% of messages are "new", rest is context
		newThreshold := max(1, int(float64(totalMessages)*0.3))
		contextEnd := totalMessages - newThreshold

		newMessages = []int{}
		duplicateMessages = []int{}
		changes = []ConversationChange{}

		for i := 0; i < totalMessages; i++ {
			if i >= contextEnd {
				newMessages = append(newMessages, i)
				changes = append(changes, ConversationChange{
					Type:        "added",
					MessageIdx:  i,
					Role:        messages[i].Role,
					ContentHash: currentHashes[i],
					Preview:     c.getMessagePreview(messages[i]),
					Timestamp:   fmt.Sprintf("%d", time.Now().Unix()),
				})
			} else {
				duplicateMessages = append(duplicateMessages, i)
				changes = append(changes, ConversationChange{
					Type:        "context",
					MessageIdx:  i,
					Role:        messages[i].Role,
					ContentHash: currentHashes[i],
					Preview:     c.getMessagePreview(messages[i]),
					Timestamp:   fmt.Sprintf("%d", time.Now().Unix()),
				})
			}
		}
	}

	// Generate conversation hashes
	conversationHash := c.hashConversation(messages)
	previousHash := ""
	if previousConversation != nil {
		previousHash = c.hashConversation(previousConversation)
	}

	return &ConversationFlowData{
		TotalMessages:     totalMessages,
		NewMessages:       newMessages,
		DuplicateMessages: duplicateMessages,
		MessageHashes:     currentHashes,
		ConversationHash:  conversationHash,
		PreviousHash:      previousHash,
		Changes:           changes,
		FlowMetadata: map[string]interface{}{
			"newCount":       len(newMessages),
			"duplicateCount": len(duplicateMessages),
			"analyzeTime":    time.Now().Format(time.RFC3339),
		},
	}
}

// hashMessage creates a hash of a message for deduplication
func (c *ConversationDiffAnalyzer) hashMessage(msg model.AnthropicMessage) string {
	// Create a stable representation of the message
	content := c.normalizeMessageContent(msg.Content)
	data := fmt.Sprintf("%s|%s", msg.Role, content)

	hash := sha256.Sum256([]byte(data))
	return fmt.Sprintf("%x", hash[:8]) // Use first 8 bytes for shorter hash
}

// hashConversation creates a hash of the entire conversation
func (c *ConversationDiffAnalyzer) hashConversation(messages []model.AnthropicMessage) string {
	var parts []string
	for _, msg := range messages {
		parts = append(parts, c.hashMessage(msg))
	}

	conversationData := strings.Join(parts, "|")
	hash := sha256.Sum256([]byte(conversationData))
	return fmt.Sprintf("%x", hash[:16]) // Use first 16 bytes for conversation hash
}

// normalizeMessageContent converts message content to a normalized string
func (c *ConversationDiffAnalyzer) normalizeMessageContent(content interface{}) string {
	switch v := content.(type) {
	case string:
		return strings.TrimSpace(v)
	case []interface{}:
		var parts []string
		for _, item := range v {
			if block, ok := item.(map[string]interface{}); ok {
				if text, hasText := block["text"].(string); hasText {
					parts = append(parts, strings.TrimSpace(text))
				} else if blockType, hasType := block["type"].(string); hasType {
					// Handle different content types (tool_use, etc.)
					switch blockType {
					case "tool_use":
						if name, hasName := block["name"].(string); hasName {
							parts = append(parts, fmt.Sprintf("TOOL:%s", name))
						}
					case "tool_result":
						parts = append(parts, "TOOL_RESULT")
					default:
						parts = append(parts, fmt.Sprintf("CONTENT:%s", blockType))
					}
				}
			}
		}
		return strings.Join(parts, " ")
	default:
		// Convert to JSON and back for normalization
		jsonBytes, _ := json.Marshal(content)
		return string(jsonBytes)
	}
}

// getMessagePreview creates a short preview of a message
func (c *ConversationDiffAnalyzer) getMessagePreview(msg model.AnthropicMessage) string {
	content := c.normalizeMessageContent(msg.Content)
	if len(content) > 100 {
		return content[:100] + "..."
	}
	return content
}

// max returns the maximum of two integers
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
