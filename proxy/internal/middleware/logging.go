package middleware

import (
	"bytes"
	"context"
	"encoding/json"
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
		if r.Body != nil {
			var err error
			bodyBytes, err = io.ReadAll(r.Body)
			if err != nil {
				log.Printf("❌ Error reading request body: %v", err)
				http.Error(w, "Error reading request body", http.StatusBadRequest)
				return
			}
			r.Body.Close()
			r.Body = io.NopCloser(bytes.NewReader(bodyBytes))
		}

		ctx := context.WithValue(r.Context(), model.BodyBytesKey, bodyBytes)
		r = r.WithContext(ctx)

		log.Printf("Body length: %d bytes", len(bodyBytes))
		if len(bodyBytes) > 0 {
			logRequestBody(bodyBytes)
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
