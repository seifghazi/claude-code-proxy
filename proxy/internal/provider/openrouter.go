package provider

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/seifghazi/claude-code-monitor/internal/config"
	"github.com/seifghazi/claude-code-monitor/internal/model"
)

type OpenRouterProvider struct {
	client *http.Client
	config *config.OpenRouterProviderConfig
}

func NewOpenRouterProvider(cfg *config.OpenRouterProviderConfig) Provider {
	return &OpenRouterProvider{
		client: &http.Client{
			Timeout: 300 * time.Second, // 5 minutes timeout
		},
		config: cfg,
	}
}

func (p *OpenRouterProvider) Name() string {
	return "openrouter"
}

func (p *OpenRouterProvider) ForwardRequest(ctx context.Context, originalReq *http.Request) (*http.Response, error) {
	// First, we need to convert the Anthropic request to OpenRouter format
	bodyBytes, err := io.ReadAll(originalReq.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read request body: %w", err)
	}
	originalReq.Body = io.NopCloser(bytes.NewReader(bodyBytes))

	var anthropicReq model.AnthropicRequest
	if err := json.Unmarshal(bodyBytes, &anthropicReq); err != nil {
		return nil, fmt.Errorf("failed to parse anthropic request: %w", err)
	}

	// Convert to OpenRouter format (similar to OpenAI format)
	openRouterReq := convertAnthropicToOpenRouter(&anthropicReq)
	newBodyBytes, err := json.Marshal(openRouterReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal openrouter request: %w", err)
	}

	// Clone the request with new body
	proxyReq := originalReq.Clone(ctx)
	proxyReq.Body = io.NopCloser(bytes.NewReader(newBodyBytes))
	proxyReq.ContentLength = int64(len(newBodyBytes))

	// Parse the configured base URL
	baseURL, err := url.Parse(p.config.BaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse base URL '%s': %w", p.config.BaseURL, err)
	}

	// Update the destination URL for OpenRouter
	proxyReq.URL.Scheme = baseURL.Scheme
	proxyReq.URL.Host = baseURL.Host
	proxyReq.URL.Path = "/v1/chat/completions" // OpenRouter endpoint

	// Update request headers
	proxyReq.RequestURI = ""
	proxyReq.Host = baseURL.Host

	// Remove Anthropic-specific headers
	proxyReq.Header.Del("anthropic-version")
	proxyReq.Header.Del("x-api-key")

	// Set OpenRouter headers
	proxyReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", p.config.APIKey))
	proxyReq.Header.Set("Content-Type", "application/json")
	
	// Optional: Set HTTP-Referer for OpenRouter analytics
	proxyReq.Header.Set("HTTP-Referer", "https://github.com/seifghazi/claude-code-proxy")
	
	// Optional: Set X-Title for OpenRouter dashboard
	proxyReq.Header.Set("X-Title", "Claude Code Proxy")

	// Execute the request
	resp, err := p.client.Do(proxyReq)
	if err != nil {
		return nil, fmt.Errorf("failed to forward request to OpenRouter: %w", err)
	}

	// Handle streaming response
	if anthropicReq.Stream {
		return p.handleStreamingResponse(resp)
	}

	// Handle regular response
	return p.handleRegularResponse(resp)
}

func (p *OpenRouterProvider) handleStreamingResponse(openRouterResp *http.Response) (*http.Response, error) {
	// Create a pipe for streaming
	pr, pw := io.Pipe()

	// Create response with SSE headers
	resp := &http.Response{
		StatusCode: openRouterResp.StatusCode,
		Header:     make(http.Header),
		Body:       pr,
	}

	// Set SSE headers
	resp.Header.Set("Content-Type", "text/event-stream")
	resp.Header.Set("Cache-Control", "no-cache")
	resp.Header.Set("Connection", "keep-alive")

	// Start streaming conversion in a goroutine
	go func() {
		defer pw.Close()
		defer openRouterResp.Body.Close()

		scanner := bufio.NewScanner(openRouterResp.Body)
		for scanner.Scan() {
			line := scanner.Text()

			// OpenRouter uses SSE format similar to OpenAI
			if strings.HasPrefix(line, "data: ") {
				data := strings.TrimPrefix(line, "data: ")
				data = strings.TrimSpace(data)

				if data == "[DONE]" {
					// Send Anthropic-style stop event
					fmt.Fprintf(pw, "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n")
					break
				}

				var openRouterChunk map[string]interface{}
				if err := json.Unmarshal([]byte(data), &openRouterChunk); err == nil {
					// Convert OpenRouter chunk to Anthropic format
					anthropicEvent := convertOpenRouterChunkToAnthropicEvent(openRouterChunk)
					eventData, _ := json.Marshal(anthropicEvent)
					fmt.Fprintf(pw, "event: %s\ndata: %s\n\n", anthropicEvent["type"], eventData)
				}
			}
		}
	}()

	return resp, nil
}

