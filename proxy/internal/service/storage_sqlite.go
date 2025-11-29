package service

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"

	"github.com/seifghazi/claude-code-monitor/internal/config"
	"github.com/seifghazi/claude-code-monitor/internal/model"
)

type sqliteStorageService struct {
	db     *sql.DB
	config *config.StorageConfig
}

func NewSQLiteStorageService(cfg *config.StorageConfig) (StorageService, error) {
	// Add SQLite-specific connection parameters for better concurrency
	dbPath := cfg.DBPath + "?_journal_mode=WAL&_busy_timeout=5000&_synchronous=NORMAL"

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	service := &sqliteStorageService{
		db:     db,
		config: cfg,
	}

	if err := service.createTables(); err != nil {
		return nil, fmt.Errorf("failed to create tables: %w", err)
	}

	return service, nil
}

func (s *sqliteStorageService) createTables() error {
	schema := `
	CREATE TABLE IF NOT EXISTS requests (
		id TEXT PRIMARY KEY,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
		method TEXT NOT NULL,
		endpoint TEXT NOT NULL,
		headers TEXT NOT NULL,
		body TEXT NOT NULL,
		user_agent TEXT,
		content_type TEXT,
		prompt_grade TEXT,
		response TEXT,
		model TEXT,
		original_model TEXT,
		routed_model TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_timestamp ON requests(timestamp DESC);
	CREATE INDEX IF NOT EXISTS idx_endpoint ON requests(endpoint);
	CREATE INDEX IF NOT EXISTS idx_model ON requests(model);
	`

	_, err := s.db.Exec(schema)
	return err
}

