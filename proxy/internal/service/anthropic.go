package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/seifghazi/claude-code-monitor/internal/config"
	"github.com/seifghazi/claude-code-monitor/internal/model"
)

type AnthropicService interface {
	ForwardRequest(ctx context.Context, request *model.AnthropicRequest, apiKey string, headers http.Header) (*http.Response, error)
	GradePrompt(ctx context.Context, messages []model.AnthropicMessage, systemMessages []model.AnthropicSystemMessage, apiKey string) (*model.PromptGrade, error)
}

type anthropicService struct {
	client *http.Client
	config *config.AnthropicConfig
}

func NewAnthropicService(cfg *config.AnthropicConfig) AnthropicService {
	return &anthropicService{
		client: &http.Client{
			Timeout: 60 * time.Second,
		},
		config: cfg,
	}
}

func (s *anthropicService) ForwardRequest(ctx context.Context, request *model.AnthropicRequest, apiKey string, headers http.Header) (*http.Response, error) {
	// Check if we have either an API key or Authorization header
	authHeader := headers.Get("Authorization")
	if apiKey == "" && authHeader == "" {
		return nil, fmt.Errorf("API key or Authorization header not provided")
	}

	requestBody, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	if s.config.BaseURL == "" {
		return nil, fmt.Errorf("anthropic base URL is not configured. Please set ANTHROPIC_BASE_URL")
	}

	baseURL, err := url.Parse(s.config.BaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse anthropic base URL '%s': %w", s.config.BaseURL, err)
	}

	if baseURL.Scheme == "" || baseURL.Host == "" {
		return nil, fmt.Errorf("invalid anthropic base URL, scheme and host are required: %s", s.config.BaseURL)
	}

	baseURL.Path = path.Join(baseURL.Path, "/v1/messages")
	fullURL := baseURL.String()

	req, err := http.NewRequestWithContext(ctx, "POST", fullURL, bytes.NewBuffer(requestBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Forward all headers except those that should be managed by the proxy
	excludedHeaders := map[string]bool{
		"host":              true,
		"connection":        true,
		"proxy-connection":  true,
		"proxy-authorization": true,
		"content-length":    true,
		"transfer-encoding": true,
		"te":                true,
		"trailer":           true,
		"upgrade":           true,
	}
	
	for name, values := range headers {
		lowerName := strings.ToLower(name)
		if !excludedHeaders[lowerName] {
			for _, value := range values {
				req.Header.Add(name, value)
			}
		}
	}
	
	// Override with proxy-specific headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("anthropic-version", s.config.Version)
	
	// Set x-api-key header if provided (this might override a forwarded header)
	if apiKey != "" {
		req.Header.Set("x-api-key", apiKey)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}

	return resp, nil
}

func (s *anthropicService) GradePrompt(ctx context.Context, messages []model.AnthropicMessage, systemMessages []model.AnthropicSystemMessage, apiKey string) (*model.PromptGrade, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("API key not provided")
	}

	userContentParts := s.extractUserContent(messages)
	if len(userContentParts) == 0 {
		return nil, fmt.Errorf("no user content found to grade")
	}

	originalPrompt := strings.Join(userContentParts, "\n\n")
	systemPrompt := s.extractSystemPrompt(systemMessages)

	gradingPrompt := s.buildGradingPrompt(originalPrompt, systemPrompt)

	claudeRequest := &model.AnthropicRequest{
		Model:     "claude-3-5-sonnet-20240620",
		MaxTokens: 4000,
		Messages: []model.AnthropicMessage{
			{
				Role:    "user",
				Content: gradingPrompt,
			},
		},
	}

	resp, err := s.ForwardRequest(ctx, claudeRequest, apiKey, http.Header{})
	if err != nil {
		return nil, fmt.Errorf("failed to send grading request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var claudeResponse struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&claudeResponse); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(claudeResponse.Content) == 0 {
		return nil, fmt.Errorf("empty response from Claude")
	}

	return s.parseGradingResponse(claudeResponse.Content[0].Text)
}

func (s *anthropicService) extractUserContent(messages []model.AnthropicMessage) []string {
	var userContentParts []string
	for _, msg := range messages {
		if msg.Role == "user" {
			blocks := msg.GetContentBlocks()
			for _, block := range blocks {
				if block.Type == "text" {
					text := strings.TrimSpace(block.Text)
					if text != "" && !s.isSystemReminder(text) {
						userContentParts = append(userContentParts, text)
					}
				}
			}
		}
	}
	return userContentParts
}

func (s *anthropicService) extractSystemPrompt(systemMessages []model.AnthropicSystemMessage) string {
	var systemPromptParts []string
	for _, msg := range systemMessages {
		if msg.Text != "" {
			systemPromptParts = append(systemPromptParts, msg.Text)
		}
	}
	systemPrompt := strings.Join(systemPromptParts, "\n\n")
	if systemPrompt == "" {
		systemPrompt = "No system prompt was provided for this request."
	}
	return systemPrompt
}

func (s *anthropicService) isSystemReminder(text string) bool {
	text = strings.TrimSpace(text)
	lowerText := strings.ToLower(text)

	systemPatterns := []string{
		"<system-reminder>",
		"system-reminder>",
		"this is a reminder that your todo list",
		"as you answer the user's questions, you can use the following context:",
		"important-instruction-reminders",
		"do not mention this to the user explicitly",
		"the user opened the file",
		"the user selected the following lines",
		"caveat: the messages below were generated by the user while running local commands",
	}

	for _, pattern := range systemPatterns {
		if strings.Contains(lowerText, strings.ToLower(pattern)) {
			return true
		}
	}

	return false
}

func (s *anthropicService) buildGradingPrompt(originalPrompt, systemPrompt string) string {
	return fmt.Sprintf(`<task>
You are an expert prompt engineer specializing in Anthropic's Claude best practices. Please analyze the following user prompt and provide a comprehensive grading report.

<original_prompt>
%s
</original_prompt>

For context, here is the system prompt used in this request:
<system_prompt>
%s
</system_prompt>

Please evaluate this prompt across these 5 criteria and provide your analysis in the exact JSON format specified below:

1. **Clarity & Explicitness** (1-5): How clear and specific are the instructions?
2. **Context & Motivation** (1-5): Does it explain why the task matters and provide sufficient background?
3. **Structure & Format** (1-5): Is it well-organized? Does it use XML tags effectively?
4. **Examples & Details** (1-5): Are there sufficient examples and detailed specifications?
5. **Task-Specific Best Practices** (1-5): Does it follow Claude-specific best practices (thinking prompts, role specification, etc.)?

Additionally, create an improved version of this prompt that addresses any weaknesses you identify. Include XML tags to structure the output if necessary.
</task>

<response_format>
Please respond with a JSON object in exactly this format:
{
  "overallScore": [1-5 integer],
  "detailedFeedback": "[comprehensive analysis of the prompt's strengths and weaknesses]",
  "improvedPrompt": "[your rewritten version of the prompt that addresses the issues]",
  "criteria": {
    "clarity": {
      "score": [1-5 integer],
      "feedback": "[specific feedback for clarity]"
    },
    "context": {
      "score": [1-5 integer], 
      "feedback": "[specific feedback for context]"
    },
    "structure": {
      "score": [1-5 integer],
      "feedback": "[specific feedback for structure]"
    },
    "examples": {
      "score": [1-5 integer],
      "feedback": "[specific feedback for examples]"
    },
    "taskSpecific": {
      "score": [1-5 integer],
      "feedback": "[specific feedback for task-specific practices]"
    }
  }
}
</response_format>`, originalPrompt, systemPrompt)
}

func (s *anthropicService) parseGradingResponse(responseText string) (*model.PromptGrade, error) {
	var jsonStr string

	if strings.Contains(responseText, "```json") {
		start := strings.Index(responseText, "```json") + 7
		end := strings.Index(responseText[start:], "```")
		if end != -1 {
			jsonStr = strings.TrimSpace(responseText[start : start+end])
		}
	} else {
		jsonStart := strings.Index(responseText, "{")
		jsonEnd := strings.LastIndex(responseText, "}")
		if jsonStart == -1 || jsonEnd == -1 {
			return nil, fmt.Errorf("no JSON found in Claude's response")
		}
		jsonStr = responseText[jsonStart : jsonEnd+1]
	}

	if jsonStr == "" {
		return nil, fmt.Errorf("no JSON found in Claude's response")
	}

	var gradingResult struct {
		OverallScore     int                            `json:"overallScore"`
		DetailedFeedback string                         `json:"detailedFeedback"`
		ImprovedPrompt   string                         `json:"improvedPrompt"`
		Criteria         map[string]model.CriteriaScore `json:"criteria"`
	}

	if err := json.Unmarshal([]byte(jsonStr), &gradingResult); err != nil {
		return nil, fmt.Errorf("failed to parse grading result: %w", err)
	}

	return &model.PromptGrade{
		Score:            gradingResult.OverallScore,
		MaxScore:         5,
		Feedback:         gradingResult.DetailedFeedback,
		ImprovedPrompt:   gradingResult.ImprovedPrompt,
		Criteria:         gradingResult.Criteria,
		GradingTimestamp: time.Now().Format(time.RFC3339),
		IsProcessing:     false,
	}, nil
}
