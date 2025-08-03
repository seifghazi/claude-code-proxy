package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
	"github.com/seifghazi/claude-code-monitor/internal/config"
	"github.com/seifghazi/claude-code-monitor/internal/model"
)

// MockStorageService implements StorageService interface for testing
type MockStorageService struct {
	SavedRequests    []model.RequestLog
	ReturnError      error
	RequestsToReturn []model.RequestLog
	TotalRequests    int
}

func (m *MockStorageService) SaveRequest(request *model.RequestLog) (string, error) {
	if m.ReturnError != nil {
		return "", m.ReturnError
	}
	m.SavedRequests = append(m.SavedRequests, *request)
	return "test-id-123", nil
}

func (m *MockStorageService) GetRequests(page, limit int) ([]model.RequestLog, int, error) {
	if m.ReturnError != nil {
		return nil, 0, m.ReturnError
	}
	return m.RequestsToReturn, m.TotalRequests, nil
}

func (m *MockStorageService) ClearRequests() (int, error) {
	if m.ReturnError != nil {
		return 0, m.ReturnError
	}
	count := len(m.SavedRequests)
	m.SavedRequests = nil
	return count, nil
}

func (m *MockStorageService) UpdateRequestWithGrading(requestID string, grade *model.PromptGrade) error {
	return m.ReturnError
}

func (m *MockStorageService) UpdateRequestWithResponse(request *model.RequestLog) error {
	return m.ReturnError
}

func (m *MockStorageService) EnsureDirectoryExists() error {
	return nil
}

func (m *MockStorageService) GetRequestByShortID(shortID string) (*model.RequestLog, string, error) {
	if m.ReturnError != nil {
		return nil, "", m.ReturnError
	}
	if len(m.RequestsToReturn) > 0 {
		return &m.RequestsToReturn[0], "full-id", nil
	}
	return nil, "", nil
}

func (m *MockStorageService) GetConfig() *config.StorageConfig {
	return &config.StorageConfig{
		DBPath: "test.db",
	}
}

func (m *MockStorageService) GetAllRequests(modelFilter string) ([]*model.RequestLog, error) {
	if m.ReturnError != nil {
		return nil, m.ReturnError
	}
	result := make([]*model.RequestLog, len(m.RequestsToReturn))
	for i := range m.RequestsToReturn {
		result[i] = &m.RequestsToReturn[i]
	}
	return result, nil
}

// MockAnthropicService implements AnthropicService interface for testing
type MockAnthropicService struct {
	ReturnResponse  *http.Response
	ReturnError     error
	ReceivedRequest *http.Request
}

func (m *MockAnthropicService) ForwardRequest(ctx context.Context, originalReq *http.Request) (*http.Response, error) {
	m.ReceivedRequest = originalReq
	if m.ReturnError != nil {
		return nil, m.ReturnError
	}
	if m.ReturnResponse != nil {
		return m.ReturnResponse, nil
	}
	// Return a default successful response
	return &http.Response{
		StatusCode: 200,
		Body:       io.NopCloser(bytes.NewBufferString(`{"id":"test","content":[{"text":"Hello"}]}`)),
		Header:     make(http.Header),
	}, nil
}

func TestHealthEndpoint(t *testing.T) {
	// Create handler with mocks
	mockStorage := &MockStorageService{}
	mockAnthropic := &MockAnthropicService{}
	handler := New(mockAnthropic, mockStorage, nil)

	// Create test request
	req, err := http.NewRequest("GET", "/health", nil)
	if err != nil {
		t.Fatal(err)
	}

	// Create response recorder
	rr := httptest.NewRecorder()

	// Create router and register handler
	router := mux.NewRouter()
	router.HandleFunc("/health", handler.Health).Methods("GET")

	// Serve the request
	router.ServeHTTP(rr, req)

	// Check status code
	if status := rr.Code; status != http.StatusOK {
		t.Errorf("Handler returned wrong status code: got %v want %v", status, http.StatusOK)
	}

	// Check response body
	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Errorf("Failed to parse response body: %v", err)
	}

	if response["status"] != "healthy" {
		t.Errorf("Expected status 'healthy', got %v", response["status"])
	}
}

