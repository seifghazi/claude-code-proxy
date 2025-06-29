import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, Code, FileText, Database, AlertCircle } from 'lucide-react';
import { ToolResult } from './ToolResult';
import { ToolUse } from './ToolUse';
import { ImageContent } from './ImageContent';
import { formatLargeText } from '../utils/formatters';

interface ContentItem {
  type: string;
  text?: string;
  content?: any;
  name?: string;
  id?: string;
  input?: Record<string, any>;
  tool_call_id?: string;
  is_error?: boolean;
}

interface MessageContentProps {
  content: ContentItem | ContentItem[] | string;
}

export function MessageContent({ content }: MessageContentProps) {
  // Handle string content
  if (typeof content === 'string') {
    // Check if content contains system reminders
    if (content.includes('<system-reminder>')) {
      return <SystemReminderContent content={content} />;
    }
    
    return (
      <div 
        className="text-gray-700 bg-white rounded-lg p-4 border border-gray-200 shadow-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: formatLargeText(content) }}
      />
    );
  }

  // Handle array of content items
  if (Array.isArray(content)) {
    return (
      <div className="space-y-4">
        {content.map((item, index) => (
          <div key={index} className="content-block">
            <MessageContent content={item} />
          </div>
        ))}
      </div>
    );
  }

  // Handle single content item
  if (content && typeof content === 'object') {
    switch (content.type) {
      case 'text':
        // Check if this text contains tool definitions
        if (content.text && content.text.includes('<functions>')) {
          return <ToolDefinitions text={content.text} />;
        }
        // Check if this text contains system reminders
        if (content.text && content.text.includes('<system-reminder>')) {
          return <SystemReminderContent content={content.text} />;
        }
        return (
          <div 
            className="text-gray-700 bg-white rounded-lg p-4 border border-gray-200 shadow-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: formatLargeText(content.text || '') }}
          />
        );

      case 'tool_use':
        return (
          <ToolUse
            name={content.name || 'Unknown Tool'}
            id={content.id || 'unknown'}
            input={content.input || {}}
            text={content.text}
          />
        );

      case 'tool_result':
        // Handle both content.text and content.content structures
        const resultContent = content.text || content.content || content;
        return (
          <ToolResult
            content={resultContent}
            toolId={content.tool_call_id || content.id}
            isError={content.is_error || false}
          />
        );

      case 'image':
        return <ImageContent content={content} />;

      default:
        return (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Code className="w-4 h-4 text-amber-600" />
              <span className="text-amber-700 font-medium text-sm">Unknown content type: {content.type}</span>
            </div>
            <details className="cursor-pointer">
              <summary className="text-xs text-amber-600 hover:text-amber-800 underline transition-colors">
                Show raw content
              </summary>
              <pre className="mt-2 text-xs overflow-x-auto bg-white rounded p-3 border border-amber-200 font-mono">
                {JSON.stringify(content, null, 2)}
              </pre>
            </details>
          </div>
        );
    }
  }

  // Fallback
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div className="flex items-center space-x-2 mb-2">
        <FileText className="w-4 h-4 text-gray-500" />
        <span className="text-gray-600 font-medium text-sm">Unable to render content</span>
      </div>
      <details className="cursor-pointer">
        <summary className="text-xs text-blue-600 hover:text-blue-800 underline transition-colors">
          Show raw content
        </summary>
        <pre className="mt-2 text-xs overflow-x-auto bg-white rounded p-3 border border-gray-200 font-mono">
          {JSON.stringify(content, null, 2)}
        </pre>
      </details>
    </div>
  );
}

