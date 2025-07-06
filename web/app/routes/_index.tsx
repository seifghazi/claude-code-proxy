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
  Coins
} from "lucide-react";

import RequestDetailContent from "../components/RequestDetailContent";
import { ConversationThread } from "../components/ConversationThread";

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
    max_tokens?: number;
    temperature?: number;
    stream?: boolean;
    tools?: Array<{
      name: string;
      description: string;
      input_schema: {
        type: string;
        properties?: Record<string, {
          type: string;
          description?: string;
          enum?: string[];
          items?: any;
        }>;
        required?: string[];
      };
    }>;
  };
  response?: {
    statusCode: number;
    headers: Record<string, string[]>;
    body?: any;
    bodyText?: string;
    responseTime: number;
    streamingChunks?: string[];
    isStreaming: boolean;
    completedAt: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
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
      
      // Fallback to example data for demo
      const exampleRequest = {
        timestamp: "2025-06-04T23:47:37-04:00",
        method: "POST",
        endpoint: "/v1/messages",
        headers: {
          "User-Agent": ["claude-cli/1.0.11 (external, cli)"],
          "Content-Type": ["application/json"],
          "Anthropic-Version": ["2023-06-01"]
        },
        body: {
          model: "claude-sonnet-4-20250514",
          messages: [
            {
              role: "user",
              content: [{
                type: "text",
                text: "I need to extract the complete list of tools available to Claude Code from the request file..."
              }]
            }
          ],
          max_tokens: 32000,
          temperature: 1,
          stream: true
        }
      };

      startTransition(() => {
        // setRequests([
        //   { ...exampleRequest, id: 1 },
        //   { 
        //     ...exampleRequest, 
        //     id: 2, 
        //     timestamp: "2025-06-04T23:45:12-04:00",
        //     endpoint: "/v1/chat/completions",
        //     body: { ...exampleRequest.body, model: "gpt-4-turbo" }
        //   },
        //   { 
        //     ...exampleRequest, 
        //     id: 3, 
        //     timestamp: "2025-06-04T23:42:33-04:00",
        //     method: "GET",
        //     endpoint: "/v1/models",
        //     body: undefined
        //   }
        // ]);
      });
    } finally {
      setIsFetching(false);
    }
  };

  const loadConversations = async (filter?: string, loadMore = false) => {
    setIsFetching(true);
    const pageToFetch = loadMore ? conversationsCurrentPage + 1 : 1;
    try {
      const currentModelFilter = filter || modelFilter;
      const url = new URL('/api/conversations', window.location.origin);
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

  const getCumulativeTokenStats = () => {
    return requests.reduce((totals, request) => {
      if (request.response?.usage) {
        totals.inputTokens += request.response.usage.input_tokens || 0;
        totals.outputTokens += request.response.usage.output_tokens || 0;
        totals.cacheCreationInputTokens += request.response.usage.cache_creation_input_tokens || 0;
        totals.cacheReadInputTokens += request.response.usage.cache_read_input_tokens || 0;
      }
      return totals;
    }, {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0
    });
  };

  const getRequestSummary = (request: Request) => {
    if (request.body?.messages) {
      const messageCount = request.body.messages.length;
      
      // Count tool calls
      const toolCalls = request.body.messages.reduce((count, msg) => {
        if (msg.content && Array.isArray(msg.content)) {
          return count + msg.content.filter((c: any) => c.type === 'tool_use').length;
        }
        return count;
      }, 0);
      
      // Count tool definitions from both sources
      let toolDefinitions = 0;
      
      // Count from structured tools array (modern format)
      if (request.body.tools && Array.isArray(request.body.tools)) {
        toolDefinitions += request.body.tools.length;
      }
      
      // Count from system prompt XML (legacy format)
      if (request.body.system) {
        request.body.system.forEach(sys => {
          if (sys.text && sys.text.includes('<functions>')) {
            const functionMatches = [...sys.text.matchAll(/<function>([\s\S]*?)<\/function>/g)];
            toolDefinitions += functionMatches.length;
          }
        });
      }
      
      let summary = `💬 ${messageCount} messages`;
      if (toolDefinitions > 0) {
        summary += ` • 🛠️ ${toolDefinitions} tools available`;
      }
      if (toolCalls > 0) {
        summary += ` • ⚡ ${toolCalls} tool calls executed`;
      }
      
      // Add token usage if available
      if (request.response?.usage) {
        const usage = request.response.usage;
        const inputTokens = usage.input_tokens || 0;
        const outputTokens = usage.output_tokens || 0;
        const cacheWrite = usage.cache_creation_input_tokens || 0;
        const cacheRead = usage.cache_read_input_tokens || 0;
        
        if (inputTokens > 0 || outputTokens > 0 || cacheWrite > 0 || cacheRead > 0) {
          let tokenParts = [];
          
          if (inputTokens > 0) tokenParts.push(`${inputTokens.toLocaleString()} in`);
          if (outputTokens > 0) tokenParts.push(`${outputTokens.toLocaleString()} out`);
          if (cacheWrite > 0) tokenParts.push(`${cacheWrite.toLocaleString()} cache write`);
          if (cacheRead > 0) tokenParts.push(`${cacheRead.toLocaleString()} cache read`);
          
          summary += ` • 🪙 tokens: ${tokenParts.join(', ')}`;
        }
      }
      
      return summary;
    }
    return '📡 API request';
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

  const filteredRequests = filterRequests(filter);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">Claude Code Monitor</h1>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => loadRequests()}
                  className="p-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
                <button
                  onClick={clearRequests}
                  className="p-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                  title="Clear all requests"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Filter buttons */}
      <div className="mb-6 flex justify-center">
        <div className="inline-flex items-center bg-gray-100/80 rounded-lg p-1 space-x-1">
          <button
            onClick={() => handleModelFilterChange("all")}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-all duration-200 ${
              modelFilter === "all"
                ? "bg-white text-blue-600 shadow-sm"
                : "bg-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            All Models
          </button>
          <button
            onClick={() => handleModelFilterChange("opus")}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-all duration-200 flex items-center space-x-2 ${
              modelFilter === "opus"
                ? "bg-white text-purple-600 shadow-sm"
                : "bg-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            <Brain className="w-4 h-4" />
            <span>Opus</span>
          </button>
          <button
            onClick={() => handleModelFilterChange("sonnet")}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-all duration-200 flex items-center space-x-2 ${
              modelFilter === "sonnet"
                ? "bg-white text-indigo-600 shadow-sm"
                : "bg-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Sonnet</span>
          </button>
          <button
            onClick={() => handleModelFilterChange("haiku")}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-all duration-200 flex items-center space-x-2 ${
              modelFilter === "haiku"
                ? "bg-white text-teal-600 shadow-sm"
                : "bg-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Haiku</span>
          </button>
        </div>
      </div>

      {/* View mode toggle */}
      <div className="mb-6 flex justify-center">
        <div className="p-1 bg-gray-200 rounded-full flex items-center">
          <button
            onClick={() => setViewMode("requests")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === "requests"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <List className="w-4 h-4 inline mr-1" />
            Requests
          </button>
          <button
            onClick={() => setViewMode("conversations")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === "conversations"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <MessageCircle className="w-4 h-4 inline mr-1" />
            Conversations
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Stats Grid */}
        {viewMode === "requests" ? (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-500">Total Requests</p>
                  <p className="text-2xl font-semibold text-gray-900">{requests.length}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Activity className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>
            
            {(() => {
              const tokenStats = getCumulativeTokenStats();
              return (
                <>
                  <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-500">Input Tokens</p>
                        <p className="text-2xl font-semibold text-amber-700">{tokenStats.inputTokens.toLocaleString()}</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center">
                        <Coins className="w-6 h-6 text-amber-600" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-500">Output Tokens</p>
                        <p className="text-2xl font-semibold text-amber-700">{tokenStats.outputTokens.toLocaleString()}</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center">
                        <Coins className="w-6 h-6 text-amber-600" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-500">Cache Read</p>
                        <p className="text-2xl font-semibold text-green-700">{tokenStats.cacheReadInputTokens.toLocaleString()}</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-green-50 flex items-center justify-center">
                        <Coins className="w-6 h-6 text-green-600" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-500">Cache Creation</p>
                        <p className="text-2xl font-semibold text-blue-700">{tokenStats.cacheCreationInputTokens.toLocaleString()}</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Coins className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-1 gap-6">
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-500">Total Conversations</p>
                  <p className="text-2xl font-semibold text-gray-900">{conversations.length}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        {viewMode === "requests" ? (
          /* Request History */
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <List className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-semibold text-gray-900">Request History</h2>
                </div>
                {/* <div className="flex items-center space-x-3">
                  <select 
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="all">All Requests</option>
                    <option value="messages">Messages</option>
                    <option value="completions">Completions</option>
                    <option value="models">Models</option>
                  </select>
                </div> */}
              </div>
            </div>
            <div className="divide-y divide-gray-200">
              {(isFetching && requestsCurrentPage === 1) || isPending ? (
                <div className="p-12 text-center">
                  <Loader2 className="w-8 h-8 mx-auto animate-spin text-gray-400" />
                  <p className="mt-4 text-sm text-gray-500">Loading requests...</p>
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Inbox className="w-10 h-10 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-600 mb-2">No requests found</h3>
                  <p className="text-sm text-gray-500">Make sure you have set the <code>ANTHROPIC_BASE_URL</code> environment variable to the proxy server URL</p>
                </div>
              ) : (
                <>
                  {filteredRequests.map(request => (
                    <div key={request.id} className="p-6 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => showRequestDetails(request.id)}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-4 flex-1">
                          <span className={`method-badge ${getMethodColor(request.method)} px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide`}>
                            {request.method}
                          </span>
                          <div className="flex flex-col">
                            <div className="flex items-center space-x-2">
                              <span className="text-gray-900 font-semibold text-base">{request.endpoint}</span>
                              {request.conversationId && (
                                <span className="text-xs bg-purple-50 border border-purple-200 text-purple-700 px-2 py-1 rounded-full">
                                  Turn {request.turnNumber}
                                </span>
                              )}
                            </div>
                            <span className="text-gray-500 text-sm">{new Date(request.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          {request.body?.model && (
                            <span className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg font-medium">
                              {request.body.model}
                            </span>
                          )}
                          {/* {request.promptGrade ? (
                            <span className={`text-xs px-2 py-1 rounded-lg font-medium border ${
                              request.promptGrade.score >= 4 
                                ? 'bg-green-50 border-green-200 text-green-700' 
                                : request.promptGrade.score >= 3 
                                ? 'bg-yellow-50 border-yellow-200 text-yellow-700' 
                                : 'bg-red-50 border-red-200 text-red-700'
                            }`}>
                              {request.promptGrade.score >= 4 ? '🎉' : request.promptGrade.score >= 3 ? '👍' : '⚠️'} {request.promptGrade.score}/5
                            </span>
                          ) : (
                            canGradeRequest(request) && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  gradeRequest(request.id);
                                }}
                                className="text-xs bg-purple-50 border border-purple-200 text-purple-700 px-3 py-1.5 rounded-lg font-medium hover:bg-purple-100 transition-colors flex items-center space-x-1"
                              >
                                <Target className="w-3 h-3" />
                                <span>Grade Prompt</span>
                              </button>
                            )
                          )} */}
                          <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          </div>
                        </div>
                      </div>
                      <div className="text-gray-600 text-sm bg-gray-50 rounded-lg p-3 border border-gray-200">
                        {getRequestSummary(request)}
                      </div>
                    </div>
                  ))}
                  {hasMoreRequests && (
                    <div className="p-4 text-center">
                      <button
                        onClick={() => loadRequests(modelFilter, true)}
                        disabled={isFetching}
                        className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
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
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <MessageCircle className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-semibold text-gray-900">Conversations</h2>
                </div>
              </div>
            </div>
            <div className="divide-y divide-gray-200">
              {(isFetching && conversationsCurrentPage === 1) || isPending ? (
                <div className="p-12 text-center">
                  <Loader2 className="w-8 h-8 mx-auto animate-spin text-gray-400" />
                  <p className="mt-4 text-sm text-gray-500">Loading conversations...</p>
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <MessageCircle className="w-10 h-10 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-600 mb-2">No conversations found</h3>
                  <p className="text-sm text-gray-500">Start a conversation to see it appear here</p>
                </div>
              ) : (
                <>
                  {conversations.map(conversation => (
                    <div key={conversation.id} className="p-6 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => loadConversationDetails(conversation.id, conversation.projectName)}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-4 flex-1">
                          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                            <MessageCircle className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-gray-900 font-semibold text-base">Conversation {conversation.id.slice(-8)}</span>
                            <span className="text-gray-500 text-sm">{new Date(conversation.startTime).toLocaleString()}</span>
                            {conversation.projectName && (
                              <span className="text-xs text-purple-600 font-medium">{conversation.projectName}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg font-medium">
                            {conversation.requestCount} turns
                          </span>
                          <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-gray-600 text-sm bg-blue-50 rounded-lg p-3 border border-blue-200">
                          <strong>First:</strong> {conversation.firstMessage.substring(0, 200) || "No content"}{conversation.firstMessage.length > 200 && "..."}
                        </div>
                        {conversation.lastMessage && conversation.lastMessage !== conversation.firstMessage && (
                          <div className="text-gray-600 text-sm bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <strong>Latest:</strong> {conversation.lastMessage.substring(0, 200)}{conversation.lastMessage.length > 200 && "..."}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {hasMoreConversations && (
                    <div className="p-4 text-center">
                      <button
                        onClick={() => loadConversations(modelFilter, true)}
                        disabled={isFetching}
                        className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
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
