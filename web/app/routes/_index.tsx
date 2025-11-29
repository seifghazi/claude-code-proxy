import type { MetaFunction } from "@remix-run/node";
import { useState, useEffect, useTransition, useCallback, useRef } from "react";
import {
  Activity,
  RefreshCw,
  Trash2,
  List,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Inbox,
  Wrench,
  Bot,
  User,
  Settings,
  Zap,
  Users,
  Target,
  Cpu,
  MessageCircle,
  Brain,
  CheckCircle,
  ClipboardCheck,
  BarChart3,
  MessageSquare,
  Sparkles,
  Copy,
  Check,
  Lightbulb,
  Loader2,
  ArrowLeftRight,
  GitCompare,
  Square,
  CheckSquare
} from "lucide-react";

import RequestDetailContent from "../components/RequestDetailContent";
import { ConversationThread } from "../components/ConversationThread";
import { RequestCompareModal } from "../components/RequestCompareModal";
import { UsageDashboard } from "../components/UsageDashboard";
import { getChatCompletionsEndpoint } from "../utils/models";

export const meta: MetaFunction = () => {
  return [
    { title: "Claude Code Monitor" },
    { name: "description", content: "Claude Code Monitor - Real-time API request visualization" },
  ];
};

// Lightweight summary for list view (fast loading)
interface RequestSummary {
  id: string;
  requestId: string;
  timestamp: string;
  method: string;
  endpoint: string;
  model?: string;
  originalModel?: string;
  routedModel?: string;
  statusCode?: number;
  responseTime?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

// Full request details (loaded on demand)
interface Request {
  id: number;
  requestId?: string;
  conversationId?: string;
  turnNumber?: number;
  isRoot?: boolean;
  timestamp: string;
  method: string;
  endpoint: string;
  headers: Record<string, string[]>;
  originalModel?: string;
  routedModel?: string;
  body?: {
    model?: string;
    messages?: Array<{
      role: string;
      content: any;
    }>;
    system?: Array<{
      text: string;
      type: string;
      cache_control?: { type: string };
    }>;
    tools?: Array<{
      name: string;
      description: string;
      input_schema?: {
        type: string;
        properties?: Record<string, any>;
        required?: string[];
      };
    }>;
    max_tokens?: number;
    temperature?: number;
    stream?: boolean;
  };
  response?: {
    statusCode: number;
    headers: Record<string, string[]>;
    body?: {
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
        service_tier?: string;
      };
      [key: string]: any;
    };
    bodyText?: string;
    responseTime: number;
    streamingChunks?: string[];
    isStreaming: boolean;
    completedAt: string;
  };
  promptGrade?: {
    score: number;
    criteria: Record<string, { score: number; feedback: string }>;
    feedback: string;
    improvedPrompt: string;
    gradingTimestamp: string;
  };
}

interface ConversationSummary {
  id: string;
  requestCount: number;
  startTime: string;
  lastActivity: string;
  duration: number;
  firstMessage: string;
  lastMessage: string;
  projectName: string;
}

interface Conversation {
  sessionId: string;
  projectPath: string;
  projectName: string;
  messages: Array<{
    parentUuid: string | null;
    isSidechain: boolean;
    userType: string;
    cwd: string;
    sessionId: string;
    version: string;
    type: 'user' | 'assistant';
    message: any;
    uuid: string;
    timestamp: string;
  }>;
  startTime: string;
  endTime: string;
  messageCount: number;
}

interface DashboardStats {
  dailyStats: { date: string; tokens: number; requests: number; }[];
  hourlyStats: { hour: number; tokens: number; requests: number; }[];
  modelStats: { model: string; tokens: number; requests: number; }[];
  todayTokens: number;
  todayRequests: number;
  avgResponseTime: number;
}

