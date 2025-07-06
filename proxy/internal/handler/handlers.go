package handler

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"

	"github.com/seifghazi/claude-code-monitor/internal/model"
	"github.com/seifghazi/claude-code-monitor/internal/service"
)

type Handler struct {
	anthropicService    service.AnthropicService
	storageService      service.StorageService
	conversationService service.ConversationService
}

func New(anthropicService service.AnthropicService, storageService service.StorageService, logger *log.Logger) *Handler {
	conversationService := service.NewConversationService()

	return &Handler{
		anthropicService:    anthropicService,
		storageService:      storageService,
		conversationService: conversationService,
	}
}

func (h *Handler) ChatCompletions(w http.ResponseWriter, r *http.Request) {
	log.Println("🤖 Chat completion request received (OpenAI format)")

	decompressedBytes := getDecompressedBodyBytes(r)
	if decompressedBytes == nil {
		http.Error(w, "Error reading request body", http.StatusBadRequest)
		return
	}

	var req model.ChatCompletionRequest
	if err := json.Unmarshal(decompressedBytes, &req); err != nil {
		log.Printf("❌ Error parsing JSON: %v", err)
		writeErrorResponse(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	requestID := generateRequestID()
	startTime := time.Now()

	requestLog := &model.RequestLog{
		RequestID:   requestID,
		Timestamp:   time.Now().Format(time.RFC3339),
		Method:      r.Method,
		Endpoint:    "/v1/chat/completions",
		Headers:     SanitizeHeaders(r.Header),
		Body:        req,
		Model:       req.Model,
		UserAgent:   r.Header.Get("User-Agent"),
		ContentType: r.Header.Get("Content-Type"),
	}

	if _, err := h.storageService.SaveRequest(requestLog); err != nil {
		log.Printf("❌ Error saving request: %v", err)
	}

	response := &model.ChatCompletionResponse{
		ID:      fmt.Sprintf("chatcmpl-%d", time.Now().UnixNano()),
		Object:  "chat.completion",
		Created: time.Now().Unix(),
		Model:   req.Model,
		Choices: []model.Choice{
			{
				Index: 0,
				Message: model.ChatMessage{
					Role:    "assistant",
					Content: "Hello! This is a test response from the refactored proxy server.",
				},
				FinishReason: "stop",
			},
		},
		Usage: model.Usage{
			PromptTokens:     10,
			CompletionTokens: 20,
			TotalTokens:      30,
		},
	}

	if req.Model == "" {
		response.Model = "claude-3-sonnet"
	}

	responseLog := &model.ResponseLog{
		StatusCode:   http.StatusOK,
		Headers:      SanitizeHeaders(w.Header()),
		Body:         response,
		ResponseTime: time.Since(startTime).Milliseconds(),
		IsStreaming:  false,
	}

	// The requestLog object has the conversation details.
	// We need to set the response on it and then save the update.
	requestLog.Response = responseLog
	if err := h.storageService.UpdateRequestWithResponse(requestLog); err != nil {
		log.Printf("❌ Error updating request with response: %v", err)
	}

	writeJSONResponse(w, response)
}

func (h *Handler) Messages(w http.ResponseWriter, r *http.Request) {
	log.Println("🤖 Messages request received (Anthropic format)")

	decompressedBytes := getDecompressedBodyBytes(r)
	if decompressedBytes == nil {
		http.Error(w, "Error reading request body", http.StatusBadRequest)
		return
	}

	var req model.AnthropicRequest
	if err := json.Unmarshal(decompressedBytes, &req); err != nil {
		log.Printf("❌ Error parsing JSON: %v", err)
		writeErrorResponse(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Extract API key from incoming request headers
	apiKey := r.Header.Get("x-api-key")
	if apiKey == "" {
		// Also check for X-Api-Key (capitalized version)
		apiKey = r.Header.Get("X-Api-Key")
	}
	
	// Check if we have either an API key or Authorization header
	authHeader := r.Header.Get("Authorization")
	if apiKey == "" && authHeader == "" {
		log.Println("❌ No API key or Authorization header provided in request headers")
		writeErrorResponse(w, "API key (x-api-key header) or Authorization header required", http.StatusUnauthorized)
		return
	}

	requestID := generateRequestID()
	startTime := time.Now()

	// Create request log
	requestLog := &model.RequestLog{
		RequestID:   requestID,
		Timestamp:   time.Now().Format(time.RFC3339),
		Method:      r.Method,
		Endpoint:    "/v1/messages",
		Headers:     SanitizeHeaders(r.Header),
		Body:        req,
		Model:       req.Model,
		UserAgent:   r.Header.Get("User-Agent"),
		ContentType: r.Header.Get("Content-Type"),
	}

	if _, err := h.storageService.SaveRequest(requestLog); err != nil {
		log.Printf("❌ Error saving request: %v", err)
	}

	// Forward the request to Anthropic
	resp, err := h.anthropicService.ForwardRequest(r.Context(), &req, apiKey, r.Header)
	if err != nil {
		log.Printf("❌ Error forwarding to Anthropic API: %v", err)
		writeErrorResponse(w, "Failed to forward request", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	if req.Stream {
		h.handleStreamingResponse(w, resp, requestLog, startTime)
		return
	}

	h.handleNonStreamingResponse(w, resp, requestLog, startTime)
}

func (h *Handler) Models(w http.ResponseWriter, r *http.Request) {
	log.Println("📋 Models list requested")

	response := &model.ModelsResponse{
		Object: "list",
		Data: []model.ModelInfo{
			{
				ID:      "claude-3-sonnet-20240229",
				Object:  "model",
				Created: 1677610602,
				OwnedBy: "anthropic",
			},
			{
				ID:      "claude-3-opus-20240229",
				Object:  "model",
				Created: 1677610602,
				OwnedBy: "anthropic",
			},
			{
				ID:      "claude-3-haiku-20240307",
				Object:  "model",
				Created: 1677610602,
				OwnedBy: "anthropic",
			},
		},
	}

	writeJSONResponse(w, response)
}

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	response := &model.HealthResponse{
		Status:    "healthy",
		Timestamp: time.Now(),
	}

	writeJSONResponse(w, response)
}

func (h *Handler) UI(w http.ResponseWriter, r *http.Request) {
	htmlContent, err := os.ReadFile("index.html")
	if err != nil {
		log.Printf("❌ Error reading index.html: %v", err)
		http.Error(w, "UI not available", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "text/html")
	w.Write(htmlContent)
}

func (h *Handler) GetRequests(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 10 // Default limit
	}

	// Get model filter from query parameters
	modelFilter := r.URL.Query().Get("model")
	if modelFilter == "" {
		modelFilter = "all"
	}

	log.Printf("📊 GetRequests called - page: %d, limit: %d, modelFilter: %s", page, limit, modelFilter)

	// Get all requests with model filter applied at storage level
	allRequests, err := h.storageService.GetAllRequests(modelFilter)
	if err != nil {
		log.Printf("Error getting requests: %v", err)
		http.Error(w, "Failed to get requests", http.StatusInternalServerError)
		return
	}

	log.Printf("📊 Got %d requests from storage (filter: %s)", len(allRequests), modelFilter)

	// Convert pointers to values for consistency
	requests := make([]model.RequestLog, len(allRequests))
	for i, req := range allRequests {
		if req != nil {
			requests[i] = *req
		}
	}

	// Calculate total before pagination
	total := len(requests)

	// Apply pagination
	start := (page - 1) * limit
	end := start + limit
	if start >= len(requests) {
		requests = []model.RequestLog{}
	} else {
		if end > len(requests) {
			end = len(requests)
		}
		requests = requests[start:end]
	}

	log.Printf("📊 Returning %d requests after pagination", len(requests))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Requests []model.RequestLog `json:"requests"`
		Total    int                `json:"total"`
	}{
		Requests: requests,
		Total:    total,
	})
}

func (h *Handler) DeleteRequests(w http.ResponseWriter, r *http.Request) {
	log.Println("🗑️ Clearing request history")

	clearedCount, err := h.storageService.ClearRequests()
	if err != nil {
		log.Printf("❌ Error clearing requests: %v", err)
		writeErrorResponse(w, "Error clearing request history", http.StatusInternalServerError)
		return
	}

	log.Printf("✅ Deleted %d request files", clearedCount)

	response := map[string]interface{}{
		"message": "Request history cleared",
		"deleted": clearedCount,
	}

	writeJSONResponse(w, response)
}

func (h *Handler) NotFound(w http.ResponseWriter, r *http.Request) {
	writeErrorResponse(w, "Not found", http.StatusNotFound)
}

func (h *Handler) handleStreamingResponse(w http.ResponseWriter, resp *http.Response, requestLog *model.RequestLog, startTime time.Time) {
	log.Println("🌊 Streaming response detected, forwarding stream...")

	// Copy all response headers to client first
	for key, values := range resp.Header {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	
	// Override with streaming-specific headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	if resp.StatusCode != http.StatusOK {
		log.Printf("❌ Anthropic API error: %d", resp.StatusCode)
		errorBytes, _ := io.ReadAll(resp.Body)
		
		// Decompress error data for logging purposes only
		decompressedErrorBytes, err := decompressForLogging(errorBytes, resp.Header)
		if err != nil {
			log.Printf("⚠️ Warning: Failed to decompress error response for logging: %v", err)
			decompressedErrorBytes = errorBytes
		}
		
		log.Printf("Error details: %s", string(decompressedErrorBytes))

		responseLog := &model.ResponseLog{
			StatusCode:   resp.StatusCode,
			Headers:      SanitizeHeaders(resp.Header),
			BodyText:     string(decompressedErrorBytes), // Use decompressed data for logging
			ResponseTime: time.Since(startTime).Milliseconds(),
			IsStreaming:  true,
			CompletedAt:  time.Now().Format(time.RFC3339),
		}

		requestLog.Response = responseLog
		if err := h.storageService.UpdateRequestWithResponse(requestLog); err != nil {
			log.Printf("❌ Error updating request with error response: %v", err)
		}

		// Copy error response headers to client
		for key, values := range resp.Header {
			for _, value := range values {
				w.Header().Add(key, value)
			}
		}
		w.WriteHeader(resp.StatusCode)
		w.Write(errorBytes) // Send original (potentially compressed) data to client
		return
	}

	var fullResponseText strings.Builder
	var toolCalls []model.ContentBlock
	var streamingChunks []string

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" || !strings.HasPrefix(line, "data:") {
			continue
		}

		streamingChunks = append(streamingChunks, line)
		fmt.Fprintf(w, "%s\n\n", line)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}

		jsonData := strings.TrimPrefix(line, "data: ")
		var event model.StreamingEvent
		if err := json.Unmarshal([]byte(jsonData), &event); err != nil {
			log.Printf("⚠️ Error unmarshalling streaming event: %v", err)
			continue
		}

		switch event.Type {
		case "content_block_delta":
			if event.Delta != nil {
				if event.Delta.Type == "text_delta" {
					fullResponseText.WriteString(event.Delta.Text)
				} else if event.Delta.Type == "input_json_delta" {
					if event.Index != nil && *event.Index < len(toolCalls) {
						toolCalls[*event.Index].Input = append(toolCalls[*event.Index].Input, event.Delta.Input...)
					}
				}
			}
		case "content_block_start":
			if event.ContentBlock != nil && event.ContentBlock.Type == "tool_use" {
				toolCalls = append(toolCalls, *event.ContentBlock)
			}
		case "message_stop":
			// End of stream
			break
		}
	}

	responseLog := &model.ResponseLog{
		StatusCode:      resp.StatusCode,
		Headers:         SanitizeHeaders(resp.Header),
		StreamingChunks: streamingChunks,
		ResponseTime:    time.Since(startTime).Milliseconds(),
		IsStreaming:     true,
		CompletedAt:     time.Now().Format(time.RFC3339),
	}

	// Create a structured body for the log
	var responseBody model.AnthropicMessage
	responseBody.Role = "assistant"
	var contentBlocks []model.ContentBlock
	if fullResponseText.Len() > 0 {
		contentBlocks = append(contentBlocks, model.ContentBlock{
			Type: "text",
			Text: fullResponseText.String(),
		})
	}
	contentBlocks = append(contentBlocks, toolCalls...)
	responseBody.Content = contentBlocks
	responseLog.Body = responseBody

	requestLog.Response = responseLog
	if err := h.storageService.UpdateRequestWithResponse(requestLog); err != nil {
		log.Printf("❌ Error updating request with streaming response: %v", err)
	}

	if err := scanner.Err(); err != nil {
		log.Printf("❌ Streaming error: %v", err)
	} else {
		log.Println("✅ Streaming response completed")
	}
}