func (s *sqliteStorageService) SaveRequest(request *model.RequestLog) (string, error) {
	headersJSON, err := json.Marshal(request.Headers)
	if err != nil {
		return "", fmt.Errorf("failed to marshal headers: %w", err)
	}

	bodyJSON, err := json.Marshal(request.Body)
	if err != nil {
		return "", fmt.Errorf("failed to marshal body: %w", err)
	}

	query := `
		INSERT INTO requests (id, timestamp, method, endpoint, headers, body, user_agent, content_type, model, original_model, routed_model)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	_, err = s.db.Exec(query,
		request.RequestID,
		request.Timestamp,
		request.Method,
		request.Endpoint,
		string(headersJSON),
		string(bodyJSON),
		request.UserAgent,
		request.ContentType,
		request.Model,
		request.OriginalModel,
		request.RoutedModel,
	)

	if err != nil {
		return "", fmt.Errorf("failed to insert request: %w", err)
	}

	return request.RequestID, nil
}

func (s *sqliteStorageService) GetRequests(page, limit int) ([]model.RequestLog, int, error) {
	// Get total count
	var total int
	err := s.db.QueryRow("SELECT COUNT(*) FROM requests").Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get total count: %w", err)
	}

	// Get paginated results
	offset := (page - 1) * limit
	query := `
		SELECT id, timestamp, method, endpoint, headers, body, model, user_agent, content_type, prompt_grade, response, original_model, routed_model
		FROM requests
		ORDER BY timestamp DESC
		LIMIT ? OFFSET ?
	`

	rows, err := s.db.Query(query, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query requests: %w", err)
	}
	defer rows.Close()

	var requests []model.RequestLog
	for rows.Next() {
		var req model.RequestLog
		var headersJSON, bodyJSON string
		var promptGradeJSON, responseJSON sql.NullString

		err := rows.Scan(
			&req.RequestID,
			&req.Timestamp,
			&req.Method,
			&req.Endpoint,
			&headersJSON,
			&bodyJSON,
			&req.Model,
			&req.UserAgent,
			&req.ContentType,
			&promptGradeJSON,
			&responseJSON,
			&req.OriginalModel,
			&req.RoutedModel,
		)
		if err != nil {
			// Error scanning row - skip
			continue
		}

		// Unmarshal JSON fields
		if err := json.Unmarshal([]byte(headersJSON), &req.Headers); err != nil {
			// Error unmarshaling headers
			continue
		}

		var body interface{}
		if err := json.Unmarshal([]byte(bodyJSON), &body); err != nil {
			// Error unmarshaling body
			continue
		}
		req.Body = body

		if promptGradeJSON.Valid {
			var grade model.PromptGrade
			if err := json.Unmarshal([]byte(promptGradeJSON.String), &grade); err == nil {
				req.PromptGrade = &grade
			}
		}

		if responseJSON.Valid {
			var resp model.ResponseLog
			if err := json.Unmarshal([]byte(responseJSON.String), &resp); err == nil {
				req.Response = &resp
			}
		}

		requests = append(requests, req)
	}

	return requests, total, nil
}

func (s *sqliteStorageService) ClearRequests() (int, error) {
	result, err := s.db.Exec("DELETE FROM requests")
	if err != nil {
		return 0, fmt.Errorf("failed to clear requests: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("failed to get rows affected: %w", err)
	}

	return int(rowsAffected), nil
}

func (s *sqliteStorageService) UpdateRequestWithGrading(requestID string, grade *model.PromptGrade) error {
	gradeJSON, err := json.Marshal(grade)
	if err != nil {
		return fmt.Errorf("failed to marshal grade: %w", err)
	}

	query := "UPDATE requests SET prompt_grade = ? WHERE id = ?"
	_, err = s.db.Exec(query, string(gradeJSON), requestID)
	if err != nil {
		return fmt.Errorf("failed to update request with grading: %w", err)
	}

	return nil
}

func (s *sqliteStorageService) UpdateRequestWithResponse(request *model.RequestLog) error {
	responseJSON, err := json.Marshal(request.Response)
	if err != nil {
		return fmt.Errorf("failed to marshal response: %w", err)
	}

	query := "UPDATE requests SET response = ? WHERE id = ?"
	_, err = s.db.Exec(query, string(responseJSON), request.RequestID)
	if err != nil {
		return fmt.Errorf("failed to update request with response: %w", err)
	}

	return nil
}

func (s *sqliteStorageService) EnsureDirectoryExists() error {
	// No directory needed for SQLite
	return nil
}

func (s *sqliteStorageService) GetRequestByShortID(shortID string) (*model.RequestLog, string, error) {
	query := `
		SELECT id, timestamp, method, endpoint, headers, body, model, user_agent, content_type, prompt_grade, response, original_model, routed_model
		FROM requests
		WHERE id LIKE ?
		ORDER BY timestamp DESC
		LIMIT 1
	`

	var req model.RequestLog
	var headersJSON, bodyJSON string
	var promptGradeJSON, responseJSON sql.NullString

	err := s.db.QueryRow(query, "%"+shortID).Scan(
		&req.RequestID,
		&req.Timestamp,
		&req.Method,
		&req.Endpoint,
		&headersJSON,
		&bodyJSON,
		&req.Model,
		&req.UserAgent,
		&req.ContentType,
		&promptGradeJSON,
		&responseJSON,
		&req.OriginalModel,
		&req.RoutedModel,
	)

	if err == sql.ErrNoRows {
		return nil, "", fmt.Errorf("request with ID %s not found", shortID)
	}
	if err != nil {
		return nil, "", fmt.Errorf("failed to query request: %w", err)
	}

	// Unmarshal JSON fields
	if err := json.Unmarshal([]byte(headersJSON), &req.Headers); err != nil {
		return nil, "", fmt.Errorf("failed to unmarshal headers: %w", err)
	}

	var body interface{}
	if err := json.Unmarshal([]byte(bodyJSON), &body); err != nil {
		return nil, "", fmt.Errorf("failed to unmarshal body: %w", err)
	}
	req.Body = body

	if promptGradeJSON.Valid {
		var grade model.PromptGrade
		if err := json.Unmarshal([]byte(promptGradeJSON.String), &grade); err == nil {
			req.PromptGrade = &grade
		}
	}

	if responseJSON.Valid {
		var resp model.ResponseLog
		if err := json.Unmarshal([]byte(responseJSON.String), &resp); err == nil {
			req.Response = &resp
		}
	}

	return &req, req.RequestID, nil
}

func (s *sqliteStorageService) GetConfig() *config.StorageConfig {
	return s.config
}

func (s *sqliteStorageService) GetAllRequests(modelFilter string) ([]*model.RequestLog, error) {
	query := `
		SELECT id, timestamp, method, endpoint, headers, body, model, user_agent, content_type, prompt_grade, response, original_model, routed_model
		FROM requests
	`
	args := []interface{}{}

	if modelFilter != "" && modelFilter != "all" {
		query += " WHERE LOWER(model) LIKE ?"
		args = append(args, "%"+strings.ToLower(modelFilter)+"%")

	}

	query += " ORDER BY timestamp DESC"

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query requests: %w", err)
	}
	defer rows.Close()

	var requests []*model.RequestLog
	for rows.Next() {
		var req model.RequestLog
		var headersJSON, bodyJSON string
		var promptGradeJSON, responseJSON sql.NullString

		err := rows.Scan(
			&req.RequestID,
			&req.Timestamp,
			&req.Method,
			&req.Endpoint,
			&headersJSON,
			&bodyJSON,
			&req.Model,
			&req.UserAgent,
			&req.ContentType,
			&promptGradeJSON,
			&responseJSON,
			&req.OriginalModel,
			&req.RoutedModel,
		)
		if err != nil {
			continue
		}

		if err := json.Unmarshal([]byte(headersJSON), &req.Headers); err != nil {
			continue
		}

		var body interface{}
		if err := json.Unmarshal([]byte(bodyJSON), &body); err != nil {
			continue
		}
		req.Body = body

		if promptGradeJSON.Valid {
			var grade model.PromptGrade
			if err := json.Unmarshal([]byte(promptGradeJSON.String), &grade); err == nil {
				req.PromptGrade = &grade
			}
		}

		if responseJSON.Valid {
			var resp model.ResponseLog
			if err := json.Unmarshal([]byte(responseJSON.String), &resp); err == nil {
				req.Response = &resp
			}
		}

		requests = append(requests, &req)
	}

	return requests, nil
}

// GetRequestsSummary returns minimal data for list view - no body/headers, only usage from response
func (s *sqliteStorageService) GetRequestsSummary(modelFilter string) ([]*model.RequestSummary, error) {
	query := `
		SELECT id, timestamp, method, endpoint, model, original_model, routed_model, response
		FROM requests
	`
	args := []interface{}{}

	if modelFilter != "" && modelFilter != "all" {
		query += " WHERE LOWER(model) LIKE ?"
		args = append(args, "%"+strings.ToLower(modelFilter)+"%")
	}

	query += " ORDER BY timestamp DESC"

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query requests: %w", err)
	}
	defer rows.Close()

	var summaries []*model.RequestSummary
	for rows.Next() {
		var s model.RequestSummary
		var responseJSON sql.NullString

		err := rows.Scan(
			&s.RequestID,
			&s.Timestamp,
			&s.Method,
			&s.Endpoint,
			&s.Model,
			&s.OriginalModel,
			&s.RoutedModel,
			&responseJSON,
		)
		if err != nil {
			continue
		}

		// Only parse response to extract usage and status
		if responseJSON.Valid {
			var resp model.ResponseLog
			if err := json.Unmarshal([]byte(responseJSON.String), &resp); err == nil {
				s.StatusCode = resp.StatusCode
				s.ResponseTime = resp.ResponseTime

				// Extract usage from response body
				if resp.Body != nil {
					var respBody struct {
						Usage *model.AnthropicUsage `json:"usage"`
					}
					if err := json.Unmarshal(resp.Body, &respBody); err == nil && respBody.Usage != nil {
						s.Usage = respBody.Usage
					}
				}
			}
		}

		summaries = append(summaries, &s)
	}

	return summaries, nil
}

// GetRequestsSummaryPaginated returns minimal data for list view with pagination - super fast!
func (s *sqliteStorageService) GetRequestsSummaryPaginated(modelFilter, startTime, endTime string, offset, limit int) ([]*model.RequestSummary, int, error) {
	// First get total count
	countQuery := "SELECT COUNT(*) FROM requests"
	countArgs := []interface{}{}
	whereClauses := []string{}

	if modelFilter != "" && modelFilter != "all" {
		whereClauses = append(whereClauses, "LOWER(model) LIKE ?")
		countArgs = append(countArgs, "%"+strings.ToLower(modelFilter)+"%")
	}

	if startTime != "" && endTime != "" {
		whereClauses = append(whereClauses, "timestamp >= ? AND timestamp <= ?")
		countArgs = append(countArgs, startTime, endTime)
	}

	if len(whereClauses) > 0 {
		countQuery += " WHERE " + strings.Join(whereClauses, " AND ")
	}

	var total int
	if err := s.db.QueryRow(countQuery, countArgs...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to get total count: %w", err)
	}

	// Then get the requested page
	query := `
		SELECT id, timestamp, method, endpoint, model, original_model, routed_model, response
		FROM requests
	`
	args := []interface{}{}
	queryWhereClauses := []string{}

	if modelFilter != "" && modelFilter != "all" {
		queryWhereClauses = append(queryWhereClauses, "LOWER(model) LIKE ?")
		args = append(args, "%"+strings.ToLower(modelFilter)+"%")
	}

	if startTime != "" && endTime != "" {
		queryWhereClauses = append(queryWhereClauses, "timestamp >= ? AND timestamp <= ?")
		args = append(args, startTime, endTime)
	}

	if len(queryWhereClauses) > 0 {
		query += " WHERE " + strings.Join(queryWhereClauses, " AND ")
	}

	query += " ORDER BY timestamp DESC"

	// Only add LIMIT if specified (0 means no limit)
	if limit > 0 {
		query += " LIMIT ? OFFSET ?"
		args = append(args, limit, offset)
	} else if offset > 0 {
		query += " OFFSET ?"
		args = append(args, offset)
	}

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query requests: %w", err)
	}
	defer rows.Close()

	var summaries []*model.RequestSummary
	for rows.Next() {
		var s model.RequestSummary
		var responseJSON sql.NullString

		err := rows.Scan(
			&s.RequestID,
			&s.Timestamp,
			&s.Method,
			&s.Endpoint,
			&s.Model,
			&s.OriginalModel,
			&s.RoutedModel,
			&responseJSON,
		)
		if err != nil {
			continue
		}

		// Only parse response to extract usage and status
		if responseJSON.Valid {
			var resp model.ResponseLog
			if err := json.Unmarshal([]byte(responseJSON.String), &resp); err == nil {
				s.StatusCode = resp.StatusCode
				s.ResponseTime = resp.ResponseTime

				// Extract usage from response body
				if resp.Body != nil {
					var respBody struct {
						Usage *model.AnthropicUsage `json:"usage"`
					}
					if err := json.Unmarshal(resp.Body, &respBody); err == nil && respBody.Usage != nil {
						s.Usage = respBody.Usage
					}
				}
			}
		}

		summaries = append(summaries, &s)
	}

	log.Printf("📊 GetRequestsSummaryPaginated: returned %d requests (total: %d, limit: %d, offset: %d)", len(summaries), total, limit, offset)
	return summaries, total, nil
}

// GetStats returns aggregated statistics for the dashboard - lightning fast!
func (s *sqliteStorageService) GetStats(startDate, endDate string) (*model.DashboardStats, error) {
	stats := &model.DashboardStats{
		DailyStats:  make([]model.DailyTokens, 0),
		HourlyStats: make([]model.HourlyTokens, 0),
		ModelStats:  make([]model.ModelTokens, 0),
	}

	// Query each request individually to process all responses
	query := `
		SELECT timestamp, COALESCE(model, 'unknown') as model, response
		FROM requests
		WHERE timestamp >= ? AND timestamp < ?
		ORDER BY timestamp
	`

	rows, err := s.db.Query(query, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("failed to query stats: %w", err)
	}
	defer rows.Close()

	// Aggregate data in memory
	dailyMap := make(map[string]*model.DailyTokens)
	hourlyMap := make(map[int]*model.HourlyTokens)
	modelMap := make(map[string]*model.ModelTokens)

	// Derive the selected date from endDate (endDate is selectedDate + 1 day)
	selectedDateTime, err := time.Parse("2006-01-02T15:04:05", endDate)
	if err != nil {
		selectedDateTime, _ = time.Parse(time.RFC3339, endDate)
	}
	selectedDate := selectedDateTime.AddDate(0, 0, -1).Format("2006-01-02")

	var totalResponseTime int64
	var responseCount int

	for rows.Next() {
		var timestamp, modelName, responseJSON string

		if err := rows.Scan(&timestamp, &modelName, &responseJSON); err != nil {
			continue
		}

		// Extract date and hour from timestamp (format: 2025-11-28T13:03:29-08:00)
		date := strings.Split(timestamp, "T")[0]
		hour := 0
		if t, err := time.Parse(time.RFC3339, timestamp); err == nil {
			hour = t.Hour()
		}

		// Parse response to get usage and response time
		var resp model.ResponseLog
		if err := json.Unmarshal([]byte(responseJSON), &resp); err != nil {
			continue
		}

		var usage *model.AnthropicUsage
		if resp.Body != nil {
			var respBody struct {
				Usage *model.AnthropicUsage `json:"usage"`
			}
			if err := json.Unmarshal(resp.Body, &respBody); err == nil {
				usage = respBody.Usage
			}
		}

		tokens := int64(0)
		if usage != nil {
			tokens = int64(usage.InputTokens + usage.OutputTokens + usage.CacheReadInputTokens)
		}

		// Daily aggregation
		if daily, ok := dailyMap[date]; ok {
			daily.Tokens += tokens
			daily.Requests++
			// Update per-model stats
			if daily.Models == nil {
				daily.Models = make(map[string]model.ModelStats)
			}
			if modelStat, ok := daily.Models[modelName]; ok {
				modelStat.Tokens += tokens
				modelStat.Requests++
				daily.Models[modelName] = modelStat
			} else {
				daily.Models[modelName] = model.ModelStats{
					Tokens:   tokens,
					Requests: 1,
				}
			}
		} else {
			dailyMap[date] = &model.DailyTokens{
				Date:     date,
				Tokens:   tokens,
				Requests: 1,
				Models: map[string]model.ModelStats{
					modelName: {
						Tokens:   tokens,
						Requests: 1,
					},
				},
			}
		}

		// Hourly aggregation (for the selected date)
		if date == selectedDate {
			if hourly, ok := hourlyMap[hour]; ok {
				hourly.Tokens += tokens
				hourly.Requests++
				// Update per-model stats
				if hourly.Models == nil {
					hourly.Models = make(map[string]model.ModelStats)
				}
				if modelStat, ok := hourly.Models[modelName]; ok {
					modelStat.Tokens += tokens
					modelStat.Requests++
					hourly.Models[modelName] = modelStat
				} else {
					hourly.Models[modelName] = model.ModelStats{
						Tokens:   tokens,
						Requests: 1,
					}
				}
			} else {
				hourlyMap[hour] = &model.HourlyTokens{
					Hour:     hour,
					Tokens:   tokens,
					Requests: 1,
					Models: map[string]model.ModelStats{
						modelName: {
							Tokens:   tokens,
							Requests: 1,
						},
					},
				}
			}

			// Track response time for today
			if resp.ResponseTime > 0 {
				totalResponseTime += resp.ResponseTime
				responseCount++
			}
		}

		// Model aggregation
		if modelStat, ok := modelMap[modelName]; ok {
			modelStat.Tokens += tokens
			modelStat.Requests++
		} else {
			modelMap[modelName] = &model.ModelTokens{
				Model:    modelName,
				Tokens:   tokens,
				Requests: 1,
			}
		}
	}

	// Convert maps to slices
	for _, v := range dailyMap {
		stats.DailyStats = append(stats.DailyStats, *v)
	}
	for _, v := range hourlyMap {
		stats.HourlyStats = append(stats.HourlyStats, *v)
	}
	for _, v := range modelMap {
		stats.ModelStats = append(stats.ModelStats, *v)
	}

	// Calculate totals for the selected date
	if selectedDay, ok := dailyMap[selectedDate]; ok {
		stats.TodayTokens = selectedDay.Tokens
		stats.TodayRequests = selectedDay.Requests
	}
	if responseCount > 0 {
		stats.AvgResponseTime = totalResponseTime / int64(responseCount)
	}

	return stats, nil
}

func (s *sqliteStorageService) Close() error {
	return s.db.Close()
}
