import type { MetaFunction } from "@remix-run/node";
import { useState, useEffect, useTransition } from "react";
import { 
  Activity, 
  RefreshCw, 
  Trash2, 
  List,
  FileText,
  X,
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
  ArrowLeftRight
} from "lucide-react";

import RequestDetailContent from "../components/RequestDetailContent";
import { ConversationThread } from "../components/ConversationThread";
import { getChatCompletionsEndpoint } from "../utils/models";

export const meta: MetaFunction = () => {
  return [
    { title: "Claude Code Monitor" },
    { name: "description", content: "Claude Code Monitor - Real-time API request visualization" },
  ];
};

interface Request {
  id: number;
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

export default function Index() {
  const [requests, setRequests] = useState<Request[]>([]);
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

  const loadRequests = async (filter?: string, loadMore = false) => {
    setIsFetching(true);
    const pageToFetch = loadMore ? requestsCurrentPage + 1 : 1;
    try {
      const currentModelFilter = filter || modelFilter;
      const url = new URL('/api/requests', window.location.origin);
      url.searchParams.append("page", pageToFetch.toString());
      url.searchParams.append("limit", itemsPerPage.toString());
      if (currentModelFilter !== "all") {
        url.searchParams.append("model", currentModelFilter);
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const requests = data.requests || [];
      const mappedRequests = requests.map((req: any, index: number) => ({
        ...req,
        id: req.requestId ? `${req.requestId}_${index}` : `request_${index}` 
      }));
      
      startTransition(() => {
        if (loadMore) {
          setRequests(prev => [...prev, ...mappedRequests]);
        } else {
          setRequests(mappedRequests);
        }
        setRequestsCurrentPage(pageToFetch);
        setHasMoreRequests(mappedRequests.length === itemsPerPage);
      });
    } catch (error) {
      console.error('Failed to load requests:', error);
      startTransition(() => {
        setRequests([]);
      });
    } finally {
      setIsFetching(false);
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
        setRequests([]);
        setConversations([]);
        setRequestsCurrentPage(1);
        setHasMoreRequests(true);
        setConversationsCurrentPage(1);
        setHasMoreConversations(true);
      }
    } catch (error) {
      console.error('Failed to clear requests:', error);
      setRequests([]);
    }
  };

  const filterRequests = (filter: string) => {
    if (filter === 'all') return requests;
    
    return requests.filter(req => {
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

  const showRequestDetails = (requestId: number) => {
    const request = requests.find(r => r.id === requestId);
    if (request) {
      setSelectedRequest(request);
      setIsModalOpen(true);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedRequest(null);
  };

  const getToolStats = () => {
    let toolDefinitions = 0;
    let toolCalls = 0;
    
    requests.forEach(req => {
      if (req.body) {
        // Count tool definitions in system prompts
        if (req.body.system) {
          req.body.system.forEach(sys => {
            if (sys.text && sys.text.includes('<functions>')) {
              const functionMatches = [...sys.text.matchAll(/<function>([\s\S]*?)<\/function>/g)];
              toolDefinitions += functionMatches.length;
            }
          });
        }
        
        // Count actual tool calls in messages
        if (req.body.messages) {
          req.body.messages.forEach(msg => {
            if (msg.content && Array.isArray(msg.content)) {
              msg.content.forEach((contentPart: any) => {
                if (contentPart.type === 'tool_use') {
                  toolCalls++;
                }
                if (contentPart.type === 'text' && contentPart.text && contentPart.text.includes('<functions>')) {
                  const functionMatches = [...contentPart.text.matchAll(/<function>([\s\S]*?)<\/function>/g)];
                  toolDefinitions += functionMatches.length;
                }
              });
            }
          });
        }
      }
    });
    
    return `${toolCalls} calls / ${toolDefinitions} tools`;
  };

  const getPromptGradeStats = () => {
    let totalGrades = 0;
    let gradeCount = 0;
    
    requests.forEach(req => {
      if (req.promptGrade && req.promptGrade.score) {
        totalGrades += req.promptGrade.score;
        gradeCount++;
      }
    });
    
    if (gradeCount > 0) {
      const avgGrade = (totalGrades / gradeCount).toFixed(1);
      return `${avgGrade}/5`;
    }
    return '-/5';
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

  const formatConversationSummary = (conversation: ConversationSummary) => {
    const duration = formatDuration(conversation.duration);
    return `${conversation.requestCount} requests • ${duration} duration`;
  };

  const canGradeRequest = (request: Request) => {
    return request.body && 
           request.body.messages && 
           request.body.messages.some(msg => msg.role === 'user') &&
           request.endpoint.includes('/messages');
  };

  const gradeRequest = async (requestId: number) => {
    const request = requests.find(r => r.id === requestId);
    if (!request || !canGradeRequest(request)) return;

    try {
      const response = await fetch('/api/grade-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: request.body!.messages,
          systemMessages: request.body!.system || [],
          requestId: request.timestamp
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const promptGrade = await response.json();
      
      // Update the request with the new grading
      const updatedRequests = requests.map(r => 
        r.id === requestId ? { ...r, promptGrade } : r
      );
      setRequests(updatedRequests);
      
    } catch (error) {
      console.error('Failed to grade prompt:', error);
    }
  };

  const handleModelFilterChange = (newFilter: string) => {
    setModelFilter(newFilter);
    if (viewMode === 'requests') {
      loadRequests(newFilter);
    } else {
      loadConversations(newFilter);
    }
  };

  useEffect(() => {
    if (viewMode === 'requests') {
      loadRequests(modelFilter);
    } else {
      loadConversations(modelFilter);
    }
  }, [viewMode, modelFilter]);

  // Handle escape key to close modals
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isModalOpen) {
          closeModal();
        } else if (isConversationModalOpen) {
          setIsConversationModalOpen(false);
          setSelectedConversation(null);
        }
      }
    };

    window.addEventListener('keydown', handleEscapeKey);
    
    return () => {
      window.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isModalOpen, isConversationModalOpen]);

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

      {/* Filter buttons - only show for requests view */}
      {viewMode === "requests" && (
        <div className="mb-6 flex justify-center">
          <div className="inline-flex items-center bg-gray-100 rounded p-0.5 space-x-0.5">
            <button
              onClick={() => handleModelFilterChange("all")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 ${
                modelFilter === "all"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "bg-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              All Models
            </button>
            <button
              onClick={() => handleModelFilterChange("opus")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 flex items-center space-x-1 ${
                modelFilter === "opus"
                  ? "bg-white text-purple-600 shadow-sm"
                  : "bg-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              <Brain className="w-3 h-3" />
              <span>Opus</span>
            </button>
            <button
              onClick={() => handleModelFilterChange("sonnet")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 flex items-center space-x-1 ${
                modelFilter === "sonnet"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "bg-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>Sonnet</span>
            </button>
            <button
              onClick={() => handleModelFilterChange("haiku")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 flex items-center space-x-1 ${
                modelFilter === "haiku"
                  ? "bg-white text-teal-600 shadow-sm"
                  : "bg-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>Haiku</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Stats Grid */}
        <div className="mb-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {viewMode === "requests" ? "Total Requests" : "Total Conversations"}
                </p>
                <p className="text-2xl font-semibold text-gray-900 mt-1">
                  {viewMode === "requests" ? requests.length : conversations.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        {viewMode === "requests" ? (
          /* Request History */
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Request History</h2>
              </div>
            </div>
            <div className="divide-y divide-gray-200">
              {(isFetching && requestsCurrentPage === 1) || isPending ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-6 h-6 mx-auto animate-spin text-gray-400" />
                  <p className="mt-2 text-xs text-gray-500">Loading requests...</p>
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <h3 className="text-sm font-medium text-gray-600 mb-1">No requests found</h3>
                  <p className="text-xs text-gray-500">Make sure you have set <code className="font-mono bg-gray-100 px-1 py-0.5 rounded">ANTHROPIC_BASE_URL</code> to point at the proxy</p>
                </div>
              ) : (
                <>
                  {filteredRequests.map(request => (
                    <div key={request.id} className="px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-100 last:border-b-0" onClick={() => showRequestDetails(request.id)}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0 mr-4">
                          {/* Model and Status */}
                          <div className="flex items-center space-x-3 mb-1">
                            <h3 className="text-sm font-medium">
                              {request.routedModel || request.body?.model ? (
                                // Use routedModel if available, otherwise fall back to body.model
                                (() => {
                                  const model = request.routedModel || request.body?.model || '';
                                  if (model.includes('opus')) return <span className="text-purple-600 font-semibold">Opus</span>;
                                  if (model.includes('sonnet')) return <span className="text-indigo-600 font-semibold">Sonnet</span>;
                                  if (model.includes('haiku')) return <span className="text-teal-600 font-semibold">Haiku</span>;
                                  if (model.includes('gpt-4o')) return <span className="text-green-600 font-semibold">GPT-4o</span>;
                                  if (model.includes('gpt')) return <span className="text-green-600 font-semibold">GPT</span>;
                                  return <span className="text-gray-900">{model.split('-')[0]}</span>;
                                })()
                              ) : <span className="text-gray-900">API</span>}
                            </h3>
                            {request.routedModel && request.routedModel !== request.originalModel && (
                              <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium flex items-center space-x-1">
                                <ArrowLeftRight className="w-3 h-3" />
                                <span>routed</span>
                              </span>
                            )}
                            {request.response?.statusCode && (
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                request.response.statusCode >= 200 && request.response.statusCode < 300 
                                  ? 'bg-green-100 text-green-700' 
                                  : request.response.statusCode >= 300 && request.response.statusCode < 400
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {request.response.statusCode}
                              </span>
                            )}
                            {request.conversationId && (
                              <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">
                                Turn {request.turnNumber}
                              </span>
                            )}
                          </div>
                          
                          {/* Endpoint */}
                          <div className="text-xs text-gray-600 font-mono mb-1">
                            {getChatCompletionsEndpoint(request.routedModel, request.endpoint)}
                          </div>
                          
                          {/* Metrics Row */}
                          <div className="flex items-center space-x-3 text-xs">
                            {request.response?.body?.usage && (
                              <>
                                <span className="font-mono text-gray-600">
                                  <span className="font-medium text-gray-900">{((request.response.body.usage.input_tokens || 0) + (request.response.body.usage.output_tokens || 0)).toLocaleString()}</span> tokens
                                </span>
                                {request.response.body.usage.cache_read_input_tokens && (
                                  <span className="font-mono bg-green-50 text-green-700 px-1.5 py-0.5 rounded">
                                    {request.response.body.usage.cache_read_input_tokens.toLocaleString()} cached
                                  </span>
                                )}
                              </>
                            )}
                            
                            {request.response?.responseTime && (
                              <span className="font-mono text-gray-600">
                                <span className="font-medium text-gray-900">{(request.response.responseTime / 1000).toFixed(2)}</span>s
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <div className="text-xs text-gray-500">
                            {new Date(request.timestamp).toLocaleDateString()}
                          </div>
                          <div className="text-xs text-gray-400">
                            {new Date(request.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {hasMoreRequests && (
                    <div className="p-3 text-center border-t border-gray-100">
                      <button
                        onClick={() => loadRequests(modelFilter, true)}
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
        ) : (
          /* Conversations View */
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
              <RequestDetailContent request={selectedRequest} onGrade={() => gradeRequest(selectedRequest.id)} />
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
    </div>
  );
}
