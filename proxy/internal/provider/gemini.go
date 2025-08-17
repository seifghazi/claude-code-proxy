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

type GeminiProvider struct {
	client *http.Client
	config *config.GeminiProviderConfig
}

func NewGeminiProvider(cfg *config.GeminiProviderConfig) Provider {
	return &GeminiProvider{
		client: &http.Client{
			Timeout: 300 * time.Second, // 5 minutes timeout
		},
		config: cfg,
	}
}

func (p *GeminiProvider) Name() string {
	return "gemini"
}

func (p *GeminiProvider) ForwardRequest(ctx context.Context, originalReq *http.Request) (*http.Response, error) {
	// First, we need to convert the Anthropic request to Gemini format
	bodyBytes, err := io.ReadAll(originalReq.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read request body: %w", err)
	}
	originalReq.Body = io.NopCloser(bytes.NewReader(bodyBytes))

	var anthropicReq model.AnthropicRequest
	if err := json.Unmarshal(bodyBytes, &anthropicReq); err != nil {
		return nil, fmt.Errorf("failed to parse anthropic request: %w", err)
	}

	// Convert to Gemini format
	geminiReq := convertAnthropicToGemini(&anthropicReq)
	newBodyBytes, err := json.Marshal(geminiReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal gemini request: %w", err)
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

	// Determine the model to use
	modelName := "gemini-1.5-pro-latest" // Default model
	if anthropicReq.Model != "" {
		// Map Anthropic models to Gemini models
		if strings.Contains(anthropicReq.Model, "opus") || strings.Contains(anthropicReq.Model, "sonnet") {
			modelName = "gemini-1.5-pro-latest"
		} else if strings.Contains(anthropicReq.Model, "haiku") {
			modelName = "gemini-1.5-flash-latest"
		}
	}

	// Update the destination URL for Gemini
	proxyReq.URL.Scheme = baseURL.Scheme
	proxyReq.URL.Host = baseURL.Host
	proxyReq.URL.Path = fmt.Sprintf("/v1beta/models/%s:streamGenerateContent", modelName)
	
	// Add API key as query parameter
	q := proxyReq.URL.Query()
	q.Set("key", p.config.APIKey)
	proxyReq.URL.RawQuery = q.Encode()

	// Update request headers
	proxyReq.RequestURI = ""
	proxyReq.Host = baseURL.Host

	// Remove Anthropic-specific headers
	proxyReq.Header.Del("anthropic-version")
	proxyReq.Header.Del("x-api-key")
	
	// Set Gemini headers
	proxyReq.Header.Set("Content-Type", "application/json")

	// Execute the request
	resp, err := p.client.Do(proxyReq)
	if err != nil {
		return nil, fmt.Errorf("failed to forward request to Gemini: %w", err)
	}

	// Handle streaming response
	if anthropicReq.Stream {
		return p.handleStreamingResponse(resp)
	}

	// Handle regular response
	return p.handleRegularResponse(resp)
}

func (p *GeminiProvider) handleStreamingResponse(geminiResp *http.Response) (*http.Response, error) {
	// Read Gemini response
	defer geminiResp.Body.Close()
	
	// Create a pipe for streaming
	pr, pw := io.Pipe()
	
	// Create response with SSE headers
	resp := &http.Response{
		StatusCode: geminiResp.StatusCode,
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
		
		reader := bufio.NewReader(geminiResp.Body)
		for {
			line, err := reader.ReadBytes('\n')
			if err != nil {
				if err != io.EOF {
					fmt.Fprintf(pw, "event: error\ndata: %s\n\n", err.Error())
				}
				break
			}
			
			// Parse Gemini streaming response and convert to Anthropic SSE format
			if bytes.HasPrefix(line, []byte("data: ")) {
				data := bytes.TrimPrefix(line, []byte("data: "))
				data = bytes.TrimSpace(data)
				
				if string(data) == "[DONE]" {
					fmt.Fprintf(pw, "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n")
					break
				}
				
				var geminiChunk map[string]interface{}
				if err := json.Unmarshal(data, &geminiChunk); err == nil {
					// Convert Gemini chunk to Anthropic format
					anthropicEvent := convertGeminiChunkToAnthropicEvent(geminiChunk)
					eventData, _ := json.Marshal(anthropicEvent)
					fmt.Fprintf(pw, "event: %s\ndata: %s\n\n", anthropicEvent["type"], eventData)
				}
			}
		}
	}()
	
	return resp, nil
}

func (p *GeminiProvider) handleRegularResponse(geminiResp *http.Response) (*http.Response, error) {
	defer geminiResp.Body.Close()
	
	// Handle compression
	var reader io.Reader = geminiResp.Body
	if geminiResp.Header.Get("Content-Encoding") == "gzip" {
		gzReader, err := gzip.NewReader(geminiResp.Body)
		if err != nil {
			return nil, fmt.Errorf("failed to create gzip reader: %w", err)
		}
		defer gzReader.Close()
		reader = gzReader
	}
	
	bodyBytes, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("failed to read Gemini response: %w", err)
	}
	
	// Parse Gemini response
	var geminiResp2 map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &geminiResp2); err != nil {
		return nil, fmt.Errorf("failed to parse Gemini response: %w", err)
	}
	
	// Convert to Anthropic format
	anthropicResp := convertGeminiToAnthropicResponse(geminiResp2)
	newBodyBytes, err := json.Marshal(anthropicResp)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal anthropic response: %w", err)
	}
	
	// Create new response
	resp := &http.Response{
		StatusCode: geminiResp.StatusCode,
		Header:     make(http.Header),
		Body:       io.NopCloser(bytes.NewReader(newBodyBytes)),
	}
	
	// Copy relevant headers
	resp.Header.Set("Content-Type", "application/json")
	resp.Header.Set("Content-Length", fmt.Sprintf("%d", len(newBodyBytes)))
	
	return resp, nil
}

