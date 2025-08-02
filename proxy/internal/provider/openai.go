package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/seifghazi/claude-code-monitor/internal/config"
	"github.com/seifghazi/claude-code-monitor/internal/model"
)

type OpenAIProvider struct {
	client *http.Client
	config *config.OpenAIProviderConfig
}

func NewOpenAIProvider(cfg *config.OpenAIProviderConfig) Provider {
	return &OpenAIProvider{
		client: &http.Client{
			Timeout: 300 * time.Second, // 5 minutes timeout
		},
		config: cfg,
	}
}

func (p *OpenAIProvider) Name() string {
	return "openai"
}

func (p *OpenAIProvider) ForwardRequest(ctx context.Context, originalReq *http.Request) (*http.Response, error) {
	// First, we need to convert the Anthropic request to OpenAI format
	bodyBytes, err := io.ReadAll(originalReq.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read request body: %w", err)
	}
	originalReq.Body = io.NopCloser(bytes.NewReader(bodyBytes))

	var anthropicReq model.AnthropicRequest
	if err := json.Unmarshal(bodyBytes, &anthropicReq); err != nil {
		return nil, fmt.Errorf("failed to parse anthropic request: %w", err)
	}

	// Convert to OpenAI format
	openAIReq := convertAnthropicToOpenAI(&anthropicReq)
	newBodyBytes, err := json.Marshal(openAIReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal openai request: %w", err)
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

	// Update the destination URL for OpenAI
	proxyReq.URL.Scheme = baseURL.Scheme
	proxyReq.URL.Host = baseURL.Host
	proxyReq.URL.Path = "/v1/chat/completions" // OpenAI endpoint

	// Update request headers
	proxyReq.RequestURI = ""
	proxyReq.Host = baseURL.Host

	// Remove Anthropic-specific headers
	proxyReq.Header.Del("anthropic-version")
	proxyReq.Header.Del("x-api-key")

	// Add OpenAI headers
	if p.config.APIKey != "" {
		proxyReq.Header.Set("Authorization", "Bearer "+p.config.APIKey)
	}
	proxyReq.Header.Set("Content-Type", "application/json")

	// Forward the request
	resp, err := p.client.Do(proxyReq)
	if err != nil {
		return nil, fmt.Errorf("failed to forward request: %w", err)
	}

	// For streaming responses, we need to convert back to Anthropic format
	if anthropicReq.Stream {
		// Create a pipe to transform the response
		pr, pw := io.Pipe()

		// Start a goroutine to transform the stream
		go func() {
			defer pw.Close()
			transformOpenAIStreamToAnthropic(resp.Body, pw)
		}()

		// Replace the response body with our transformed stream
		resp.Body = pr
	} else {
		// For non-streaming, read and convert the response
		respBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("failed to read response body: %w", err)
		}

		// Convert OpenAI response back to Anthropic format
		transformedBody := transformOpenAIResponseToAnthropic(respBody)
		resp.Body = io.NopCloser(bytes.NewReader(transformedBody))
		resp.ContentLength = int64(len(transformedBody))
		resp.Header.Set("Content-Length", fmt.Sprintf("%d", len(transformedBody)))
	}

	return resp, nil
}

func convertAnthropicToOpenAI(req *model.AnthropicRequest) map[string]interface{} {
	messages := []map[string]interface{}{}

	// Add system messages
	for _, sysMsg := range req.System {
		messages = append(messages, map[string]interface{}{
			"role":    "system",
			"content": sysMsg.Text,
		})
	}

	// Add conversation messages
	for _, msg := range req.Messages {
		// Get content blocks from the message
		contentBlocks := msg.GetContentBlocks()
		content := ""
		if len(contentBlocks) > 0 {
			// Use the first text block
			content = contentBlocks[0].Text
		}

		messages = append(messages, map[string]interface{}{
			"role":    msg.Role,
			"content": content,
		})
	}

	openAIReq := map[string]interface{}{
		"model":       req.Model,
		"messages":    messages,
		"temperature": req.Temperature,
		"max_tokens":  req.MaxTokens,
		"stream":      req.Stream,
	}

	return openAIReq
}

func transformOpenAIResponseToAnthropic(respBody []byte) []byte {
	// This is a simplified transformation
	// In production, you'd want to handle all fields properly
	var openAIResp map[string]interface{}
	if err := json.Unmarshal(respBody, &openAIResp); err != nil {
		return respBody // Return as-is if we can't parse
	}

	// Extract the assistant's message
	content := ""
	if choices, ok := openAIResp["choices"].([]interface{}); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]interface{}); ok {
			if msg, ok := choice["message"].(map[string]interface{}); ok {
				if c, ok := msg["content"].(string); ok {
					content = c
				}
			}
		}
	}

	// Build Anthropic-style response
	anthropicResp := map[string]interface{}{
		"id":      openAIResp["id"],
		"type":    "message",
		"role":    "assistant",
		"content": []map[string]string{{"type": "text", "text": content}},
		"model":   openAIResp["model"],
		"usage":   openAIResp["usage"],
	}

	result, _ := json.Marshal(anthropicResp)
	return result
}

func transformOpenAIStreamToAnthropic(openAIStream io.ReadCloser, anthropicStream io.Writer) {
	defer openAIStream.Close()

	// This is a placeholder - in production you'd parse SSE events
	// and transform them from OpenAI format to Anthropic format
	io.Copy(anthropicStream, openAIStream)
}
