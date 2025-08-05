package model

import (
	"encoding/json"
	"time"
)

type ContextKey string

const BodyBytesKey ContextKey = "bodyBytes"

type PromptGrade struct {
	Score            int                      `json:"score"`
	MaxScore         int                      `json:"maxScore"`
	Feedback         string                   `json:"feedback"`
	ImprovedPrompt   string                   `json:"improvedPrompt"`
	Criteria         map[string]CriteriaScore `json:"criteria"`
	GradingTimestamp string                   `json:"gradingTimestamp"`
	IsProcessing     bool                     `json:"isProcessing"`
}

type CriteriaScore struct {
	Score    int    `json:"score"`
	Feedback string `json:"feedback"`
}

type RequestLog struct {
	RequestID     string              `json:"requestId"`
	Timestamp     string              `json:"timestamp"`
	Method        string              `json:"method"`
	Endpoint      string              `json:"endpoint"`
	Headers       map[string][]string `json:"headers"`
	Body          interface{}         `json:"body"`
	Model         string              `json:"model,omitempty"`
	OriginalModel string              `json:"originalModel,omitempty"`
	RoutedModel   string              `json:"routedModel,omitempty"`
	UserAgent     string              `json:"userAgent"`
	ContentType   string              `json:"contentType"`
	PromptGrade   *PromptGrade        `json:"promptGrade,omitempty"`
	Response      *ResponseLog        `json:"response,omitempty"`
}

type ResponseLog struct {
	StatusCode      int                 `json:"statusCode"`
	Headers         map[string][]string `json:"headers"`
	Body            json.RawMessage     `json:"body,omitempty"`
	BodyText        string              `json:"bodyText,omitempty"`
	ResponseTime    int64               `json:"responseTime"`
	StreamingChunks []string            `json:"streamingChunks,omitempty"`
	IsStreaming     bool                `json:"isStreaming"`
	CompletedAt     string              `json:"completedAt"`
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatCompletionRequest struct {
	Model    string        `json:"model"`
	Messages []ChatMessage `json:"messages"`
	Stream   bool          `json:"stream,omitempty"`
}

type AnthropicUsage struct {
	InputTokens              int    `json:"input_tokens"`
	OutputTokens             int    `json:"output_tokens"`
	CacheCreationInputTokens int    `json:"cache_creation_input_tokens,omitempty"`
	CacheReadInputTokens     int    `json:"cache_read_input_tokens,omitempty"`
	ServiceTier              string `json:"service_tier,omitempty"`
}

type AnthropicResponse struct {
	Content      []AnthropicContentBlock `json:"content"`
	ID           string                  `json:"id"`
	Model        string                  `json:"model"`
	Role         string                  `json:"role"`
	StopReason   string                  `json:"stop_reason"`
	StopSequence *string                 `json:"stop_sequence"`
	Type         string                  `json:"type"`
	Usage        AnthropicUsage          `json:"usage"`
}

type AnthropicContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type AnthropicMessage struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"`
}

func (m *AnthropicMessage) GetContentBlocks() []AnthropicContentBlock {
	switch v := m.Content.(type) {
	case string:
		return []AnthropicContentBlock{{Type: "text", Text: v}}
	case []interface{}:
		var blocks []AnthropicContentBlock
		for _, item := range v {
			if block, ok := item.(map[string]interface{}); ok {
				if typ, hasType := block["type"].(string); hasType {
					if text, hasText := block["text"].(string); hasText {
						blocks = append(blocks, AnthropicContentBlock{Type: typ, Text: text})
					}
				}
			}
		}
		return blocks
	case []AnthropicContentBlock:
		return v
	default:
		return []AnthropicContentBlock{}
	}
}

type AnthropicSystemMessage struct {
	Text         string        `json:"text"`
	Type         string        `json:"type"`
	CacheControl *CacheControl `json:"cache_control,omitempty"`
}

type CacheControl struct {
	Type string `json:"type"`
}

type Tool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema InputSchema `json:"input_schema"`
}

type InputSchema struct {
	Type       string                 `json:"type"`
	Properties map[string]interface{} `json:"properties"`
	Required   []string               `json:"required,omitempty"`
}

type AnthropicRequest struct {
	Model       string                   `json:"model"`
	Messages    []AnthropicMessage       `json:"messages"`
	MaxTokens   int                      `json:"max_tokens"`
	Temperature *float64                 `json:"temperature,omitempty"`
	System      []AnthropicSystemMessage `json:"system,omitempty"`
	Stream      bool                     `json:"stream,omitempty"`
	Tools       []Tool                   `json:"tools,omitempty"`
	ToolChoice  interface{}              `json:"tool_choice,omitempty"`
}

type ModelsResponse struct {
	Object string      `json:"object"`
	Data   []ModelInfo `json:"data"`
}

type ModelInfo struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	OwnedBy string `json:"owned_by"`
}

type GradeRequest struct {
	Messages       []AnthropicMessage       `json:"messages"`
	SystemMessages []AnthropicSystemMessage `json:"systemMessages"`
	RequestID      string                   `json:"requestId,omitempty"`
}

type HealthResponse struct {
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
}

type ErrorResponse struct {
	Error   string `json:"error"`
	Details string `json:"details,omitempty"`
}

type StreamingEvent struct {
	Type         string        `json:"type"`
	Index        *int          `json:"index,omitempty"`
	Delta        *Delta        `json:"delta,omitempty"`
	ContentBlock *ContentBlock `json:"content_block,omitempty"`
}

type Delta struct {
	Type  string          `json:"type,omitempty"`
	Text  string          `json:"text,omitempty"`
	Name  string          `json:"name,omitempty"`
	Input json.RawMessage `json:"input,omitempty"`
}

type ContentBlock struct {
	Type  string          `json:"type"`
	ID    string          `json:"id,omitempty"`
	Name  string          `json:"name,omitempty"`
	Input json.RawMessage `json:"input,omitempty"`
	Text  string          `json:"text,omitempty"`
}