func convertAnthropicToGemini(anthropicReq *model.AnthropicRequest) map[string]interface{} {
	geminiReq := map[string]interface{}{
		"contents": []map[string]interface{}{},
		"generationConfig": map[string]interface{}{
			"temperature":     anthropicReq.Temperature,
			"maxOutputTokens": anthropicReq.MaxTokens,
		},
	}
	
	// Convert messages
	for _, msg := range anthropicReq.Messages {
		role := "user"
		if msg.Role == "assistant" {
			role = "model"
		}
		
		parts := []map[string]interface{}{}
		
		// Handle different content types
		switch content := msg.Content.(type) {
		case string:
			parts = append(parts, map[string]interface{}{
				"text": content,
			})
		case []interface{}:
			for _, item := range content {
				if itemMap, ok := item.(map[string]interface{}); ok {
					if itemMap["type"] == "text" {
						parts = append(parts, map[string]interface{}{
							"text": itemMap["text"],
						})
					}
				}
			}
		}
		
		geminiReq["contents"] = append(geminiReq["contents"].([]map[string]interface{}), map[string]interface{}{
			"role":  role,
			"parts": parts,
		})
	}
	
	// Add system instruction if present
	if len(anthropicReq.System) > 0 {
		systemText := ""
		for _, sysMsg := range anthropicReq.System {
			systemText += sysMsg.Text + "\n"
		}
		if systemText != "" {
			geminiReq["systemInstruction"] = map[string]interface{}{
				"parts": []map[string]interface{}{
					{"text": strings.TrimSpace(systemText)},
				},
			}
		}
	}
	
	return geminiReq
}

func convertGeminiToAnthropicResponse(geminiResp map[string]interface{}) map[string]interface{} {
	anthropicResp := map[string]interface{}{
		"id":     fmt.Sprintf("msg_%d", time.Now().Unix()),
		"type":   "message",
		"role":   "assistant",
		"content": []map[string]interface{}{},
		"model":  "claude-3-5-sonnet-20241022", // Fake it as Claude
		"usage": map[string]interface{}{
			"input_tokens":  0,
			"output_tokens": 0,
		},
	}
	
	// Extract content from Gemini response
	if candidates, ok := geminiResp["candidates"].([]interface{}); ok && len(candidates) > 0 {
		if candidate, ok := candidates[0].(map[string]interface{}); ok {
			if content, ok := candidate["content"].(map[string]interface{}); ok {
				if parts, ok := content["parts"].([]interface{}); ok {
					for _, part := range parts {
						if partMap, ok := part.(map[string]interface{}); ok {
							if text, ok := partMap["text"].(string); ok {
								anthropicResp["content"] = append(anthropicResp["content"].([]map[string]interface{}), map[string]interface{}{
									"type": "text",
									"text": text,
								})
							}
						}
					}
				}
			}
		}
	}
	
	// Extract usage if available
	if usageMetadata, ok := geminiResp["usageMetadata"].(map[string]interface{}); ok {
		if promptTokens, ok := usageMetadata["promptTokenCount"].(float64); ok {
			anthropicResp["usage"].(map[string]interface{})["input_tokens"] = int(promptTokens)
		}
		if candidateTokens, ok := usageMetadata["candidatesTokenCount"].(float64); ok {
			anthropicResp["usage"].(map[string]interface{})["output_tokens"] = int(candidateTokens)
		}
	}
	
	return anthropicResp
}

func convertGeminiChunkToAnthropicEvent(geminiChunk map[string]interface{}) map[string]interface{} {
	// This is a simplified conversion - you may need to adjust based on actual Gemini streaming format
	event := map[string]interface{}{
		"type": "content_block_delta",
		"delta": map[string]interface{}{
			"type": "text_delta",
			"text": "",
		},
	}
	
	// Extract text from Gemini chunk
	if candidates, ok := geminiChunk["candidates"].([]interface{}); ok && len(candidates) > 0 {
		if candidate, ok := candidates[0].(map[string]interface{}); ok {
			if content, ok := candidate["content"].(map[string]interface{}); ok {
				if parts, ok := content["parts"].([]interface{}); ok && len(parts) > 0 {
					if part, ok := parts[0].(map[string]interface{}); ok {
						if text, ok := part["text"].(string); ok {
							event["delta"].(map[string]interface{})["text"] = text
						}
					}
				}
			}
		}
	}
	
	return event
}