func (h *Handler) handleNonStreamingResponse(w http.ResponseWriter, resp *http.Response, requestLog *model.RequestLog, startTime time.Time) {
	responseBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("❌ Error reading Anthropic response: %v", err)
		writeErrorResponse(w, "Failed to read response", http.StatusInternalServerError)
		return
	}

	// Decompress data for logging purposes only
	decompressedBytes, err := decompressForLogging(responseBytes, resp.Header)
	if err != nil {
		log.Printf("⚠️ Warning: Failed to decompress response for logging: %v", err)
		// Continue with original compressed data for logging
		decompressedBytes = responseBytes
	}

	responseLog := &model.ResponseLog{
		StatusCode:   resp.StatusCode,
		Headers:      SanitizeHeaders(resp.Header),
		BodyText:     string(decompressedBytes), // Use decompressed data for logging
		ResponseTime: time.Since(startTime).Milliseconds(),
		IsStreaming:  false,
		CompletedAt:  time.Now().Format(time.RFC3339),
	}

	// Try to parse as JSON for structured logging using decompressed data
	if strings.Contains(resp.Header.Get("Content-Type"), "application/json") {
		var jsonBody interface{}
		if json.Unmarshal(decompressedBytes, &jsonBody) == nil {
			responseLog.Body = jsonBody
		}
	}

	requestLog.Response = responseLog
	if err := h.storageService.UpdateRequestWithResponse(requestLog); err != nil {
		log.Printf("❌ Error updating request with response: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		log.Printf("❌ Anthropic API error: %d %s", resp.StatusCode, string(decompressedBytes))
		
		// Copy error response headers to client
		for key, values := range resp.Header {
			for _, value := range values {
				w.Header().Add(key, value)
			}
		}
		w.WriteHeader(resp.StatusCode)
		w.Write(responseBytes) // Send original (potentially compressed) data to client
		return
	}

	log.Println("✅ Successfully forwarded request to Anthropic API")
	
	// Copy all response headers to client
	for key, values := range resp.Header {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	w.WriteHeader(resp.StatusCode)
	w.Write(responseBytes) // Send original (potentially compressed) data to client
}

func generateRequestID() string {
	bytes := make([]byte, 8)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func getBodyBytes(r *http.Request) []byte {
	if bodyBytes, ok := r.Context().Value(model.BodyBytesKey).([]byte); ok {
		return bodyBytes
	}
	return nil
}

func getDecompressedBodyBytes(r *http.Request) []byte {
	if bodyBytes, ok := r.Context().Value(model.DecompressedBodyKey).([]byte); ok {
		return bodyBytes
	}
	// Fallback to original body bytes if decompressed not available
	return getBodyBytes(r)
}

func writeJSONResponse(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("❌ Error encoding JSON response: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
	}
}

func writeErrorResponse(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(&model.ErrorResponse{Error: message})
}

// extractTextFromMessage tries multiple strategies to extract text from a message
func extractTextFromMessage(message json.RawMessage) string {
	// Strategy 1: Direct string (simple text message)
	var directString string
	if err := json.Unmarshal(message, &directString); err == nil && directString != "" {
		return directString
	}

	// Strategy 2: Array format [{"type": "text", "text": "..."}]
	var msgArray []interface{}
	if err := json.Unmarshal(message, &msgArray); err == nil {
		for _, item := range msgArray {
			if itemMap, ok := item.(map[string]interface{}); ok {
				if itemMap["type"] == "text" {
					if text, ok := itemMap["text"].(string); ok && text != "" {
						return text
					}
				}
			}
		}
	}

	// Strategy 3: Content object format {"content": [{"type": "text", "text": "..."}]}
	var msgContent map[string]interface{}
	if err := json.Unmarshal(message, &msgContent); err == nil {
		if content, ok := msgContent["content"]; ok {
			if contentArray, ok := content.([]interface{}); ok {
				for _, block := range contentArray {
					if blockMap, ok := block.(map[string]interface{}); ok {
						if blockMap["type"] == "text" {
							if text, ok := blockMap["text"].(string); ok && text != "" {
								return text
							}
						}
					}
				}
			}
		}

		// Also check if content is a string directly
		if contentStr, ok := msgContent["content"].(string); ok && contentStr != "" {
			return contentStr
		}
	}

	// Strategy 4: Single object with text field {"type": "text", "text": "..."}
	var singleObj map[string]interface{}
	if err := json.Unmarshal(message, &singleObj); err == nil {
		if singleObj["type"] == "text" {
			if text, ok := singleObj["text"].(string); ok && text != "" {
				return text
			}
		}

		// Also check for content field at top level
		if text, ok := singleObj["content"].(string); ok && text != "" {
			return text
		}
	}

	return ""
}

// Conversation handlers

func (h *Handler) GetConversations(w http.ResponseWriter, r *http.Request) {
	log.Println("📚 Getting conversations from Claude projects")

	conversations, err := h.conversationService.GetConversations()
	if err != nil {
		log.Printf("❌ Error getting conversations: %v", err)
		writeErrorResponse(w, "Failed to get conversations", http.StatusInternalServerError)
		return
	}

	// Flatten all conversations into a single array for the UI
	var allConversations []map[string]interface{}
	for _, convs := range conversations {
		for _, conv := range convs {
			// Extract first user message from the conversation
			var firstMessage string
			for _, msg := range conv.Messages {
				if msg.Type == "user" {
					// Try multiple parsing strategies
					text := extractTextFromMessage(msg.Message)
					if text != "" {
						firstMessage = text
						if len(firstMessage) > 200 {
							firstMessage = firstMessage[:200] + "..."
						}
						break
					}
				}
			}

			allConversations = append(allConversations, map[string]interface{}{
				"id":           conv.SessionID,
				"requestCount": conv.MessageCount,
				"startTime":    conv.StartTime.Format(time.RFC3339),
				"lastActivity": conv.EndTime.Format(time.RFC3339),
				"duration":     conv.EndTime.Sub(conv.StartTime).Milliseconds(),
				"firstMessage": firstMessage,
				"projectName":  conv.ProjectName,
			})
		}
	}

	// Sort by last activity (newest first)
	sort.Slice(allConversations, func(i, j int) bool {
		t1, _ := time.Parse(time.RFC3339, allConversations[i]["lastActivity"].(string))
		t2, _ := time.Parse(time.RFC3339, allConversations[j]["lastActivity"].(string))
		return t1.After(t2)
	})

	// Apply pagination
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 10
	}

	start := (page - 1) * limit
	end := start + limit
	if start > len(allConversations) {
		allConversations = []map[string]interface{}{}
	} else {
		if end > len(allConversations) {
			end = len(allConversations)
		}
		allConversations = allConversations[start:end]
	}

	response := map[string]interface{}{
		"conversations": allConversations,
	}

	writeJSONResponse(w, response)
}

func (h *Handler) GetConversationByID(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID, ok := vars["id"]
	if !ok {
		http.Error(w, "Session ID is required", http.StatusBadRequest)
		return
	}

	projectPath := r.URL.Query().Get("project")
	if projectPath == "" {
		http.Error(w, "Project path is required", http.StatusBadRequest)
		return
	}

	log.Printf("📖 Getting conversation %s from project %s", sessionID, projectPath)

	conversation, err := h.conversationService.GetConversation(projectPath, sessionID)
	if err != nil {
		log.Printf("❌ Error getting conversation: %v", err)
		http.Error(w, "Conversation not found", http.StatusNotFound)
		return
	}

	writeJSONResponse(w, conversation)
}

func (h *Handler) GetConversationsByProject(w http.ResponseWriter, r *http.Request) {
	projectPath := r.URL.Query().Get("project")
	if projectPath == "" {
		http.Error(w, "Project path is required", http.StatusBadRequest)
		return
	}

	log.Printf("📁 Getting conversations for project %s", projectPath)

	conversations, err := h.conversationService.GetConversationsByProject(projectPath)
	if err != nil {
		log.Printf("❌ Error getting project conversations: %v", err)
		writeErrorResponse(w, "Failed to get project conversations", http.StatusInternalServerError)
		return
	}

	writeJSONResponse(w, conversations)
}

// decompressForLogging decompresses gzip content for logging purposes only
// It does not affect the transparent proxy behavior
func decompressForLogging(data []byte, headers http.Header) ([]byte, error) {
	// Check if response is gzip-compressed
	if strings.Contains(strings.ToLower(headers.Get("Content-Encoding")), "gzip") {
		reader, err := gzip.NewReader(bytes.NewReader(data))
		if err != nil {
			return data, fmt.Errorf("failed to create gzip reader: %w", err)
		}
		defer reader.Close()

		decompressed, err := io.ReadAll(reader)
		if err != nil {
			return data, fmt.Errorf("failed to decompress gzip data: %w", err)
		}

		return decompressed, nil
	}

	// Return original data if not gzip-compressed
	return data, nil
}