func (p *OpenRouterProvider) handleRegularResponse(openRouterResp *http.Response) (*http.Response, error) {
	defer openRouterResp.Body.Close()

	// Handle compression
	var reader io.Reader = openRouterResp.Body
	if openRouterResp.Header.Get("Content-Encoding") == "gzip" {
		gzReader, err := gzip.NewReader(openRouterResp.Body)
		if err != nil {
			return nil, fmt.Errorf("failed to create gzip reader: %w", err)
		}
		defer gzReader.Close()
		reader = gzReader
	}

	bodyBytes, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("failed to read OpenRouter response: %w", err)
	}

	// Parse OpenRouter response
	var openRouterResp2 map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &openRouterResp2); err != nil {
		return nil, fmt.Errorf("failed to parse OpenRouter response: %w", err)
	}

	// Convert to Anthropic format
	anthropicResp := convertOpenRouterToAnthropicResponse(openRouterResp2)
	newBodyBytes, err := json.Marshal(anthropicResp)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal anthropic response: %w", err)
	}

	// Create new response
	resp := &http.Response{
		StatusCode: openRouterResp.StatusCode,
		Header:     make(http.Header),
		Body:       io.NopCloser(bytes.NewReader(newBodyBytes)),
	}

	// Copy relevant headers
	resp.Header.Set("Content-Type", "application/json")
	resp.Header.Set("Content-Length", fmt.Sprintf("%d", len(newBodyBytes)))

	return resp, nil
}

func convertAnthropicToOpenRouter(anthropicReq *model.AnthropicRequest) map[string]interface{} {
	openRouterReq := map[string]interface{}{
		"model":       anthropicReq.Model,
		"messages":    []map[string]interface{}{},
		"max_tokens":  anthropicReq.MaxTokens,
		"temperature": anthropicReq.Temperature,
		"stream":      anthropicReq.Stream,
	}

	// Add system message if present
	if len(anthropicReq.System) > 0 {
		systemText := ""
		for _, sysMsg := range anthropicReq.System {
			systemText += sysMsg.Text + "\n"
		}
		if systemText != "" {
			openRouterReq["messages"] = append(openRouterReq["messages"].([]map[string]interface{}), map[string]interface{}{
				"role":    "system",
				"content": strings.TrimSpace(systemText),
			})
		}
	}

	// Convert messages
	for _, msg := range anthropicReq.Messages {
		message := map[string]interface{}{
			"role": msg.Role,
		}

		// Handle different content types
		switch content := msg.Content.(type) {
		case string:
			message["content"] = content
		case []interface{}:
			// For multi-part content, convert to OpenRouter format
			var textContent string
			for _, item := range content {
				if itemMap, ok := item.(map[string]interface{}); ok {
					if itemMap["type"] == "text" {
						if text, ok := itemMap["text"].(string); ok {
							textContent += text
						}
					}
					// Note: OpenRouter supports image inputs for some models
					// You can extend this to handle image content if needed
				}
			}
			message["content"] = textContent
		}

		openRouterReq["messages"] = append(openRouterReq["messages"].([]map[string]interface{}), message)
	}

	// Add optional parameters
	// Note: TopP, TopK, and StopSequences are not available in the current AnthropicRequest model
	// You can add them if needed in the future

	// OpenRouter specific: Add provider preferences if needed
	// This allows fallback to different providers
	openRouterReq["route"] = "fallback"

	return openRouterReq
}

func convertOpenRouterToAnthropicResponse(openRouterResp map[string]interface{}) map[string]interface{} {
	anthropicResp := map[string]interface{}{
		"id":     openRouterResp["id"],
		"type":   "message",
		"role":   "assistant",
		"content": []map[string]interface{}{},
		"model":  "claude-3-5-sonnet-20241022", // Fake it as Claude
		"usage": map[string]interface{}{
			"input_tokens":  0,
			"output_tokens": 0,
		},
	}

	// Extract content from OpenRouter response
	if choices, ok := openRouterResp["choices"].([]interface{}); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]interface{}); ok {
			if message, ok := choice["message"].(map[string]interface{}); ok {
				if content, ok := message["content"].(string); ok {
					anthropicResp["content"] = append(anthropicResp["content"].([]map[string]interface{}), map[string]interface{}{
						"type": "text",
						"text": content,
					})
				}
			}
		}
	}

	// Extract usage information
	if usage, ok := openRouterResp["usage"].(map[string]interface{}); ok {
		if promptTokens, ok := usage["prompt_tokens"].(float64); ok {
			anthropicResp["usage"].(map[string]interface{})["input_tokens"] = int(promptTokens)
		}
		if completionTokens, ok := usage["completion_tokens"].(float64); ok {
			anthropicResp["usage"].(map[string]interface{})["output_tokens"] = int(completionTokens)
		}
	}

	return anthropicResp
}

func convertOpenRouterChunkToAnthropicEvent(openRouterChunk map[string]interface{}) map[string]interface{} {
	// Default event type
	event := map[string]interface{}{
		"type": "content_block_delta",
		"delta": map[string]interface{}{
			"type": "text_delta",
			"text": "",
		},
	}

	// Extract text from OpenRouter chunk
	if choices, ok := openRouterChunk["choices"].([]interface{}); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]interface{}); ok {
			if delta, ok := choice["delta"].(map[string]interface{}); ok {
				if content, ok := delta["content"].(string); ok {
					event["delta"].(map[string]interface{})["text"] = content
				}
			}

			// Check for finish reason
			if finishReason, ok := choice["finish_reason"].(string); ok && finishReason != "" {
				event["type"] = "message_stop"
			}
		}
	}

	return event
}