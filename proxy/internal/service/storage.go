package service

import (
	"github.com/seifghazi/claude-code-monitor/internal/config"
	"github.com/seifghazi/claude-code-monitor/internal/model"
)

type StorageService interface {
	SaveRequest(request *model.RequestLog) (string, error)
	GetRequests(page, limit int) ([]model.RequestLog, int, error)
	ClearRequests() (int, error)
	UpdateRequestWithGrading(requestID string, grade *model.PromptGrade) error
	UpdateRequestWithResponse(request *model.RequestLog) error
	EnsureDirectoryExists() error
	GetRequestByShortID(shortID string) (*model.RequestLog, string, error)
	GetConfig() *config.StorageConfig
	GetAllRequests(modelFilter string) ([]*model.RequestLog, error)
	GetRequestsSummary(modelFilter string) ([]*model.RequestSummary, error)
	GetRequestsSummaryPaginated(modelFilter, startTime, endTime string, offset, limit int) ([]*model.RequestSummary, int, error)
	GetStats(startDate, endDate string) (*model.DashboardStats, error)
	GetHourlyStats(date string) (*model.HourlyStatsResponse, error)
	GetModelStats(date string) (*model.ModelStatsResponse, error)
}