// Component to handle tool definitions in system prompts
function ToolDefinitions({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const functionsMatch = text.match(/<functions>([\s\S]*?)<\/functions>/);
  if (!functionsMatch) {
    return (
      <div 
        className="text-gray-700 whitespace-pre-wrap bg-white rounded-lg p-4 border border-gray-200 shadow-sm"
        dangerouslySetInnerHTML={{ __html: formatLargeText(text) }}
      />
    );
  }

  const functionsText = functionsMatch[1];
  const beforeFunctions = text.substring(0, functionsMatch.index!);
  const afterFunctions = text.substring(functionsMatch.index! + functionsMatch[0].length);

  // Parse individual function definitions
  const functionMatches = [...functionsText.matchAll(/<function>([\s\S]*?)<\/function>/g)];
  
  return (
    <div className="space-y-4">
      {beforeFunctions && (
        <div 
          className="text-gray-700 max-h-64 overflow-y-auto bg-white rounded-lg p-4 border border-gray-200 shadow-sm"
          dangerouslySetInnerHTML={{ __html: formatLargeText(beforeFunctions) }}
        />
      )}
      
      <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl flex items-center justify-center shadow-sm">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-emerald-900 font-semibold text-base">Available Tools</span>
                <Database className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-sm text-emerald-700">
                {functionMatches.length} tools defined for this conversation
              </div>
            </div>
          </div>
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center space-x-2 text-xs text-emerald-700 hover:text-emerald-900 bg-white hover:bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200 transition-all duration-200"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <span>{isExpanded ? 'Hide Tools' : 'Show Tools'}</span>
          </button>
        </div>
        
        {isExpanded && (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {functionMatches.map((match, index) => (
              <ToolDefinition key={index} functionText={match[1]} index={index} />
            ))}
          </div>
        )}
      </div>
      
      {afterFunctions && (
        <div 
          className="text-gray-700 max-h-64 overflow-y-auto bg-white rounded-lg p-4 border border-gray-200 shadow-sm"
          dangerouslySetInnerHTML={{ __html: formatLargeText(afterFunctions) }}
        />
      )}
    </div>
  );
}

// Component to render individual tool definition
function ToolDefinition({ functionText, index }: { functionText: string; index: number }) {
  const [showDetails, setShowDetails] = useState(false);
  
  try {
    const toolDef = JSON.parse(functionText);
    const paramCount = toolDef.parameters?.properties ? Object.keys(toolDef.parameters.properties).length : 0;
    const requiredParams = toolDef.parameters?.required || [];
    
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-all duration-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Wrench className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <span className="text-emerald-700 font-mono text-sm font-semibold">{toolDef.name}</span>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full border border-gray-200">
                  {paramCount} params
                </span>
                {requiredParams.length > 0 && (
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full border border-orange-200">
                    {requiredParams.length} required
                  </span>
                )}
              </div>
            </div>
          </div>
          <button 
            onClick={() => setShowDetails(!showDetails)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            {showDetails ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </div>
        
        <div className="text-gray-600 text-sm mb-3 leading-relaxed">
          {toolDef.description || 'No description available'}
        </div>
        
        {showDetails && (
          <div className="space-y-3 pt-3 border-t border-gray-200">
            {toolDef.parameters?.properties && (
              <div>
                <div className="text-sm font-medium text-gray-900 mb-2">Parameters:</div>
                <div className="space-y-2">
                  {Object.entries(toolDef.parameters.properties).map(([name, param]: [string, any]) => (
                    <div key={name} className="flex items-start space-x-3 p-2 bg-gray-50 rounded border border-gray-200">
                      <div className="flex items-center space-x-2 min-w-0 flex-1">
                        <span className="font-mono text-xs text-blue-600 font-medium">{name}</span>
                        {requiredParams.includes(name) ? (
                          <span className="text-xs bg-red-100 text-red-700 px-1 py-0.5 rounded border border-red-200">
                            required
                          </span>
                        ) : (
                          <span className="text-xs bg-gray-100 text-gray-600 px-1 py-0.5 rounded border border-gray-200">
                            optional
                          </span>
                        )}
                        <span className="text-xs text-gray-500">{param.type || 'any'}</span>
                      </div>
                      <div className="text-xs text-gray-600 flex-1 min-w-0">
                        {param.description || 'No description'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <details className="cursor-pointer">
              <summary className="text-xs text-gray-600 hover:text-gray-800 underline transition-colors">
                Show raw definition
              </summary>
              <pre className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded text-xs overflow-x-auto font-mono">
                {JSON.stringify(toolDef, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    );
  } catch (e) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center space-x-2 mb-2">
          <Code className="w-4 h-4 text-red-600" />
          <span className="text-red-700 font-medium text-sm">Invalid Tool Definition #{index + 1}</span>
        </div>
        <pre className="text-gray-700 text-xs overflow-x-auto bg-white rounded p-3 border border-red-200 font-mono">
          {functionText}
        </pre>
      </div>
    );
  }
}

// Component to handle system reminder content
function SystemReminderContent({ content }: { content: string }) {
  const [showReminders, setShowReminders] = useState(false);
  
  // Split content into regular and system reminder parts
  const parts: Array<{ type: 'text' | 'reminder'; content: string }> = [];
  const reminderRegex = /<system-reminder>([\s\S]*?)<\/system-reminder>/g;
  let lastIndex = 0;
  let match;
  
  while ((match = reminderRegex.exec(content)) !== null) {
    // Add text before the reminder
    if (match.index > lastIndex) {
      const textPart = content.substring(lastIndex, match.index).trim();
      if (textPart) {
        parts.push({ type: 'text', content: textPart });
      }
    }
    
    // Add the reminder
    parts.push({ type: 'reminder', content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }
  
  // Add any remaining text
  if (lastIndex < content.length) {
    const textPart = content.substring(lastIndex).trim();
    if (textPart) {
      parts.push({ type: 'text', content: textPart });
    }
  }
  
  const reminderCount = parts.filter(p => p.type === 'reminder').length;
  const hasNonReminderContent = parts.some(p => p.type === 'text');
  
  return (
    <div className="space-y-3">
      {/* Regular content */}
      {parts.filter(p => p.type === 'text').map((part, index) => (
        <div 
          key={`text-${index}`}
          className="text-gray-700 bg-white rounded-lg p-4 border border-gray-200 shadow-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: formatLargeText(part.content) }}
        />
      ))}
      
      {/* System reminder indicator/toggle */}
      {reminderCount > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <button
            onClick={() => setShowReminders(!showReminders)}
            className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-800 transition-colors w-full"
          >
            <AlertCircle className="w-4 h-4 text-gray-500" />
            <span className="font-medium">
              {reminderCount} system reminder{reminderCount > 1 ? 's' : ''}
            </span>
            {showReminders ? (
              <ChevronDown className="w-4 h-4 ml-auto" />
            ) : (
              <ChevronRight className="w-4 h-4 ml-auto" />
            )}
          </button>
          
          {/* System reminder content */}
          {showReminders && (
            <div className="mt-3 space-y-2">
              {parts.filter(p => p.type === 'reminder').map((part, index) => (
                <div 
                  key={`reminder-${index}`}
                  className="bg-gray-100 rounded p-3 text-xs text-gray-600 font-mono border border-gray-300"
                >
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="w-3 h-3 text-gray-500 mt-0.5 flex-shrink-0" />
                    <div className="overflow-x-auto whitespace-pre-wrap">{part.content}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
    </div>
  );
}