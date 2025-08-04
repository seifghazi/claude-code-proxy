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

	// Check for error responses
	if resp.StatusCode >= 400 {
		// Read the error body for debugging
		errorBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		// Log the error details
		// OpenAI API error - will be returned to client

		// Create an error response in Anthropic format
		errorResp := map[string]interface{}{
			"type": "error",
			"error": map[string]interface{}{
				"type":    "api_error",
				"message": fmt.Sprintf("OpenAI API error: %s", string(errorBody)),
			},
		}
		errorJSON, _ := json.Marshal(errorResp)

		// Create a new response with the error
		resp.Body = io.NopCloser(bytes.NewReader(errorJSON))
		resp.Header.Set("Content-Type", "application/json")
		resp.Header.Del("Content-Encoding")
		resp.ContentLength = int64(len(errorJSON))

		return resp, nil
	}

	// Handle gzip-encoded responses
	var bodyReader io.ReadCloser = resp.Body
	if resp.Header.Get("Content-Encoding") == "gzip" {
		gzReader, err := gzip.NewReader(resp.Body)
		if err != nil {
			resp.Body.Close()
			return nil, fmt.Errorf("failed to create gzip reader: %w", err)
		}
		bodyReader = gzReader
		resp.Header.Del("Content-Encoding")
		resp.Header.Del("Content-Length")
	}

	// For streaming responses, we need to convert back to Anthropic format
	if anthropicReq.Stream {
		// Create a pipe to transform the response
		pr, pw := io.Pipe()

		// Start a goroutine to transform the stream
		go func() {
			defer pw.Close()
			defer bodyReader.Close()
			transformOpenAIStreamToAnthropic(bodyReader, pw)
		}()

		// Replace the response body with our transformed stream
		resp.Body = pr
	} else {
		// For non-streaming, read and convert the response
		respBody, err := io.ReadAll(bodyReader)
		bodyReader.Close()
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

	// Combine all system messages into a single system message for OpenAI
	if len(req.System) > 0 {
		systemContent := ""
		for i, sysMsg := range req.System {
			if i > 0 {
				systemContent += "\n\n"
			}
			systemContent += sysMsg.Text
		}
		messages = append(messages, map[string]interface{}{
			"role":    "system",
			"content": systemContent,
		})
	}

	// Add conversation messages
	for _, msg := range req.Messages {
		// Handle messages with raw content that may contain tool results
		if contentArray, ok := msg.Content.([]interface{}); ok {
			// Check if this message contains tool results
			hasToolResults := false
			for _, item := range contentArray {
				if block, ok := item.(map[string]interface{}); ok {
					if blockType, hasType := block["type"].(string); hasType && blockType == "tool_result" {
						hasToolResults = true
						break
					}
				}
			}

			if hasToolResults {
				textContent := ""

				for _, item := range contentArray {
					if block, ok := item.(map[string]interface{}); ok {
						if blockType, hasType := block["type"].(string); hasType {
							if blockType == "text" {
								if text, hasText := block["text"].(string); hasText {
									textContent += text + "\n"
								}
							} else if blockType == "tool_result" {
								// Extract tool ID
								toolID := ""
								if id, hasID := block["tool_use_id"].(string); hasID {
									toolID = id
								}

								// Handle different formats of tool result content
								resultContent := ""
								if content, hasContent := block["content"]; hasContent {
									if contentStr, ok := content.(string); ok {
										resultContent = contentStr
									} else if contentList, ok := content.([]interface{}); ok {
										// If content is a list of blocks, extract text from each
										for _, c := range contentList {
											if contentMap, ok := c.(map[string]interface{}); ok {
												if contentMap["type"] == "text" {
													if text, ok := contentMap["text"].(string); ok {
														resultContent += text + "\n"
													}
												} else if text, hasText := contentMap["text"]; hasText {
													// Handle any dict by trying to extract text
													resultContent += fmt.Sprintf("%v\n", text)
												} else {
													// Try to JSON serialize
													if jsonBytes, err := json.Marshal(contentMap); err == nil {
														resultContent += string(jsonBytes) + "\n"
													} else {
														resultContent += fmt.Sprintf("%v\n", contentMap)
													}
												}
											}
										}
									} else if contentDict, ok := content.(map[string]interface{}); ok {
										// Handle dictionary content
										if contentDict["type"] == "text" {
											if text, ok := contentDict["text"].(string); ok {
												resultContent = text
											}
										} else {
											// Try to JSON serialize
											if jsonBytes, err := json.Marshal(contentDict); err == nil {
												resultContent = string(jsonBytes)
											} else {
												resultContent = fmt.Sprintf("%v", contentDict)
											}
										}
									} else {
										// Handle any other type by converting to string
										if jsonBytes, err := json.Marshal(content); err == nil {
											resultContent = string(jsonBytes)
										} else {
											resultContent = fmt.Sprintf("%v", content)
										}
									}
								}

								// In OpenAI format, tool results come from the user (matching Python behavior)
								textContent += fmt.Sprintf("Tool result for %s:\n%s\n", toolID, resultContent)
							}
						}
					}
				}

				// Add as a single user message with all the content
				if textContent == "" {
					textContent = "..."
				}
				messages = append(messages, map[string]interface{}{
					"role":    msg.Role,
					"content": strings.TrimSpace(textContent),
				})
			} else {
				// Handle regular messages with content blocks
				content := ""

				for _, item := range contentArray {
					if block, ok := item.(map[string]interface{}); ok {
						if blockType, hasType := block["type"].(string); hasType && blockType == "text" {
							if text, hasText := block["text"].(string); hasText {
								if content != "" {
									content += "\n"
								}
								content += text
							}
						}
					}
				}

				// Ensure content is never empty
				if content == "" {
					content = "..."
				}

				messages = append(messages, map[string]interface{}{
					"role":    msg.Role,
					"content": content,
				})
			}
		} else {
			// Handle simple string content
			contentBlocks := msg.GetContentBlocks()
			content := ""

			// Concatenate all text blocks
			for _, block := range contentBlocks {
				if block.Type == "text" {
					if content != "" {
						content += "\n"
					}
					content += block.Text
				}
			}

			// Ensure content is never empty
			if content == "" {
				content = "..."
			}

			messages = append(messages, map[string]interface{}{
				"role":    msg.Role,
				"content": content,
			})
		}
	}
	// Check if max_tokens exceeds the model's limit and cap it if necessary
	maxTokensLimit := 16384 // Assuming this is the limit for the model
	if req.MaxTokens > maxTokensLimit {
		// Capping max_tokens to model limit
		req.MaxTokens = maxTokensLimit
	}

	// All OpenAI models now use max_completion_tokens instead of deprecated max_tokens
	openAIReq := map[string]interface{}{
		"model":                 req.Model,
		"messages":              messages,
		"stream":                req.Stream,
		"max_completion_tokens": req.MaxTokens,
	}

	// If streaming is enabled, request usage data to be included in the final chunk
	if req.Stream {
		openAIReq["stream_options"] = map[string]interface{}{
			"include_usage": true,
		}
	}

	// Check if this is an o-series model (they don't support temperature)
	isOSeriesModel := strings.HasPrefix(req.Model, "o1") || strings.HasPrefix(req.Model, "o3")

	// Only include temperature for non-o-series models
	if !isOSeriesModel {
		openAIReq["temperature"] = req.Temperature
	}
	// Convert Anthropic tools to OpenAI format
	if len(req.Tools) > 0 {
		tools := make([]map[string]interface{}, 0, len(req.Tools))
		for _, tool := range req.Tools {
			// Ensure tool has required fields
			if tool.Name == "" {
				// Skip tools with empty names
				continue
			}

			// Build parameters with error checking
			parameters := make(map[string]interface{})
			parameters["type"] = tool.InputSchema.Type
			if parameters["type"] == "" {
				parameters["type"] = "object" // Default to object type
			}

			// Handle properties safely with array validation
			if tool.InputSchema.Properties != nil {
				// Fix array properties that are missing items field
				fixedProperties := make(map[string]interface{})
				for propName, propValue := range tool.InputSchema.Properties {
					if prop, ok := propValue.(map[string]interface{}); ok {
						// Check if this is an array type missing items
						if propType, hasType := prop["type"]; hasType && propType == "array" {
							if _, hasItems := prop["items"]; !hasItems {
								// Add default items definition for arrays
								// Add default items for array properties missing them
								prop["items"] = map[string]interface{}{"type": "string"}
							}
						}
						fixedProperties[propName] = prop
					} else {
						// Keep non-map properties as-is
						fixedProperties[propName] = propValue
					}
				}
				parameters["properties"] = fixedProperties
			} else {
				parameters["properties"] = make(map[string]interface{})
			}

			// Handle required fields
			if len(tool.InputSchema.Required) > 0 {
				parameters["required"] = tool.InputSchema.Required
			}

			// Build function definition
			functionDef := map[string]interface{}{
				"name":       tool.Name,
				"parameters": parameters,
			}

			// Add description if present
			if tool.Description != "" {
				functionDef["description"] = tool.Description
			}

			openAITool := map[string]interface{}{
				"type":     "function",
				"function": functionDef,
			}
			tools = append(tools, openAITool)
		}
		openAIReq["tools"] = tools

		// Handle tool_choice if present
		if req.ToolChoice != nil {
			// Convert Anthropic tool_choice to OpenAI format
			if toolChoiceMap, ok := req.ToolChoice.(map[string]interface{}); ok {
				choiceType := toolChoiceMap["type"]
				switch choiceType {
				case "auto":
					openAIReq["tool_choice"] = "auto"
				case "any":
					openAIReq["tool_choice"] = "required"
				case "tool":
					// Specific tool choice
					if name, hasName := toolChoiceMap["name"].(string); hasName {
						openAIReq["tool_choice"] = map[string]interface{}{
							"type": "function",
							"function": map[string]interface{}{
								"name": name,
							},
						}
					}
				default:
					// Default to auto if we can't determine
					openAIReq["tool_choice"] = "auto"
				}
			}
		}
	}

	return openAIReq
}

