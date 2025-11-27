import { useState, useMemo } from 'react';
import {
  X,
  GitCompare,
  Plus,
  Minus,
  Equal,
  ChevronDown,
  ChevronRight,
  MessageCircle,
  User,
  Bot,
  Settings,
  Clock,
  Cpu,
  Brain,
  ArrowRight
} from 'lucide-react';
import { MessageContent } from './MessageContent';

interface Message {
  role: string;
  content: any;
}

interface Request {
  id: number;
  timestamp: string;
  method: string;
  endpoint: string;
  headers: Record<string, string[]>;
  originalModel?: string;
  routedModel?: string;
  body?: {
    model?: string;
    messages?: Message[];
    system?: Array<{
      text: string;
      type: string;
      cache_control?: { type: string };
    }>;
    tools?: Array<{
      name: string;
      description: string;
      input_schema?: any;
    }>;
    max_tokens?: number;
    temperature?: number;
    stream?: boolean;
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
  };
}

interface RequestCompareModalProps {
  request1: Request;
  request2: Request;
  onClose: () => void;
}

type DiffType = 'added' | 'removed' | 'unchanged' | 'modified';

interface MessageDiff {
  type: DiffType;
  index1?: number;
  index2?: number;
  message1?: Message;
  message2?: Message;
}

// Extract text content from a message for comparison
function getMessageText(content: any): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map(block => {
        if (typeof block === 'string') return block;
        if (block.type === 'text') return block.text || '';
        if (block.type === 'tool_use') return `[Tool: ${block.name}]`;
        if (block.type === 'tool_result') return `[Tool Result: ${block.tool_use_id}]`;
        return JSON.stringify(block);
      })
      .join('\n');
  }
  return JSON.stringify(content);
}

// Compare two messages to see if they're similar
function messagesAreSimilar(msg1: Message, msg2: Message): boolean {
  if (msg1.role !== msg2.role) return false;
  const text1 = getMessageText(msg1.content);
  const text2 = getMessageText(msg2.content);
  // Consider messages similar if they share >80% of content
  const shorter = Math.min(text1.length, text2.length);
  const longer = Math.max(text1.length, text2.length);
  if (longer === 0) return true;
  if (shorter / longer < 0.5) return false;
  // Simple check: if one is a prefix of the other or they're equal
  return text1 === text2 || text1.startsWith(text2.slice(0, 100)) || text2.startsWith(text1.slice(0, 100));
}

