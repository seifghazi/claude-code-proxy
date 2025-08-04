package provider

import (
	"context"
	"net/http"
)

// Provider is the interface that all LLM providers must implement
type Provider interface {
	// Name returns the provider name (e.g., "anthropic", "openai")
	Name() string

	// ForwardRequest forwards a request to the provider's API
	ForwardRequest(ctx context.Context, req *http.Request) (*http.Response, error)
}
