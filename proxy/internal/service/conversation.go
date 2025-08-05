package service

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type ConversationService interface {
	GetConversations() (map[string][]*Conversation, error)
	GetConversation(projectPath, sessionID string) (*Conversation, error)
	GetConversationsByProject(projectPath string) ([]*Conversation, error)
}

type conversationService struct {
	claudeProjectsPath string
}

func NewConversationService() ConversationService {
	homeDir, _ := os.UserHomeDir()
	return &conversationService{
		claudeProjectsPath: filepath.Join(homeDir, ".claude", "projects"),
	}
}

// ConversationMessage represents a single message in a Claude conversation
type ConversationMessage struct {
	ParentUUID  *string         `json:"parentUuid"`
	IsSidechain bool            `json:"isSidechain"`
	UserType    string          `json:"userType"`
	CWD         string          `json:"cwd"`
	SessionID   string          `json:"sessionId"`
	Version     string          `json:"version"`
	Type        string          `json:"type"`
	Message     json.RawMessage `json:"message"`
	UUID        string          `json:"uuid"`
	Timestamp   string          `json:"timestamp"`
	ParsedTime  time.Time       `json:"-"`
}

// Conversation represents a complete conversation session
type Conversation struct {
	SessionID    string                 `json:"sessionId"`
	ProjectPath  string                 `json:"projectPath"`
	ProjectName  string                 `json:"projectName"`
	Messages     []*ConversationMessage `json:"messages"`
	StartTime    time.Time              `json:"startTime"`
	EndTime      time.Time              `json:"endTime"`
	MessageCount int                    `json:"messageCount"`
	FileModTime  time.Time              `json:"-"` // Used for sorting, not exported
}

// GetConversations returns all conversations organized by project
func (cs *conversationService) GetConversations() (map[string][]*Conversation, error) {
	conversations := make(map[string][]*Conversation)
	var parseErrors []string

	err := filepath.Walk(cs.claudeProjectsPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			// Log but don't fail the entire walk
			parseErrors = append(parseErrors, fmt.Sprintf("Error accessing %s: %v", path, err))
			return nil
		}

		if !strings.HasSuffix(path, ".jsonl") {
			return nil
		}

		// Get the project path relative to claudeProjectsPath
		projectDir := filepath.Dir(path)
		projectRelPath, _ := filepath.Rel(cs.claudeProjectsPath, projectDir)

		// Skip files directly in the projects directory
		if projectRelPath == "." || projectRelPath == "" {
			return nil
		}

		conv, err := cs.parseConversationFile(path, projectRelPath)
		if err != nil {
			// Log parsing errors but continue processing other files
			parseErrors = append(parseErrors, fmt.Sprintf("Failed to parse %s: %v", path, err))
			return nil
		}

		if conv != nil {
			// Include conversations even if they have no messages (edge case)
			conversations[projectRelPath] = append(conversations[projectRelPath], conv)
		}

		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to walk claude projects: %w", err)
	}

	// Some parsing errors may have occurred but were handled

	// Sort conversations within each project by file modification time (newest first)
	for project := range conversations {
		sort.Slice(conversations[project], func(i, j int) bool {
			return conversations[project][i].FileModTime.After(conversations[project][j].FileModTime)
		})
	}

	return conversations, nil
}

// GetConversation returns a specific conversation by project and session ID
func (cs *conversationService) GetConversation(projectPath, sessionID string) (*Conversation, error) {
	filePath := filepath.Join(cs.claudeProjectsPath, projectPath, sessionID+".jsonl")

	conv, err := cs.parseConversationFile(filePath, projectPath)
	if err != nil {
		return nil, fmt.Errorf("failed to parse conversation: %w", err)
	}

	return conv, nil
}