// Compute diff between two message arrays
function computeMessageDiff(messages1: Message[], messages2: Message[]): MessageDiff[] {
  const diffs: MessageDiff[] = [];
  let i = 0;
  let j = 0;

  while (i < messages1.length || j < messages2.length) {
    if (i >= messages1.length) {
      // All remaining messages in request2 are additions
      diffs.push({
        type: 'added',
        index2: j,
        message2: messages2[j]
      });
      j++;
    } else if (j >= messages2.length) {
      // All remaining messages in request1 are removals
      diffs.push({
        type: 'removed',
        index1: i,
        message1: messages1[i]
      });
      i++;
    } else if (messagesAreSimilar(messages1[i], messages2[j])) {
      // Messages match
      const text1 = getMessageText(messages1[i].content);
      const text2 = getMessageText(messages2[j].content);
      diffs.push({
        type: text1 === text2 ? 'unchanged' : 'modified',
        index1: i,
        index2: j,
        message1: messages1[i],
        message2: messages2[j]
      });
      i++;
      j++;
    } else {
      // Look ahead to find a match
      let foundMatch = false;

      // Check if messages1[i] matches something ahead in messages2
      for (let k = j + 1; k < Math.min(j + 5, messages2.length); k++) {
        if (messagesAreSimilar(messages1[i], messages2[k])) {
          // messages2[j..k-1] are additions
          for (let l = j; l < k; l++) {
            diffs.push({
              type: 'added',
              index2: l,
              message2: messages2[l]
            });
          }
          j = k;
          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        // Check if messages2[j] matches something ahead in messages1
        for (let k = i + 1; k < Math.min(i + 5, messages1.length); k++) {
          if (messagesAreSimilar(messages1[k], messages2[j])) {
            // messages1[i..k-1] are removals
            for (let l = i; l < k; l++) {
              diffs.push({
                type: 'removed',
                index1: l,
                message1: messages1[l]
              });
            }
            i = k;
            foundMatch = true;
            break;
          }
        }
      }

      if (!foundMatch) {
        // No match found, treat as removal then addition
        diffs.push({
          type: 'removed',
          index1: i,
          message1: messages1[i]
        });
        i++;
      }
    }
  }

  return diffs;
}

export function RequestCompareModal({ request1, request2, onClose }: RequestCompareModalProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    summary: true,
    messages: true,
    system: false,
    tools: false
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const messages1 = request1.body?.messages || [];
  const messages2 = request2.body?.messages || [];

  const messageDiffs = useMemo(() => computeMessageDiff(messages1, messages2), [messages1, messages2]);

  const diffStats = useMemo(() => {
    const stats = {
      added: 0,
      removed: 0,
      modified: 0,
      unchanged: 0
    };
    messageDiffs.forEach(diff => {
      stats[diff.type]++;
    });
    return stats;
  }, [messageDiffs]);

  const getModelDisplay = (request: Request) => {
    const model = request.routedModel || request.body?.model || 'Unknown';
    if (model.includes('opus')) return { name: 'Opus', color: 'text-purple-600' };
    if (model.includes('sonnet')) return { name: 'Sonnet', color: 'text-indigo-600' };
    if (model.includes('haiku')) return { name: 'Haiku', color: 'text-teal-600' };
    return { name: model, color: 'text-gray-600' };
  };

  const model1 = getModelDisplay(request1);
  const model2 = getModelDisplay(request2);

  return (
    <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-7xl w-full max-h-[95vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <GitCompare className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">Compare Requests</h3>
              <div className="flex items-center space-x-2 text-sm">
                <span className={`font-medium ${model1.color}`}>{model1.name}</span>
                <ArrowRight className="w-4 h-4 text-gray-400" />
                <span className={`font-medium ${model2.color}`}>{model2.name}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Summary Section */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div
              className="bg-gray-50 px-4 py-3 border-b border-gray-200 cursor-pointer"
              onClick={() => toggleSection('summary')}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center space-x-2">
                  <Brain className="w-4 h-4 text-blue-600" />
                  <span>Comparison Summary</span>
                </h4>
                {expandedSections.summary ? (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
              </div>
            </div>
            {expandedSections.summary && (
              <div className="p-4">
                {/* Stats */}
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-center space-x-1 mb-1">
                      <Plus className="w-4 h-4 text-green-600" />
                      <span className="text-lg font-bold text-green-700">{diffStats.added}</span>
                    </div>
                    <div className="text-xs text-green-600">Added</div>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-center space-x-1 mb-1">
                      <Minus className="w-4 h-4 text-red-600" />
                      <span className="text-lg font-bold text-red-700">{diffStats.removed}</span>
                    </div>
                    <div className="text-xs text-red-600">Removed</div>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-center space-x-1 mb-1">
                      <Equal className="w-4 h-4 text-yellow-600" />
                      <span className="text-lg font-bold text-yellow-700">{diffStats.modified}</span>
                    </div>
                    <div className="text-xs text-yellow-600">Modified</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-center space-x-1 mb-1">
                      <Equal className="w-4 h-4 text-gray-600" />
                      <span className="text-lg font-bold text-gray-700">{diffStats.unchanged}</span>
                    </div>
                    <div className="text-xs text-gray-600">Unchanged</div>
                  </div>
                </div>

                {/* Request comparison */}
                <div className="grid grid-cols-2 gap-4">
                  <RequestSummaryCard request={request1} label="Request #1" />
                  <RequestSummaryCard request={request2} label="Request #2" />
                </div>
              </div>
            )}
          </div>

          {/* Messages Diff Section */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div
              className="bg-gray-50 px-4 py-3 border-b border-gray-200 cursor-pointer"
              onClick={() => toggleSection('messages')}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center space-x-2">
                  <MessageCircle className="w-4 h-4 text-blue-600" />
                  <span>Message Differences</span>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    {messages1.length} vs {messages2.length} messages
                  </span>
                </h4>
                {expandedSections.messages ? (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
              </div>
            </div>
            {expandedSections.messages && (
              <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
                {messageDiffs.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No messages to compare</p>
                  </div>
                ) : (
                  messageDiffs.map((diff, index) => (
                    <MessageDiffRow key={index} diff={diff} />
                  ))
                )}
              </div>
            )}
          </div>

          {/* System Prompts Comparison */}
          {(request1.body?.system || request2.body?.system) && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div
                className="bg-gray-50 px-4 py-3 border-b border-gray-200 cursor-pointer"
                onClick={() => toggleSection('system')}
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-900 flex items-center space-x-2">
                    <Cpu className="w-4 h-4 text-yellow-600" />
                    <span>System Prompts</span>
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                      {request1.body?.system?.length || 0} vs {request2.body?.system?.length || 0}
                    </span>
                  </h4>
                  {expandedSections.system ? (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  )}
                </div>
              </div>
              {expandedSections.system && (
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h5 className="text-xs font-medium text-gray-500 mb-2">Request #1</h5>
                      {request1.body?.system?.map((sys, i) => (
                        <div key={i} className="bg-yellow-50 border border-yellow-200 rounded p-2 mb-2 text-xs">
                          <pre className="whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto">
                            {sys.text.slice(0, 500)}{sys.text.length > 500 ? '...' : ''}
                          </pre>
                        </div>
                      )) || <div className="text-gray-400 text-xs">No system prompt</div>}
                    </div>
                    <div>
                      <h5 className="text-xs font-medium text-gray-500 mb-2">Request #2</h5>
                      {request2.body?.system?.map((sys, i) => (
                        <div key={i} className="bg-yellow-50 border border-yellow-200 rounded p-2 mb-2 text-xs">
                          <pre className="whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto">
                            {sys.text.slice(0, 500)}{sys.text.length > 500 ? '...' : ''}
                          </pre>
                        </div>
                      )) || <div className="text-gray-400 text-xs">No system prompt</div>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tools Comparison */}
          {(request1.body?.tools || request2.body?.tools) && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div
                className="bg-gray-50 px-4 py-3 border-b border-gray-200 cursor-pointer"
                onClick={() => toggleSection('tools')}
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-900 flex items-center space-x-2">
                    <Settings className="w-4 h-4 text-indigo-600" />
                    <span>Available Tools</span>
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                      {request1.body?.tools?.length || 0} vs {request2.body?.tools?.length || 0}
                    </span>
                  </h4>
                  {expandedSections.tools ? (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  )}
                </div>
              </div>
              {expandedSections.tools && (
                <div className="p-4">
                  <ToolsComparison
                    tools1={request1.body?.tools || []}
                    tools2={request2.body?.tools || []}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Request summary card
function RequestSummaryCard({ request, label }: { request: Request; label: string }) {
  const model = request.routedModel || request.body?.model || 'Unknown';
  const tokens = request.response?.body?.usage;
  const totalTokens = (tokens?.input_tokens || 0) + (tokens?.output_tokens || 0);

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div className="text-xs font-medium text-gray-500 mb-2">{label}</div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Model:</span>
          <span className="font-medium">{model.split('-').slice(-1)[0] || model}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Messages:</span>
          <span className="font-medium">{request.body?.messages?.length || 0}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Tokens:</span>
          <span className="font-medium">{totalTokens.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Response Time:</span>
          <span className="font-medium">{((request.response?.responseTime || 0) / 1000).toFixed(2)}s</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Timestamp:</span>
          <span className="font-medium text-xs">{new Date(request.timestamp).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// Message diff row component
function MessageDiffRow({ diff }: { diff: MessageDiff }) {
  const [expanded, setExpanded] = useState(diff.type !== 'unchanged');

  const roleIcons = {
    'user': User,
    'assistant': Bot,
    'system': Settings
  };

  const getDiffStyles = () => {
    switch (diff.type) {
      case 'added':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          icon: <Plus className="w-4 h-4 text-green-600" />,
          label: 'Added',
          labelBg: 'bg-green-100 text-green-700'
        };
      case 'removed':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          icon: <Minus className="w-4 h-4 text-red-600" />,
          label: 'Removed',
          labelBg: 'bg-red-100 text-red-700'
        };
      case 'modified':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          icon: <Equal className="w-4 h-4 text-yellow-600" />,
          label: 'Modified',
          labelBg: 'bg-yellow-100 text-yellow-700'
        };
      default:
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          icon: <Equal className="w-4 h-4 text-gray-400" />,
          label: 'Unchanged',
          labelBg: 'bg-gray-100 text-gray-600'
        };
    }
  };

  const styles = getDiffStyles();
  const message = diff.message1 || diff.message2;
  const role = message?.role || 'unknown';
  const Icon = roleIcons[role as keyof typeof roleIcons] || User;

  return (
    <div className={`${styles.bg} border ${styles.border} rounded-lg overflow-hidden`}>
      <div
        className="px-3 py-2 flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center space-x-2">
          {styles.icon}
          <div className="w-6 h-6 bg-white rounded flex items-center justify-center">
            <Icon className="w-3 h-3 text-gray-600" />
          </div>
          <span className="text-sm font-medium capitalize">{role}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${styles.labelBg}`}>
            {styles.label}
          </span>
          {diff.index1 !== undefined && (
            <span className="text-xs text-gray-500">#{diff.index1 + 1}</span>
          )}
          {diff.index2 !== undefined && diff.index1 !== diff.index2 && (
            <span className="text-xs text-gray-500">
              {diff.index1 !== undefined ? ` → #${diff.index2 + 1}` : `#${diff.index2 + 1}`}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        )}
      </div>
      {expanded && (
        <div className="px-3 pb-3">
          {diff.type === 'modified' ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-red-50 border border-red-200 rounded p-2">
                <div className="text-xs font-medium text-red-700 mb-1">Before</div>
                <div className="text-sm">
                  <MessageContent content={diff.message1?.content} />
                </div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded p-2">
                <div className="text-xs font-medium text-green-700 mb-1">After</div>
                <div className="text-sm">
                  <MessageContent content={diff.message2?.content} />
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded p-2 border border-gray-200">
              <div className="text-sm">
                <MessageContent content={message?.content} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Tools comparison component
function ToolsComparison({ tools1, tools2 }: { tools1: any[]; tools2: any[] }) {
  const toolNames1 = new Set(tools1.map(t => t.name));
  const toolNames2 = new Set(tools2.map(t => t.name));

  const added = tools2.filter(t => !toolNames1.has(t.name));
  const removed = tools1.filter(t => !toolNames2.has(t.name));
  const common = tools1.filter(t => toolNames2.has(t.name));

  return (
    <div className="space-y-4">
      {added.length > 0 && (
        <div>
          <h5 className="text-xs font-medium text-green-700 mb-2 flex items-center space-x-1">
            <Plus className="w-3 h-3" />
            <span>Added Tools ({added.length})</span>
          </h5>
          <div className="flex flex-wrap gap-2">
            {added.map((tool, i) => (
              <span key={i} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                {tool.name}
              </span>
            ))}
          </div>
        </div>
      )}
      {removed.length > 0 && (
        <div>
          <h5 className="text-xs font-medium text-red-700 mb-2 flex items-center space-x-1">
            <Minus className="w-3 h-3" />
            <span>Removed Tools ({removed.length})</span>
          </h5>
          <div className="flex flex-wrap gap-2">
            {removed.map((tool, i) => (
              <span key={i} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                {tool.name}
              </span>
            ))}
          </div>
        </div>
      )}
      {common.length > 0 && (
        <div>
          <h5 className="text-xs font-medium text-gray-600 mb-2 flex items-center space-x-1">
            <Equal className="w-3 h-3" />
            <span>Common Tools ({common.length})</span>
          </h5>
          <div className="flex flex-wrap gap-2">
            {common.map((tool, i) => (
              <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                {tool.name}
              </span>
            ))}
          </div>
        </div>
      )}
      {tools1.length === 0 && tools2.length === 0 && (
        <div className="text-center text-gray-500 py-4">
          <Settings className="w-6 h-6 mx-auto mb-1 opacity-50" />
          <p className="text-xs">No tools defined in either request</p>
        </div>
      )}
    </div>
  );
}
