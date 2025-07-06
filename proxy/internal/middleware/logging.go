package middleware

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/seifghazi/claude-code-monitor/internal/model"
)

func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		log.Printf("%s - %s %s", start.Format(time.RFC3339), r.Method, r.URL.Path)
		log.Printf("Headers: %s", formatHeaders(r.Header))

		var bodyBytes []byte
		var decompressedBytes []byte
		if r.Body != nil {
			var err error
			bodyBytes, err = io.ReadAll(r.Body)
			if err != nil {
				log.Printf("❌ Error reading request body: %v", err)
				http.Error(w, "Error reading request body", http.StatusBadRequest)
				return
			}
			r.Body.Close()
			
			// Decompress request body for logging and JSON parsing
			decompressedBytes, err = decompressRequestBody(bodyBytes, r.Header)
			if err != nil {
				log.Printf("⚠️ Warning: Failed to decompress request body: %v", err)
				// Continue with original compressed data
				decompressedBytes = bodyBytes
			}
			
			// Restore the request body with ORIGINAL (possibly compressed) data for transparent proxying
			r.Body = io.NopCloser(bytes.NewReader(bodyBytes))
		} else {
			decompressedBytes = bodyBytes // both will be nil/empty
		}

		// Store both original and decompressed bytes in context
		ctx := context.WithValue(r.Context(), model.BodyBytesKey, bodyBytes) // original for forwarding
		ctx = context.WithValue(ctx, model.DecompressedBodyKey, decompressedBytes) // decompressed for parsing
		r = r.WithContext(ctx)

		log.Printf("Body length: %d bytes (original), %d bytes (decompressed)", len(bodyBytes), len(decompressedBytes))
		if len(decompressedBytes) > 0 {
			logRequestBody(decompressedBytes) // Log the decompressed, readable data
		}
		log.Println("---")

		wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(wrapped, r)

		duration := time.Since(start)
		log.Printf("Response: %d %s (took %v)", wrapped.statusCode, http.StatusText(wrapped.statusCode), duration)
	})
}

func formatHeaders(headers http.Header) string {
	headerMap := make(map[string][]string)
	for k, v := range headers {
		headerMap[k] = sanitizeHeaderValue(k, v)
	}
	headerBytes, _ := json.MarshalIndent(headerMap, "", "  ")
	return string(headerBytes)
}

func sanitizeHeaderValue(key string, values []string) []string {
	lowerKey := strings.ToLower(key)
	sensitiveHeaders := []string{
		"x-api-key",
		"api-key",
		"authorization",
		"anthropic-api-key",
		"openai-api-key",
		"bearer",
	}

	for _, sensitive := range sensitiveHeaders {
		if strings.Contains(lowerKey, sensitive) {
			return []string{"[REDACTED]"}
		}
	}
	return values
}

func logRequestBody(bodyBytes []byte) {
	var bodyJSON interface{}
	if err := json.Unmarshal(bodyBytes, &bodyJSON); err == nil {
		bodyStr, _ := json.MarshalIndent(bodyJSON, "", "  ")
		log.Printf("Body: %s", string(bodyStr))
	} else {
		log.Printf("❌ Failed to parse body as JSON: %v", err)
		log.Printf("Raw body: %s", string(bodyBytes))
	}
}

type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// decompressRequestBody decompresses gzip request bodies for proper handling
func decompressRequestBody(data []byte, headers http.Header) ([]byte, error) {
	// Check if request is gzip-compressed
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