// GetConversationsByProject returns all conversations for a specific project
func (cs *conversationService) GetConversationsByProject(projectPath string) ([]*Conversation, error) {
	var conversations []*Conversation
	projectDir := filepath.Join(cs.claudeProjectsPath, projectPath)

	files, err := os.ReadDir(projectDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read project directory: %w", err)
	}

	for _, file := range files {
		if !strings.HasSuffix(file.Name(), ".jsonl") {
			continue
		}

		filePath := filepath.Join(projectDir, file.Name())
		conv, err := cs.parseConversationFile(filePath, projectPath)
		if err != nil {
			continue
		}

		if conv != nil && len(conv.Messages) > 0 {
			conversations = append(conversations, conv)
		}
	}

	// Sort by file modification time (newest first)
	sort.Slice(conversations, func(i, j int) bool {
		return conversations[i].FileModTime.After(conversations[j].FileModTime)
	})

	return conversations, nil
}

// parseConversationFile reads and parses a JSONL conversation file
func (cs *conversationService) parseConversationFile(filePath, projectPath string) (*Conversation, error) {
	// Get file info for modification time
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to stat file: %w", err)
	}

	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	var messages []*ConversationMessage
	var parseErrors int
	lineNum := 0

	scanner := bufio.NewScanner(file)

	// Increase buffer size for large messages
	const maxScanTokenSize = 10 * 1024 * 1024 // 10MB
	buf := make([]byte, maxScanTokenSize)
	scanner.Buffer(buf, maxScanTokenSize)

	for scanner.Scan() {
		lineNum++
		line := scanner.Bytes()

		// Skip empty lines
		if len(line) == 0 {
			continue
		}

		var msg ConversationMessage
		if err := json.Unmarshal(line, &msg); err != nil {
			parseErrors++
			// Log only first few errors to avoid spam
			if parseErrors <= 3 {
				// Skip malformed line
			}
			continue
		}

		// Parse timestamp
		if msg.Timestamp != "" {
			parsedTime, err := time.Parse(time.RFC3339, msg.Timestamp)
			if err != nil {
				// Try alternative timestamp formats
				parsedTime, err = time.Parse(time.RFC3339Nano, msg.Timestamp)
				if err != nil {
					// Skip message with invalid timestamp
				}
			}
			msg.ParsedTime = parsedTime
		}

		messages = append(messages, &msg)
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scanner error: %w", err)
	}

	if parseErrors > 3 {
		// Some lines failed to parse but were skipped
	}

	// Return empty conversation if no messages (caller can decide what to do)
	if len(messages) == 0 {
		// Extract session ID from filename
		sessionID := filepath.Base(filePath)
		sessionID = strings.TrimSuffix(sessionID, ".jsonl")

		// Use the full project path as provided
		projectName := projectPath
		// If it looks like a file path, extract the last component
		if strings.Contains(projectPath, "-") {
			// This handles cases like "-Users-seifghazi-dev-llm-proxy"
			projectName = projectPath
		}

		return &Conversation{
			SessionID:    sessionID,
			ProjectPath:  projectPath,
			ProjectName:  projectName,
			Messages:     messages,
			StartTime:    time.Time{},
			EndTime:      time.Time{},
			MessageCount: 0,
			FileModTime:  fileInfo.ModTime(),
		}, nil
	}

	// Sort messages by timestamp
	sort.Slice(messages, func(i, j int) bool {
		return messages[i].ParsedTime.Before(messages[j].ParsedTime)
	})

	// Extract session ID from filename
	sessionID := filepath.Base(filePath)
	sessionID = strings.TrimSuffix(sessionID, ".jsonl")

	// Use the full project path as provided
	projectName := projectPath

	// Find first and last valid timestamps
	var startTime, endTime time.Time
	for _, msg := range messages {
		if !msg.ParsedTime.IsZero() {
			if startTime.IsZero() || msg.ParsedTime.Before(startTime) {
				startTime = msg.ParsedTime
			}
			if endTime.IsZero() || msg.ParsedTime.After(endTime) {
				endTime = msg.ParsedTime
			}
		}
	}

	// If no valid timestamps found, use file modification time
	if startTime.IsZero() {
		startTime = fileInfo.ModTime()
		endTime = fileInfo.ModTime()
	}

	return &Conversation{
		SessionID:    sessionID,
		ProjectPath:  projectPath,
		ProjectName:  projectName,
		Messages:     messages,
		StartTime:    startTime,
		EndTime:      endTime,
		MessageCount: len(messages),
		FileModTime:  fileInfo.ModTime(),
	}, nil
}
