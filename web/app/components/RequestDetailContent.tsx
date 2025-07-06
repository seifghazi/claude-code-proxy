import { useState } from 'react';
import { 
  ChevronDown, 
  Info, 
  Settings, 
  Cpu, 
  MessageCircle, 
  Brain, 
  User, 
  Bot, 
  Target,
  Copy,
  Check,
  ArrowLeftRight,
  Activity,
  Clock,
  Wifi,
  Calendar,
  List,
  FileText,
  Wrench,
  Coins
} from 'lucide-react';
import { MessageContent } from './MessageContent';
import { formatJSON } from '../utils/formatters';

interface Request {
  id: number;
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

interface RequestDetailContentProps {
  request: Request;
  onGrade: () => void;
}

export default function RequestDetailContent({ request, onGrade }: RequestDetailContentProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overview: true,
    conversation: true
  });
  const [copied, setCopied] = useState<Record<string, boolean>>({});

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleCopy = async (content: string, key: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopied(prev => ({ ...prev, [key]: false }));
      }, 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
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

  const canGradeRequest = (request: Request) => {
    return request.body && 
           request.body.messages && 
           request.body.messages.some(msg => msg.role === 'user') &&
           request.endpoint.includes('/messages');
  };

  return (
    <div className="space-y-6">
      {/* Request Overview */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold text-gray-900 flex items-center space-x-3">
            <Info className="w-5 h-5 text-blue-600" />
            <span>Request Overview</span>
          </h4>
          {/* {!request.promptGrade && canGradeRequest(request) && (
            <button 
              onClick={onGrade}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
            >
              <Target className="w-4 h-4" />
              <span>Grade This Prompt</span>
            </button>
          )} */}
        </div>
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <span className="text-gray-500 font-medium min-w-[80px]">Method:</span>
              <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide ${getMethodColor(request.method)}`}>
                {request.method}
              </span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-gray-500 font-medium min-w-[80px]">Endpoint:</span>
              <code className="text-blue-600 bg-blue-50 px-2 py-1 rounded font-mono text-xs border border-blue-200">
                {request.endpoint}
              </code>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <span className="text-gray-500 font-medium min-w-[80px]">Timestamp:</span>
              <span className="text-gray-900">{new Date(request.timestamp).toLocaleString()}</span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-gray-500 font-medium min-w-[80px]">User Agent:</span>
              <span className="text-gray-600 text-xs">{request.headers['User-Agent']?.[0] || 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Headers */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div 
          className="bg-gray-50 px-6 py-4 border-b border-gray-200 cursor-pointer"
          onClick={() => toggleSection('headers')}
        >
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-semibold text-gray-900 flex items-center space-x-3">
              <Settings className="w-5 h-5 text-blue-600" />
              <span>Request Headers</span>
            </h4>
            <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${
              expandedSections.headers ? 'rotate-180' : ''
            }`} />
          </div>
        </div>
        {expandedSections.headers && (
          <div className="p-6">
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Headers</span>
                <button
                  onClick={() => handleCopy(formatJSON(request.headers), 'headers')}
                  className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                  title="Copy headers"
                >
                  {copied.headers ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <pre className="text-sm text-gray-700 overflow-x-auto">
                {formatJSON(request.headers)}
              </pre>
            </div>
          </div>
        )}
      </div>

      {request.body && (
        <>
          {/* System Messages */}
          {request.body.system && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div 
                className="bg-gray-50 px-6 py-4 border-b border-gray-200 cursor-pointer"
                onClick={() => toggleSection('system')}
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-gray-900 flex items-center space-x-3">
                    <Cpu className="w-5 h-5 text-yellow-600" />
                    <span>System Instructions</span>
                    <span className="text-xs bg-yellow-50 text-yellow-700 px-2 py-1 rounded-full border border-yellow-200">
                      {request.body.system.length} items
                    </span>
                  </h4>
                  <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${
                    expandedSections.system ? 'rotate-180' : ''
                  }`} />
                </div>
              </div>
              {expandedSections.system && (
                <div className="p-6 space-y-4">
                  {request.body.system.map((sys, index) => (
                    <div key={index} className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-yellow-700 font-medium text-sm">System Message #{index + 1}</span>
                        {sys.cache_control && (
                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full border border-orange-200">
                            Cache: {sys.cache_control.type}
                          </span>
                        )}
                      </div>
                      <div className="bg-white rounded p-3 border border-gray-200">
                        <MessageContent content={{ type: 'text', text: sys.text }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tools Configuration */}
          {request.body.tools && request.body.tools.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div 
                className="bg-gray-50 px-6 py-4 border-b border-gray-200 cursor-pointer"
                onClick={() => toggleSection('tools')}
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-gray-900 flex items-center space-x-3">
                    <Wrench className="w-5 h-5 text-indigo-600" />
                    <span>Tools Configuration</span>
                    <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full border border-indigo-200">
                      {request.body.tools.length} tools
                    </span>
                  </h4>
                  <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${
                    expandedSections.tools ? 'rotate-180' : ''
                  }`} />
                </div>
              </div>
              {expandedSections.tools && (
                <div className="p-6 space-y-4">
                  {request.body.tools.map((tool, index) => (
                    <div key={index} className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <span className="text-indigo-700 font-semibold text-sm">{tool.name}</span>
                          <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-1 rounded-full border border-indigo-300">
                            Tool #{index + 1}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 mb-3">{tool.description}</p>
                      {tool.input_schema && (
                        <div className="bg-white rounded p-3 border border-gray-200">
                          <div className="text-xs font-semibold text-gray-600 mb-2">Input Schema</div>
                          <pre className="text-xs text-gray-700 overflow-x-auto">
                            {JSON.stringify(tool.input_schema, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Conversation */}
          {request.body.messages && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div 
                className="bg-gray-50 px-6 py-4 border-b border-gray-200 cursor-pointer"
                onClick={() => toggleSection('conversation')}
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-gray-900 flex items-center space-x-3">
                    <MessageCircle className="w-5 h-5 text-blue-600" />
                    <span>Conversation</span>
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full border border-blue-200">
                      {request.body.messages.length} messages
                    </span>
                  </h4>
                  <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${
                    expandedSections.conversation ? 'rotate-180' : ''
                  }`} />
                </div>
              </div>
              {expandedSections.conversation && (
                <div className="p-6 space-y-4 max-h-[600px] overflow-y-auto">
                  {request.body.messages.map((message, index) => (
                    <MessageBubble key={index} message={message} index={index} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Model Configuration */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div 
              className="bg-gray-50 px-6 py-4 border-b border-gray-200 cursor-pointer"
              onClick={() => toggleSection('model')}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold text-gray-900 flex items-center space-x-3">
                  <Brain className="w-5 h-5 text-purple-600" />
                  <span>Model Configuration</span>
                </h4>
                <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${
                  expandedSections.model ? 'rotate-180' : ''
                }`} />
              </div>
            </div>
            {expandedSections.model && (
              <div className="p-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Model</div>
                    <div className="text-sm font-medium text-gray-900">{request.body.model || 'N/A'}</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Max Tokens</div>
                    <div className="text-sm font-medium text-gray-900">
                      {request.body.max_tokens?.toLocaleString() || 'N/A'}
                    </div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Temperature</div>
                    <div className="text-sm font-medium text-gray-900">{request.body.temperature ?? 'N/A'}</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Stream</div>
                    <div className="text-sm font-medium text-gray-900">
                      {request.body.stream ? '✅ Yes' : '❌ No'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* API Response */}
      {request.response && (
        <ResponseDetails response={request.response} />
      )}

      {/* Prompt Grading Results */}
      {request.promptGrade && (
        <PromptGradingResults promptGrade={request.promptGrade} />
      )}
    </div>
  );
}

// Message bubble component
function MessageBubble({ message, index }: { message: any; index: number }) {
  const roleColors = {
    'user': 'bg-blue-50 border border-blue-200',
    'assistant': 'bg-gray-50 border border-gray-200',
    'system': 'bg-yellow-50 border border-yellow-200'
  };

  const roleIcons = {
    'user': User,
    'assistant': Bot,
    'system': Settings
  };

  const roleIconColors = {
    'user': 'text-blue-600',
    'assistant': 'text-gray-600',
    'system': 'text-yellow-600'
  };

  const Icon = roleIcons[message.role as keyof typeof roleIcons] || User;

  return (
    <div className={`rounded-lg p-4 ${roleColors[message.role as keyof typeof roleColors] || 'bg-gray-50 border border-gray-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-gray-200">
            <Icon className={`w-4 h-4 ${roleIconColors[message.role as keyof typeof roleIconColors] || 'text-gray-600'}`} />
          </div>
          <span className="font-medium capitalize text-gray-900">{message.role}</span>
          <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded-full border border-gray-200">
            #{index + 1}
          </span>
        </div>
      </div>
      <div>
        <MessageContent content={message.content} />
      </div>
    </div>
  );
}

// Placeholder for prompt grading results - you can expand this
function PromptGradingResults({ promptGrade }: { promptGrade: any }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h4 className="text-lg font-semibold text-gray-900 mb-4">Prompt Quality Analysis</h4>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-gray-700">Overall Score:</span>
          <span className="text-2xl font-bold text-blue-600">{promptGrade.score}/5</span>
        </div>
        <div className="text-sm text-gray-600">
          <p>{promptGrade.feedback}</p>
        </div>
      </div>
    </div>
  );
}

// Response Details Component
function ResponseDetails({ response }: { response: NonNullable<Request['response']> }) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overview: true
  });
  const [copied, setCopied] = useState<Record<string, boolean>>({});

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleCopy = async (content: string, key: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopied(prev => ({ ...prev, [key]: false }));
      }, 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const getStatusColor = (statusCode: number) => {
    if (statusCode >= 200 && statusCode < 300) {
      return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: 'text-green-600' };
    }
    if (statusCode >= 400 && statusCode < 500) {
      return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: 'text-yellow-600' };
    }
    if (statusCode >= 500) {
      return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: 'text-red-600' };
    }
    return { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', icon: 'text-gray-600' };
  };

  // Parse streaming chunks to extract the final assembled text
  const parseStreamingResponse = (chunks: string[]) => {
    let assembledText = '';
    let rawData = chunks.join('');
    
    try {
      // Split by lines and process each SSE event
      const lines = rawData.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        // Look for data lines in SSE format
        if (line.startsWith('data: ')) {
          const jsonStr = line.substring(6).trim();
          
          // Skip non-JSON lines (like "data: [DONE]")
          if (!jsonStr.startsWith('{')) continue;
          
          try {
            const eventData = JSON.parse(jsonStr);
            
            // Extract text from content_block_delta events
            if (eventData.type === 'content_block_delta' && 
                eventData.delta && 
                eventData.delta.type === 'text_delta' && 
                typeof eventData.delta.text === 'string') {
              assembledText += eventData.delta.text;
            }
          } catch (parseError) {
            // Skip malformed JSON
            continue;
          }
        }
      }
      
      // If we successfully extracted text, return it
      if (assembledText.trim().length > 0) {
        return {
          finalText: assembledText,
          isFormatted: true,
          rawData: rawData
        };
      }
      
      // Fallback: try to find any text content in the raw data
      const textMatches = rawData.match(/"text":"([^"]+)"/g);
      if (textMatches) {
        let fallbackText = '';
        for (const match of textMatches) {
          const text = match.match(/"text":"([^"]+)"/)?.[1];
          if (text) {
            // Unescape common JSON escape sequences
            fallbackText += text.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          }
        }
        if (fallbackText.trim()) {
          return {
            finalText: fallbackText,
            isFormatted: true,
            rawData: rawData
          };
        }
      }
      
    } catch (error) {
      console.warn('Error parsing streaming response:', error);
    }
    
    // Ultimate fallback to raw concatenation
    return {
      finalText: rawData,
      isFormatted: false,
      rawData: rawData
    };
  };

  const statusColors = getStatusColor(response.statusCode);
  const completedAt = response.completedAt ? new Date(response.completedAt).toLocaleString() : 'Unknown';

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm border-l-4 border-l-blue-500">
      <div 
        className="bg-gray-50 px-6 py-4 border-b border-gray-200 cursor-pointer"
        onClick={() => toggleSection('overview')}
      >
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-semibold text-gray-900 flex items-center space-x-3">
            <ArrowLeftRight className="w-5 h-5 text-blue-600" />
            <span>API Response</span>
            <span className={`text-xs px-2 py-1 rounded-full border ${statusColors.bg} ${statusColors.text} ${statusColors.border}`}>
              {response.statusCode}
            </span>
          </h4>
          <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${
            expandedSections.overview ? 'rotate-180' : ''
          }`} />
        </div>
      </div>
      
      {expandedSections.overview && (
        <div className="p-6 space-y-6">
          {/* Response Overview */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`${statusColors.bg} border ${statusColors.border} rounded-lg p-4`}>
              <div className="flex items-center space-x-2 mb-2">
                <Activity className={`w-4 h-4 ${statusColors.icon}`} />
                <span className={`text-xs font-medium ${statusColors.text}`}>Status</span>
              </div>
              <div className={`text-lg font-bold ${statusColors.text}`}>{response.statusCode}</div>
              <div className={`text-xs ${statusColors.text} opacity-75`}>
                {response.statusCode >= 200 && response.statusCode < 300 ? 'Success' :
                 response.statusCode >= 400 && response.statusCode < 500 ? 'Client Error' :
                 response.statusCode >= 500 ? 'Server Error' : 'Unknown'}
              </div>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-medium text-blue-700">Response Time</span>
              </div>
              <div className="text-lg font-bold text-blue-700">{response.responseTime}ms</div>
              <div className="text-xs text-blue-700 opacity-75">
                {response.responseTime < 1000 ? 'Fast' : response.responseTime < 3000 ? 'Normal' : 'Slow'}
              </div>
            </div>
            
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Wifi className="w-4 h-4 text-purple-600" />
                <span className="text-xs font-medium text-purple-700">Type</span>
              </div>
              <div className="text-lg font-bold text-purple-700">
                {response.isStreaming ? 'Stream' : 'Single'}
              </div>
              <div className="text-xs text-purple-700 opacity-75">
                {response.isStreaming ? 'Streaming' : 'Complete'}
              </div>
            </div>
            
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Calendar className="w-4 h-4 text-gray-600" />
                <span className="text-xs font-medium text-gray-700">Completed</span>
              </div>
              <div className="text-sm font-bold text-gray-700">{completedAt.split(' ')[1] || 'N/A'}</div>
              <div className="text-xs text-gray-700 opacity-75">{completedAt.split(' ')[0] || ''}</div>
            </div>
          </div>

          {/* Token Usage */}
          {response.usage && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
              <div className="flex items-center space-x-3 mb-4">
                <Coins className="w-5 h-5 text-amber-600" />
                <h5 className="text-lg font-semibold text-gray-900">Token Usage</h5>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-amber-200 rounded-lg p-4">
                  <div className="text-xs text-gray-600 mb-1">Input Tokens</div>
                  <div className="text-2xl font-bold text-amber-700">
                    {response.usage.input_tokens.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">Standard input</div>
                </div>
                
                <div className="bg-white border border-amber-200 rounded-lg p-4">
                  <div className="text-xs text-gray-600 mb-1">Output Tokens</div>
                  <div className="text-2xl font-bold text-amber-700">
                    {response.usage.output_tokens.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">Generated tokens</div>
                </div>
                
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="text-xs text-gray-600 mb-1">Cache Read Tokens</div>
                  <div className="text-2xl font-bold text-green-700">
                    {(response.usage.cache_read_input_tokens || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-green-600">90% cheaper</div>
                </div>
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-xs text-gray-600 mb-1">Cache Creation Tokens</div>
                  <div className="text-2xl font-bold text-blue-700">
                    {(response.usage.cache_creation_input_tokens || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-blue-600">25% more expensive</div>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-amber-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">Total Input Tokens</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {(
                      response.usage.input_tokens + 
                      (response.usage.cache_read_input_tokens || 0) + 
                      (response.usage.cache_creation_input_tokens || 0)
                    ).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Response Headers */}
          {response.headers && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
              <div 
                className="px-4 py-3 border-b border-gray-200 cursor-pointer"
                onClick={() => toggleSection('responseHeaders')}
              >
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-semibold text-gray-900 flex items-center space-x-2">
                    <List className="w-4 h-4 text-gray-600" />
                    <span>Response Headers</span>
                    <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full">
                      {Object.keys(response.headers).length}
                    </span>
                  </h5>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${
                    expandedSections.responseHeaders ? 'rotate-180' : ''
                  }`} />
                </div>
              </div>
              {expandedSections.responseHeaders && (
                <div className="px-4 pb-4">
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Headers</span>
                      <button
                        onClick={() => handleCopy(formatJSON(response.headers), 'responseHeaders')}
                        className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                        title="Copy response headers"
                      >
                        {copied.responseHeaders ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <pre className="text-xs text-gray-700 overflow-x-auto">
                      {formatJSON(response.headers)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Response Body */}
          {(response.body || response.bodyText) && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
              <div 
                className="px-4 py-3 border-b border-gray-200 cursor-pointer"
                onClick={() => toggleSection('responseBody')}
              >
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-semibold text-gray-900 flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-gray-600" />
                    <span>Response Body</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full border border-blue-200">
                      {response.body ? 'JSON' : 'Text'}
                    </span>
                  </h5>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${
                    expandedSections.responseBody ? 'rotate-180' : ''
                  }`} />
                </div>
              </div>
              {expandedSections.responseBody && (
                <div className="px-4 pb-4">
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Response</span>
                      <button
                        onClick={() => handleCopy(
                          response.body ? formatJSON(response.body) : (response.bodyText || ''), 
                          'responseBody'
                        )}
                        className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                        title="Copy response body"
                      >
                        {copied.responseBody ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <pre className="text-xs text-gray-700 overflow-x-auto max-h-96 overflow-y-auto">
                      {response.body ? formatJSON(response.body) : response.bodyText}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Streaming Response */}
          {response.isStreaming && response.streamingChunks && response.streamingChunks.length > 0 && (() => {
            const parsed = parseStreamingResponse(response.streamingChunks);
            return (
              <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                <div 
                  className="px-4 py-3 border-b border-gray-200 cursor-pointer"
                  onClick={() => toggleSection('streamingResponse')}
                >
                  <div className="flex items-center justify-between">
                    <h5 className="text-sm font-semibold text-gray-900 flex items-center space-x-2">
                      <Wifi className="w-4 h-4 text-gray-600" />
                      <span>Streaming Response</span>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full border border-blue-200">
                        {response.streamingChunks.length} chunks
                      </span>
                      {parsed.isFormatted && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full border border-green-200">
                          Parsed
                        </span>
                      )}
                    </h5>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${
                      expandedSections.streamingResponse ? 'rotate-180' : ''
                    }`} />
                  </div>
                </div>
                {expandedSections.streamingResponse && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* Clean Parsed Response */}
                    {parsed.isFormatted && (
                      <div className="bg-white rounded-lg p-4 border border-green-200">
                        <div className="flex items-center justify-between mb-3">
                          <h6 className="text-sm font-semibold text-green-900 flex items-center space-x-2">
                            <Check className="w-4 h-4" />
                            <span>Final Response (Clean)</span>
                          </h6>
                          <button
                            onClick={() => handleCopy(parsed.finalText, 'streamingClean')}
                            className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                            title="Copy clean response"
                          >
                            {copied.streamingClean ? (
                              <Check className="w-4 h-4 text-green-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                        <div className="bg-gray-50 rounded p-3 border border-gray-200">
                          <pre className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
                            {parsed.finalText}
                          </pre>
                        </div>
                        <div className="mt-2 text-xs text-green-600">
                          Extracted clean text from streaming chunks
                        </div>
                      </div>
                    )}

                    {/* Raw Data (Collapsible) */}
                    <div className="bg-gray-50 rounded-lg border border-gray-200">
                      <div 
                        className="px-3 py-2 cursor-pointer flex items-center justify-between"
                        onClick={() => toggleSection('rawStreamingData')}
                      >
                        <span className="text-sm font-medium text-gray-700 flex items-center space-x-2">
                          <FileText className="w-4 h-4" />
                          <span>Raw Streaming Data</span>
                        </span>
                        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${
                          expandedSections.rawStreamingData ? 'rotate-180' : ''
                        }`} />
                      </div>
                      {expandedSections.rawStreamingData && (
                        <div className="px-3 pb-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-600">SSE Events & Metadata</span>
                            <button
                              onClick={() => handleCopy(parsed.rawData, 'streamingRaw')}
                              className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                              title="Copy raw data"
                            >
                              {copied.streamingRaw ? (
                                <Check className="w-3 h-3 text-green-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                          <pre className="text-xs text-gray-600 overflow-x-auto max-h-64 overflow-y-auto bg-gray-100 rounded p-2 font-mono">
                            {parsed.rawData}
                          </pre>
                        </div>
                      )}
                    </div>

                    <div className="text-xs text-gray-500">
                      {parsed.isFormatted 
                        ? `Successfully parsed ${response.streamingChunks.length} streaming chunks`
                        : `Raw display of ${response.streamingChunks.length} streaming chunks (parsing failed)`
                      }
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}