func getMapKeys(m map[string]interface{}) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func transformOpenAIResponseToAnthropic(respBody []byte) []byte {
	// This is a simplified transformation
	// In production, you'd want to handle all fields properly
	var openAIResp map[string]interface{}
	if err := json.Unmarshal(respBody, &openAIResp); err != nil {
		return respBody // Return as-is if we can't parse
	}

	// Extract the assistant's message
	var contentBlocks []map[string]interface{}

	if choices, ok := openAIResp["choices"].([]interface{}); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]interface{}); ok {
			if msg, ok := choice["message"].(map[string]interface{}); ok {
				// Handle regular text content
				if content, ok := msg["content"].(string); ok && content != "" {
					contentBlocks = append(contentBlocks, map[string]interface{}{
						"type": "text",
						"text": content,
					})
				}

				// Handle tool calls
				if toolCalls, ok := msg["tool_calls"].([]interface{}); ok {
					// Since this proxy forwards to Claude/Anthropic API, we should always
					// use tool_use blocks so Claude can execute the tools properly
					// (regardless of which model generated the response)
					for _, tc := range toolCalls {
						if toolCall, ok := tc.(map[string]interface{}); ok {
							if function, ok := toolCall["function"].(map[string]interface{}); ok {
								// Convert OpenAI tool call to Anthropic tool_use format
								anthropicToolUse := map[string]interface{}{
									"type": "tool_use",
									"id":   toolCall["id"],
									"name": function["name"],
								}

								// Parse the arguments JSON string
								if argsStr, ok := function["arguments"].(string); ok {
									var args map[string]interface{}
									if err := json.Unmarshal([]byte(argsStr), &args); err == nil {
										anthropicToolUse["input"] = args
									} else {
										// If parsing fails, wrap in a raw field like Python does
										// Failed to parse tool arguments - skip
										anthropicToolUse["input"] = map[string]interface{}{"raw": argsStr}
									}
								} else if args, ok := function["arguments"].(map[string]interface{}); ok {
									// Already a map, use directly
									anthropicToolUse["input"] = args
								} else {
									// Fallback for any other type
									anthropicToolUse["input"] = map[string]interface{}{"raw": fmt.Sprintf("%v", function["arguments"])}
								}

								contentBlocks = append(contentBlocks, anthropicToolUse)
							}
						}
					}
				}
			}
		}
	}

	// If no content blocks were created, add a default empty text block
	if len(contentBlocks) == 0 {
		contentBlocks = []map[string]interface{}{
			{"type": "text", "text": ""},
		}
	}

	// Build Anthropic-style response
	anthropicResp := map[string]interface{}{
		"id":      openAIResp["id"],
		"type":    "message",
		"role":    "assistant",
		"content": contentBlocks,
		"model":   openAIResp["model"],
	}

	// Convert OpenAI usage format to Anthropic format
	if usage, ok := openAIResp["usage"].(map[string]interface{}); ok {
		anthropicUsage := map[string]interface{}{}

		// Map prompt_tokens to input_tokens
		if promptTokens, ok := usage["prompt_tokens"].(float64); ok {
			anthropicUsage["input_tokens"] = int(promptTokens)
		}

		// Map completion_tokens to output_tokens
		if completionTokens, ok := usage["completion_tokens"].(float64); ok {
			anthropicUsage["output_tokens"] = int(completionTokens)
		}

		// Include total_tokens if needed (though Anthropic format doesn't typically use it)
		if totalTokens, ok := usage["total_tokens"].(float64); ok {
			anthropicUsage["total_tokens"] = int(totalTokens)
		}

		anthropicResp["usage"] = anthropicUsage
	}

	result, _ := json.Marshal(anthropicResp)
	return result
}

