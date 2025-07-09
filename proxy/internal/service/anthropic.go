package service

import (
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/seifghazi/claude-code-monitor/internal/config"
)

type AnthropicService interface {
	ForwardRequest(ctx context.Context, originalReq *http.Request) (*http.Response, error)
}

type anthropicService struct {
	client *http.Client
	config *config.AnthropicConfig
}

func NewAnthropicService(cfg *config.AnthropicConfig) AnthropicService {
	return &anthropicService{
		client: &http.Client{
			Timeout: 300 * time.Second, // Increased timeout to 5 minutes
		},
		config: cfg,
	}
}

func (s *anthropicService) ForwardRequest(ctx context.Context, originalReq *http.Request) (*http.Response, error) {
	// Clone the request to avoid modifying the original
	proxyReq := originalReq.Clone(ctx)

	// Parse the configured base URL
	baseURL, err := url.Parse(s.config.BaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse base URL '%s': %w", s.config.BaseURL, err)
	}

	if baseURL.Scheme == "" || baseURL.Host == "" {
		return nil, fmt.Errorf("invalid base URL, scheme and host are required: %s", s.config.BaseURL)
	}

	// Update the destination URL
	proxyReq.URL.Scheme = baseURL.Scheme
	proxyReq.URL.Host = baseURL.Host
	proxyReq.URL.Path = path.Join(baseURL.Path, "/v1/messages")

	// Preserve query parameters from original request
	proxyReq.URL.RawQuery = originalReq.URL.RawQuery

	// Clear fields that can't be set in client requests
	proxyReq.RequestURI = "" // This is set by the server and must be cleared
	proxyReq.Host = ""       // Let Go set this from the URL

	// Forward the request with all original headers intact
	resp, err := s.client.Do(proxyReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}

	// Handle gzip decompression
	if strings.Contains(resp.Header.Get("Content-Encoding"), "gzip") {
		decompressedResp, err := s.decompressGzipResponse(resp)
		if err != nil {
			resp.Body.Close()
			return nil, fmt.Errorf("failed to decompress gzip response: %w", err)
		}
		return decompressedResp, nil
	}

	return resp, nil
}

func (s *anthropicService) decompressGzipResponse(resp *http.Response) (*http.Response, error) {
	// Create a gzip reader
	gzipReader, err := gzip.NewReader(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to create gzip reader: %w", err)
	}

	// Read the decompressed data
	decompressedData, err := io.ReadAll(gzipReader)
	if err != nil {
		gzipReader.Close()
		return nil, fmt.Errorf("failed to read decompressed data: %w", err)
	}

	// Close the gzip reader and original body
	gzipReader.Close()
	resp.Body.Close()

	// Create a new response with decompressed body
	newResp := &http.Response{
		Status:           resp.Status,
		StatusCode:       resp.StatusCode,
		Proto:            resp.Proto,
		ProtoMajor:       resp.ProtoMajor,
		ProtoMinor:       resp.ProtoMinor,
		Header:           resp.Header.Clone(),
		ContentLength:    int64(len(decompressedData)),
		TransferEncoding: resp.TransferEncoding,
		Close:            resp.Close,
		Uncompressed:     true,
		Trailer:          resp.Trailer,
		Request:          resp.Request,
		TLS:              resp.TLS,
	}

	// Remove Content-Encoding header since we've decompressed
	newResp.Header.Del("Content-Encoding")

	// Set the decompressed body
	newResp.Body = io.NopCloser(strings.NewReader(string(decompressedData)))

	return newResp, nil
}