export default function Index() {
  const [requestSummaries, setRequestSummaries] = useState<RequestSummary[]>([]);
  const [requestDetailsCache, setRequestDetailsCache] = useState<Map<string, Request>>(new Map());
  const [fullRequestsLoaded, setFullRequestsLoaded] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [filter, setFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"requests" | "conversations">("requests");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConversationModalOpen, setIsConversationModalOpen] = useState(false);
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [isFetching, setIsFetching] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [requestsCurrentPage, setRequestsCurrentPage] = useState(1);
  const [hasMoreRequests, setHasMoreRequests] = useState(true);
  const [conversationsCurrentPage, setConversationsCurrentPage] = useState(1);
  const [hasMoreConversations, setHasMoreConversations] = useState(true);
  const itemsPerPage = 50;

  // Compare mode state
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<Request[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);

  // Load dashboard stats (lightning fast!)
  const loadStats = async (date?: Date) => {
    setIsLoadingStats(true);
    try {
      const targetDate = date || selectedDate;

      // For stats, we need 7 days of data (target date - 6 days through target date)
      const startDay = new Date(targetDate);
      startDay.setDate(startDay.getDate() - 6);
      startDay.setHours(0, 0, 0, 0);

      const endDay = new Date(targetDate);
      endDay.setHours(23, 59, 59, 999);

      const url = new URL('/api/stats', window.location.origin);
      url.searchParams.append('start', startDay.toISOString());
      url.searchParams.append('end', endDay.toISOString());

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  // Load lightweight summaries for the list view (fast initial load)
  const loadRequests = async (filter?: string, date?: Date) => {
    setIsFetching(true);
    setFullRequestsLoaded(false);
    setRequestDetailsCache(new Map());
    try {
      const currentModelFilter = filter || modelFilter;
      const targetDate = date || selectedDate;

      // Get start and end of day in user's local timezone, then convert to UTC
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Use summary endpoint - much faster, minimal data
      const url = new URL('/api/requests/summary', window.location.origin);
      if (currentModelFilter !== "all") {
        url.searchParams.append("model", currentModelFilter);
      }
      url.searchParams.append("start", startOfDay.toISOString());
      url.searchParams.append("end", endOfDay.toISOString());

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const requests = data.requests || [];
      const mappedRequests = requests.map((req: any, index: number) => ({
        ...req,
        id: req.requestId || `request_${index}`
      }));

      console.log(`Loaded ${mappedRequests.length} requests (total: ${data.total})`);

      startTransition(() => {
        setRequestSummaries(mappedRequests);
      });
    } catch (error) {
      console.error('Failed to load requests:', error);
      startTransition(() => {
        setRequestSummaries([]);
      });
    } finally {
      setIsFetching(false);
    }
  };

  // Get full request details from cache or fetch on demand
  const getRequestDetails = async (requestId: string): Promise<Request | null> => {
    // Check cache first
    if (requestDetailsCache.has(requestId)) {
      return requestDetailsCache.get(requestId) || null;
    }

    // Fetch single request by ID
    try {
      const response = await fetch(`/api/requests/${requestId}`);
      if (!response.ok) return null;

      const data = await response.json();
      const request = data.request ? { ...data.request, id: data.request.requestId } : null;

      // Cache it
      if (request) {
        setRequestDetailsCache(prev => new Map(prev).set(requestId, request));
      }

      return request;
    } catch (error) {
      console.error('Failed to load request details:', error);
      return null;
    }
  };

  const loadConversations = async (modelFilter: string = "all", loadMore = false) => {
    setIsFetching(true);
    const pageToFetch = loadMore ? conversationsCurrentPage + 1 : 1;
    try {
      const url = new URL('/api/conversations', window.location.origin);
      url.searchParams.append("page", pageToFetch.toString());
      url.searchParams.append("limit", itemsPerPage.toString());
      if (modelFilter !== "all") {
        url.searchParams.append("model", modelFilter);
      }
      
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      startTransition(() => {
        if (loadMore) {
          setConversations(prev => [...prev, ...data.conversations]);
        } else {
          setConversations(data.conversations);
        }
        setConversationsCurrentPage(pageToFetch);
        setHasMoreConversations(data.conversations.length === itemsPerPage);
      });
    } catch (error) {
      console.error('Failed to load conversations:', error);
      startTransition(() => {
        setConversations([]);
      });
    } finally {
      setIsFetching(false);
    }
  };

  const loadConversationDetails = async (conversationId: string, projectName: string) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}?project=${encodeURIComponent(projectName)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const conversation = await response.json();
      setSelectedConversation(conversation);
      setIsConversationModalOpen(true);
    } catch (error) {
      console.error('Failed to load conversation details:', error);
    }
  };

  const clearRequests = async () => {
    try {
      const response = await fetch('/api/requests', {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setRequestSummaries([]);
        setRequestDetailsCache(new Map());
        setConversations([]);
        setRequestsCurrentPage(1);
        setHasMoreRequests(true);
        setConversationsCurrentPage(1);
        setHasMoreConversations(true);
      }
    } catch (error) {
      console.error('Failed to clear requests:', error);
      setRequestSummaries([]);
      setRequestDetailsCache(new Map());
    }
  };

  const filterRequests = (filter: string) => {
    if (filter === 'all') return requestSummaries;

    return requestSummaries.filter(req => {
      switch (filter) {
        case 'messages':
          return req.endpoint.includes('/messages');
        case 'completions':
          return req.endpoint.includes('/completions');
        case 'models':
          return req.endpoint.includes('/models');
        default:
          return true;
      }
    });
  };

  const getMethodColor = (method: string) => {
    const colors = {
      'GET': 'bg-green-50 text-green-700 border border-green-200',
      'POST': 'bg-blue-50 text-blue-700 border border-blue-200',
      'PUT': 'bg-yellow-50 text-yellow-700 border border-yellow-200',
      'DELETE': 'bg-red-50 text-red-700 border border-red-200'
    };
    return colors[method as keyof typeof colors] || 'bg-gray-50 text-gray-700 border border-gray-200';
  };

  const getRequestSummary = (request: Request) => {
    const parts = [];
    
    // Add token usage if available
    if (request.response?.body?.usage) {
      const usage = request.response.body.usage;
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      const totalTokens = inputTokens + outputTokens;
      
      if (totalTokens > 0) {
        parts.push(`🪙 ${totalTokens.toLocaleString()} tokens`);
        
        if (usage.cache_read_input_tokens) {
          parts.push(`💾 ${usage.cache_read_input_tokens.toLocaleString()} cached`);
        }
      }
    }
    
    // Add response time if available
    if (request.response?.responseTime) {
      const seconds = (request.response.responseTime / 1000).toFixed(1);
      parts.push(`⏱️ ${seconds}s`);
    }
    
    // Add model if available (use routed model if different from original)
    const model = request.routedModel || request.body?.model;
    if (model) {
      const modelShort = model.includes('opus') ? 'Opus' :
                         model.includes('sonnet') ? 'Sonnet' :
                         model.includes('haiku') ? 'Haiku' : 
                         model.includes('gpt-4o') ? 'gpt-4o' :
                         model.includes('o3') ? 'o3' :
                         model.includes('o3-mini') ? 'o3-mini' : 'Model';
      parts.push(`🤖 ${modelShort}`);
      
      // Show routing info if model was routed
      if (request.routedModel && request.originalModel && request.routedModel !== request.originalModel) {
        parts.push(`→ routed`);
      }
    }
    
    return parts.length > 0 ? parts.join(' • ') : '📡 API request';
  };

  const showRequestDetails = async (requestId: string) => {
    const request = await getRequestDetails(requestId);
    if (request) {
      setSelectedRequest(request);
      setIsModalOpen(true);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedRequest(null);
  };

  // Compare mode functions
  const toggleCompareMode = () => {
    setCompareMode(!compareMode);
    setSelectedForCompare([]);
  };

  const toggleRequestSelection = async (summary: RequestSummary) => {
    // Get full request details for compare
    const request = await getRequestDetails(summary.requestId);
    if (!request) return;

    setSelectedForCompare(prev => {
      const isSelected = prev.some(r => r.requestId === request.requestId);
      if (isSelected) {
        return prev.filter(r => r.requestId !== request.requestId);
      } else if (prev.length < 2) {
        return [...prev, request];
      }
      return prev;
    });
  };

  const isRequestSelected = (summary: RequestSummary) => {
    return selectedForCompare.some(r => r.requestId === summary.requestId);
  };

  const openCompareModal = () => {
    if (selectedForCompare.length === 2) {
      setIsCompareModalOpen(true);
    }
  };

  const closeCompareModal = () => {
    setIsCompareModalOpen(false);
  };

  const formatDuration = (milliseconds: number) => {
    if (milliseconds < 60000) {
      return `${Math.round(milliseconds / 1000)}s`;
    } else if (milliseconds < 3600000) {
      return `${Math.round(milliseconds / 60000)}m`;
    } else {
      return `${Math.round(milliseconds / 3600000)}h`;
    }
  };

  const handleModelFilterChange = (newFilter: string) => {
    setModelFilter(newFilter);
    // Only reload requests list, not stats (stats always show all models)
    loadRequests(newFilter, selectedDate);
  };

  const handleDateChange = (newDate: Date) => {
    setSelectedDate(newDate);
    loadStats(newDate);
    if (viewMode === 'requests') {
      loadRequests(modelFilter, newDate);
    }
  };

  useEffect(() => {
    // Load stats first (super fast!) - always show all models
    loadStats();

    if (viewMode === 'requests') {
      loadRequests(modelFilter);
    } else {
      // Conversations don't use model filter
      loadConversations("all");
    }
  }, [viewMode]);

  // Handle escape key to close modals
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isCompareModalOpen) {
          closeCompareModal();
        } else if (isModalOpen) {
          closeModal();
        } else if (isConversationModalOpen) {
          setIsConversationModalOpen(false);
          setSelectedConversation(null);
        } else if (compareMode) {
          toggleCompareMode();
        }
      }
    };

    window.addEventListener('keydown', handleEscapeKey);

    return () => {
      window.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isModalOpen, isConversationModalOpen, isCompareModalOpen, compareMode]);

  const filteredRequests = filterRequests(filter);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <h1 className="text-lg font-semibold text-gray-900">Claude Code Monitor</h1>
            </div>
            <div className="flex items-center space-x-2">
              {viewMode === "requests" && (
                <button
                  onClick={toggleCompareMode}
                  className={`px-2.5 py-1.5 rounded transition-colors flex items-center space-x-1.5 text-xs font-medium ${
                    compareMode
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  <span>{compareMode ? "Exit Compare" : "Compare"}</span>
                </button>
              )}
              <button
                onClick={() => loadRequests()}
                className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={clearRequests}
                className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                title="Clear all requests"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* View mode toggle */}
      <div className="mb-4 flex justify-center">
        <div className="inline-flex items-center bg-gray-100 rounded p-0.5">
          <button
            onClick={() => setViewMode("requests")}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              viewMode === "requests"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Requests
          </button>
          <button
            onClick={() => setViewMode("conversations")}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              viewMode === "conversations"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Conversations
          </button>
        </div>
      </div>

      {/* Compare mode banner - sticky below header */}
      {compareMode && viewMode === "requests" && (
        <div className="sticky top-[57px] z-30 bg-gray-50 px-6 py-2 border-b border-gray-200">
          <div className="max-w-7xl mx-auto bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <GitCompare className="w-5 h-5 text-blue-600" />
                <div>
                  <span className="text-sm font-medium text-blue-900">
                    Compare Mode
                  </span>
                  <span className="text-sm text-blue-700 ml-2">
                    Select 2 requests to compare ({selectedForCompare.length}/2 selected)
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {selectedForCompare.length === 2 && (
                  <button
                    onClick={openCompareModal}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    Compare Selected
                  </button>
                )}
                <button
                  onClick={toggleCompareMode}
                  className="px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {viewMode === "requests" && (
          <div className="space-y-8">
            {/* Date Navigation - Always Visible */}
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-gray-900">Request History</h2>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => {
                    const newDate = new Date(selectedDate);
                    newDate.setDate(newDate.getDate() - 1);
                    handleDateChange(newDate);
                  }}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-600" />
                </button>
                <span className="text-sm font-medium text-gray-700 min-w-[80px] text-center">
                  {selectedDate.toDateString() === new Date().toDateString()
                    ? 'Today'
                    : selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <button
                  onClick={() => {
                    const newDate = new Date(selectedDate);
                    newDate.setDate(newDate.getDate() + 1);
                    // Normalize to midnight for comparison
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    newDate.setHours(0, 0, 0, 0);
                    if (newDate <= today) {
                      handleDateChange(newDate);
                    }
                  }}
                  disabled={(() => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const selected = new Date(selectedDate);
                    selected.setHours(0, 0, 0, 0);
                    return selected.getTime() >= today.getTime();
                  })()}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Loading State - Only for initial stats load */}
            {isLoadingStats ? (
              <div className="bg-white border border-gray-200 rounded-lg p-12 flex items-center justify-center">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 mx-auto animate-spin text-gray-400" />
                  <p className="mt-3 text-sm text-gray-500">Loading...</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Stats Dashboard */}
                {stats && <UsageDashboard stats={stats} selectedDate={selectedDate} />}

                {/* Request List */}
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Requests</h3>
                      <div className="inline-flex items-center bg-white rounded p-0.5 space-x-0.5 border border-gray-200">
                        <button
                          onClick={() => handleModelFilterChange("all")}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-all duration-200 ${
                            modelFilter === "all"
                              ? "bg-gray-100 text-gray-900"
                              : "bg-transparent text-gray-600 hover:text-gray-900"
                          }`}
                        >
                          All Models
                        </button>
                        <button
                          onClick={() => handleModelFilterChange("opus")}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-all duration-200 flex items-center space-x-1 ${
                            modelFilter === "opus"
                              ? "bg-purple-50 text-purple-700"
                              : "bg-transparent text-gray-600 hover:text-gray-900"
                          }`}
                        >
                          <Brain className="w-3 h-3" />
                          <span>Opus</span>
                        </button>
                        <button
                          onClick={() => handleModelFilterChange("sonnet")}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-all duration-200 flex items-center space-x-1 ${
                            modelFilter === "sonnet"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-transparent text-gray-600 hover:text-gray-900"
                          }`}
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Sonnet</span>
                        </button>
                        <button
                          onClick={() => handleModelFilterChange("haiku")}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-all duration-200 flex items-center space-x-1 ${
                            modelFilter === "haiku"
                              ? "bg-green-50 text-green-700"
                              : "bg-transparent text-gray-600 hover:text-gray-900"
                          }`}
                        >
                          <Zap className="w-3 h-3" />
                          <span>Haiku</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div>
                    {isFetching ? (
                      <div className="p-8 text-center">
                        <Loader2 className="w-6 h-6 mx-auto animate-spin text-gray-400" />
                        <p className="mt-2 text-xs text-gray-500">Loading requests...</p>
                      </div>
                    ) : filteredRequests.length === 0 ? (
                      <div className="p-8 text-center text-gray-500">
                        <h3 className="text-sm font-medium text-gray-600 mb-1">No requests found</h3>
                        <p className="text-xs text-gray-500">No requests for this date</p>
                      </div>
                    ) : (
                      <div>
                        {filteredRequests.map((summary) => (
                          <div
                            key={summary.requestId}
                            className="px-4 py-4 hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-100 last:border-b-0"
                            onClick={() => loadRequestDetails(summary.requestId)}
                          >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1 min-w-0 mr-4">
                                      <div className="flex items-center space-x-3 mb-1">
                                        <span
                                          className={`font-mono text-sm font-semibold ${
                                            summary.model.toLowerCase().includes('opus')
                                              ? 'text-purple-600'
                                              : summary.model.toLowerCase().includes('sonnet')
                                              ? 'text-blue-600'
                                              : 'text-green-600'
                                          }`}
                                        >
                                          {summary.model.toLowerCase().includes('opus')
                                            ? 'Opus'
                                            : summary.model.toLowerCase().includes('sonnet')
                                            ? 'Sonnet'
                                            : 'Haiku'}
                                        </span>
                                        {summary.statusCode && (
                                          <span className="text-xs font-mono">
                                            {summary.statusCode === 200 && '200'}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-sm text-gray-600 font-mono truncate mb-2">
                                        {summary.endpoint}
                                      </div>
                                      <div className="flex items-center space-x-3 text-xs">
                                        {summary.usage && (
                                          <>
                                            {(summary.usage.input_tokens || summary.usage.cache_read_input_tokens) && (
                                              <span className="font-mono text-gray-600">
                                                <span className="font-medium text-gray-900">
                                                  {(summary.usage.input_tokens || 0).toLocaleString()}
                                                </span>{' '}
                                                in
                                              </span>
                                            )}
                                            {summary.usage.output_tokens && (
                                              <span className="font-mono text-gray-600">
                                                <span className="font-medium text-gray-900">
                                                  {summary.usage.output_tokens.toLocaleString()}
                                                </span>{' '}
                                                out
                                              </span>
                                            )}
                                            {summary.usage.cache_read_input_tokens && (
                                              <span className="font-mono bg-green-50 text-green-700 px-1.5 py-0.5 rounded">
                                                {Math.round(((summary.usage.cache_read_input_tokens || 0) / ((summary.usage.input_tokens || 0) + (summary.usage.cache_read_input_tokens || 0))) * 100)}% cached
                                              </span>
                                            )}
                                          </>
                                        )}
                                        {summary.responseTime && (
                                          <span className="font-mono text-gray-600">
                                            <span className="font-medium text-gray-900">{(summary.responseTime / 1000).toFixed(2)}</span>s
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex-shrink-0 text-right">
                                      <div className="text-xs text-gray-500">
                                        {new Date(summary.timestamp).toLocaleDateString()}
                                      </div>
                                      <div className="text-xs text-gray-400">
                                        {new Date(summary.timestamp).toLocaleTimeString()}
                                      </div>
                                    </div>
                                  </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === "conversations" && (
          <>
            <div className="mb-6">
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Conversations
                    </p>
                    <p className="text-2xl font-semibold text-gray-900 mt-1">
                      {conversations.length}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Conversations View */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Conversations</h2>
              </div>
              <div className="divide-y divide-gray-200">
                {(isFetching && conversationsCurrentPage === 1) || isPending ? (
                  <div className="p-8 text-center">
                    <Loader2 className="w-6 h-6 mx-auto animate-spin text-gray-400" />
                    <p className="mt-2 text-xs text-gray-500">Loading conversations...</p>
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <h3 className="text-sm font-medium text-gray-600 mb-1">No conversations found</h3>
                    <p className="text-xs text-gray-500">Start a conversation to see it appear here</p>
                  </div>
                ) : (
                  <>
                    {conversations.map(conversation => (
                      <div key={conversation.id} className="px-4 py-4 hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-100 last:border-b-0" onClick={() => loadConversationDetails(conversation.id, conversation.projectName)}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0 mr-4">
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="text-sm font-semibold text-gray-900 font-mono">
                                #{conversation.id.slice(-8)}
                              </span>
                              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
                                {conversation.requestCount} turns
                              </span>
                              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full">
                                {formatDuration(conversation.duration)}
                              </span>
                              {conversation.projectName && (
                                <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">
                                  {conversation.projectName}
                                </span>
                              )}
                            </div>
                            <div className="space-y-2">
                              <div className="bg-gray-50 rounded p-2 border border-gray-200">
                                <div className="text-xs font-medium text-gray-600 mb-0.5">First Message</div>
                                <div className="text-xs text-gray-700 line-clamp-2">
                                  {conversation.firstMessage || "No content"}
                                </div>
                              </div>
                              {conversation.lastMessage && conversation.lastMessage !== conversation.firstMessage && (
                                <div className="bg-blue-50 rounded p-2 border border-blue-200">
                                  <div className="text-xs font-medium text-blue-600 mb-0.5">Latest Message</div>
                                  <div className="text-xs text-gray-700 line-clamp-2">
                                    {conversation.lastMessage}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <div className="text-xs text-gray-500">
                              {new Date(conversation.startTime).toLocaleDateString()}
                            </div>
                            <div className="text-xs text-gray-400">
                              {new Date(conversation.startTime).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {hasMoreConversations && (
                      <div className="p-3 text-center border-t border-gray-100">
                        <button
                          onClick={() => loadConversations(modelFilter, true)}
                          disabled={isFetching}
                          className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 transition-colors"
                        >
                          {isFetching ? "Loading..." : "Load More"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Request Detail Modal */}
      {isModalOpen && selectedRequest && (
        <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Request Details</h3>
                </div>
                <button 
                  onClick={closeModal}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
              <RequestDetailContent request={selectedRequest} />
            </div>
          </div>
        </div>
      )}

      {/* Conversation Detail Modal */}
      {isConversationModalOpen && selectedConversation && (
        <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <MessageCircle className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Conversation {selectedConversation.sessionId.slice(-8)}
                  </h3>
                  <span className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-1 rounded-full">
                    {selectedConversation.messageCount} messages
                  </span>
                </div>
                <button 
                  onClick={() => setIsConversationModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
              <div className="space-y-6">
                {/* Conversation Overview */}
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{selectedConversation.messageCount}</div>
                      <div className="text-sm text-gray-600">Messages</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-medium text-gray-700">{new Date(selectedConversation.startTime).toLocaleDateString()}</div>
                      <div className="text-sm text-gray-600">Started</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-medium text-gray-700">{new Date(selectedConversation.endTime).toLocaleDateString()}</div>
                      <div className="text-sm text-gray-600">Last Activity</div>
                    </div>
                  </div>
                </div>

                {/* Conversation Thread */}
                <ConversationThread conversation={selectedConversation} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Request Compare Modal */}
      {isCompareModalOpen && selectedForCompare.length === 2 && (
        <RequestCompareModal
          request1={selectedForCompare[0]}
          request2={selectedForCompare[1]}
          onClose={closeCompareModal}
        />
      )}
    </div>
  );
}