func transformOpenAIStreamToAnthropic(openAIStream io.ReadCloser, anthropicStream io.Writer) {
	defer openAIStream.Close()

	scanner := bufio.NewScanner(openAIStream)
	var messageStarted bool
	var contentStarted bool

	for scanner.Scan() {
		line := scanner.Text()

		// Skip empty lines
		if line == "" {
			continue
		}

		// Handle SSE data lines
		if strings.HasPrefix(line, "data: ") {
			data := strings.TrimPrefix(line, "data: ")

			// Handle end of stream
			if data == "[DONE]" {
				// Send Anthropic-style completion
				if contentStarted {
					fmt.Fprintf(anthropicStream, "data: {\"type\":\"content_block_stop\",\"index\":0}\n\n")
				}
				if messageStarted {
					fmt.Fprintf(anthropicStream, "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null}}\n\n")
					fmt.Fprintf(anthropicStream, "data: {\"type\":\"message_stop\"}\n\n")
				}
				break
			}

			// Parse OpenAI response
			var openAIChunk map[string]interface{}
			if err := json.Unmarshal([]byte(data), &openAIChunk); err != nil {
				continue
			}

			// Check for usage data BEFORE processing choices
			// According to OpenAI docs, usage is sent in the final chunk with empty choices array
			if usage, hasUsage := openAIChunk["usage"].(map[string]interface{}); hasUsage {
				// Convert OpenAI usage to Anthropic format
				anthropicUsage := map[string]interface{}{}

				// Handle both float64 and int types
				if promptTokens, ok := usage["prompt_tokens"].(float64); ok {
					anthropicUsage["input_tokens"] = int(promptTokens)
				} else if promptTokens, ok := usage["prompt_tokens"].(int); ok {
					anthropicUsage["input_tokens"] = promptTokens
				}

				if completionTokens, ok := usage["completion_tokens"].(float64); ok {
					anthropicUsage["output_tokens"] = int(completionTokens)
				} else if completionTokens, ok := usage["completion_tokens"].(int); ok {
					anthropicUsage["output_tokens"] = completionTokens
				}

				if len(anthropicUsage) > 0 {
					// Send usage data in a message_delta event
					usageDelta := map[string]interface{}{
						"type":  "message_delta",
						"delta": map[string]interface{}{},
						"usage": anthropicUsage,
					}
					usageJSON, _ := json.Marshal(usageDelta)
					fmt.Fprintf(anthropicStream, "data: %s\n\n", usageJSON)
				}
			}

			// Extract choices array
			choices, ok := openAIChunk["choices"].([]interface{})
			if !ok || len(choices) == 0 {
				// Skip further processing if no choices, but we already handled usage above
				continue
			}

			choice, ok := choices[0].(map[string]interface{})
			if !ok {
				continue
			}

			delta, ok := choice["delta"].(map[string]interface{})
			if !ok {
				continue
			}

			// Handle first chunk - send message_start
			if !messageStarted {
				messageStarted = true
				messageStart := map[string]interface{}{
					"type": "message_start",
					"message": map[string]interface{}{
						"id":            openAIChunk["id"],
						"type":          "message",
						"role":          "assistant",
						"model":         openAIChunk["model"],
						"content":       []interface{}{},
						"stop_reason":   nil,
						"stop_sequence": nil,
						"usage":         map[string]interface{}{
							// Empty usage - will be updated in final chunk
						},
					},
				}
				startJSON, _ := json.Marshal(messageStart)
				fmt.Fprintf(anthropicStream, "data: %s\n\n", startJSON)
			}

			// Handle content
			if content, hasContent := delta["content"].(string); hasContent && content != "" {
				if !contentStarted {
					contentStarted = true
					// Send content_block_start
					blockStart := map[string]interface{}{
						"type":  "content_block_start",
						"index": 0,
						"content_block": map[string]interface{}{
							"type": "text",
							"text": "",
						},
					}
					blockStartJSON, _ := json.Marshal(blockStart)
					fmt.Fprintf(anthropicStream, "data: %s\n\n", blockStartJSON)
				}

				// Send content_block_delta
				contentDelta := map[string]interface{}{
					"type":  "content_block_delta",
					"index": 0,
					"delta": map[string]interface{}{
						"type": "text_delta",
						"text": content,
					},
				}
				deltaJSON, _ := json.Marshal(contentDelta)
				fmt.Fprintf(anthropicStream, "data: %s\n\n", deltaJSON)
			}

		}
	}
}