func TestGetRequestsEndpoint(t *testing.T) {
	// Create mock storage with test data
	mockStorage := &MockStorageService{
		RequestsToReturn: []model.RequestLog{
			{
				ID:       "test-1",
				Method:   "POST",
				Endpoint: "/v1/messages",
				Model:    "claude-3-opus",
			},
			{
				ID:       "test-2",
				Method:   "POST",
				Endpoint: "/v1/messages",
				Model:    "claude-3-sonnet",
			},
		},
		TotalRequests: 2,
	}
	mockAnthropic := &MockAnthropicService{}
	handler := New(mockAnthropic, mockStorage, nil)

	// Create test request
	req, err := http.NewRequest("GET", "/api/requests?page=1&limit=10", nil)
	if err != nil {
		t.Fatal(err)
	}

	// Create response recorder
	rr := httptest.NewRecorder()

	// Create router and register handler
	router := mux.NewRouter()
	router.HandleFunc("/api/requests", handler.GetRequests).Methods("GET")

	// Serve the request
	router.ServeHTTP(rr, req)

	// Check status code
	if status := rr.Code; status != http.StatusOK {
		t.Errorf("Handler returned wrong status code: got %v want %v", status, http.StatusOK)
	}

	// Check response body
	var response struct {
		Requests []model.RequestLog `json:"requests"`
		Total    int                `json:"total"`
		Page     int                `json:"page"`
		Limit    int                `json:"limit"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Errorf("Failed to parse response body: %v", err)
	}

	if len(response.Requests) != 2 {
		t.Errorf("Expected 2 requests, got %d", len(response.Requests))
	}
	if response.Total != 2 {
		t.Errorf("Expected total 2, got %d", response.Total)
	}
}

func TestChatCompletionsEndpoint(t *testing.T) {
	mockStorage := &MockStorageService{}
	mockAnthropic := &MockAnthropicService{}
	handler := New(mockAnthropic, mockStorage, nil)

	// Create test request
	req, err := http.NewRequest("POST", "/v1/chat/completions", bytes.NewBufferString(`{"model":"gpt-4"}`))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	// Create response recorder
	rr := httptest.NewRecorder()

	// Call handler directly
	handler.ChatCompletions(rr, req)

	// Should return bad request since this is an Anthropic proxy
	if status := rr.Code; status != http.StatusBadRequest {
		t.Errorf("Handler returned wrong status code: got %v want %v", status, http.StatusBadRequest)
	}

	// Check error message
	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Errorf("Failed to parse response body: %v", err)
	}

	expectedError := "This is an Anthropic proxy. Please use the /v1/messages endpoint instead of /v1/chat/completions"
	if response["error"] != expectedError {
		t.Errorf("Expected error message '%s', got %v", expectedError, response["error"])
	}
}

func TestDeleteRequestsEndpoint(t *testing.T) {
	// Create mock storage
	mockStorage := &MockStorageService{
		SavedRequests: []model.RequestLog{
			{ID: "test-1"},
			{ID: "test-2"},
		},
	}
	mockAnthropic := &MockAnthropicService{}
	handler := New(mockAnthropic, mockStorage, nil)

	// Create test request
	req, err := http.NewRequest("DELETE", "/api/requests", nil)
	if err != nil {
		t.Fatal(err)
	}

	// Create response recorder
	rr := httptest.NewRecorder()

	// Create router and register handler
	router := mux.NewRouter()
	router.HandleFunc("/api/requests", handler.DeleteRequests).Methods("DELETE")

	// Serve the request
	router.ServeHTTP(rr, req)

	// Check status code
	if status := rr.Code; status != http.StatusOK {
		t.Errorf("Handler returned wrong status code: got %v want %v", status, http.StatusOK)
	}

	// Check response body
	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Errorf("Failed to parse response body: %v", err)
	}

	if response["deleted"] != float64(2) { // JSON unmarshals numbers as float64
		t.Errorf("Expected 2 deleted requests, got %v", response["deleted"])
	}
}
