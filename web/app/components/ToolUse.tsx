import { useState } from 'react';
import { Wrench, ChevronDown, ChevronRight, Copy, Check, Terminal, Zap } from 'lucide-react';
import { formatValue, formatJSON, isComplexObject } from '../utils/formatters';
import { CodeDiff } from './CodeDiff';
import { TodoList } from './TodoList';

interface ToolUseProps {
  name: string;
  id: string;
  input?: Record<string, any>;
  text?: string;
}

export function ToolUse({ name, id, input = {}, text }: ToolUseProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatJSON({ name, id, input }));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const renderParameterValue = (value: any) => {
    if (typeof value === 'string') {
      if (value.length > 200 || value.includes('\n')) {
        return (
          <div>
            <button 
              className="text-xs text-indigo-600 hover:text-indigo-800 underline mb-2 transition-colors" 
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? 'Hide' : 'Show'} large parameter
            </button>
            {isExpanded && (
              <pre className="bg-gray-50 border border-gray-200 p-3 rounded-lg text-xs max-h-64 overflow-auto font-mono">
                {value}
              </pre>
            )}
          </div>
        );
      }
      return <span className="text-gray-700 text-sm break-all font-mono">{value}</span>;
    }
    
    if (isComplexObject(value)) {
      return (
        <details className="cursor-pointer">
          <summary className="text-xs text-indigo-600 hover:text-indigo-800 underline transition-colors">
            Show object ({Object.keys(value).length} properties)
          </summary>
          <pre className="mt-2 bg-gray-50 border border-gray-200 p-3 rounded-lg text-xs overflow-auto font-mono">
            {formatJSON(value)}
          </pre>
        </details>
      );
    }

    return <span className="text-gray-700 text-sm font-mono">{formatValue(value)}</span>;
  };

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shadow-sm">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-indigo-900 font-semibold text-base">Tool Execution</span>
              <Zap className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="flex items-center space-x-2 mt-1">
              <Terminal className="w-3 h-3 text-indigo-600" />
              <span className="font-mono text-sm text-indigo-700 bg-white px-2 py-1 rounded-md border border-indigo-200 font-medium">
                {name}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500 font-mono bg-white px-2 py-1 rounded-md border border-gray-200">
            {id}
          </span>
          <button
            onClick={handleCopy}
            className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-white transition-all duration-200 rounded-lg border border-transparent hover:border-indigo-200"
            title="Copy tool call details"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
      
      {/* Special handling for Edit tool - show code diff */}
      {name === 'Edit' && input.old_string && input.new_string && (
        <div className="mb-4">
          <div className="text-sm font-semibold text-indigo-900 mb-3">Code Changes</div>
          <CodeDiff 
            oldCode={input.old_string as string} 
            newCode={input.new_string as string}
            fileName={input.file_path as string}
          />
        </div>
      )}
      
      {/* Special handling for Read tool - show code with syntax highlighting */}
      {name === 'Read' && input.file_path && (
        <div className="mb-4">
          <div className="text-sm font-semibold text-indigo-900 mb-3">File Contents</div>
          {/* Note: The actual file content will be in the tool result, not the input */}
          <div className="text-xs text-gray-600 mb-2">
            Reading: <span className="font-mono">{input.file_path}</span>
          </div>
        </div>
      )}
      
      {/* Special handling for TodoWrite tool - show todo list */}
      {name === 'TodoWrite' && input.todos && Array.isArray(input.todos) && (
        <div className="mb-4">
          <div className="text-sm font-semibold text-indigo-900 mb-3">Task Management</div>
          <TodoList todos={input.todos} />
        </div>
      )}
      
      {/* Parameters */}
      {Object.keys(input).length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-indigo-900 flex items-center space-x-2">
              <span>Parameters</span>
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full border border-indigo-200">
                {Object.keys(input).length}
              </span>
            </div>
            {Object.keys(input).length > 2 && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center space-x-1 text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
              </button>
            )}
          </div>
          
          {/* Don't show raw parameters for Edit and TodoWrite tools since we have custom views */}
          {name !== 'Edit' && name !== 'TodoWrite' && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className={`space-y-3 ${!isExpanded && Object.keys(input).length > 2 ? 'max-h-32 overflow-hidden' : ''}`}>
                {Object.entries(input).map(([key, value]) => (
                  <div key={key} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <span className="font-mono text-sm text-indigo-600 pt-0.5 min-w-0 flex-shrink-0 font-medium">
                      {key}:
                    </span>
                    <div className="flex-1 min-w-0">
                      {renderParameterValue(value)}
                    </div>
                  </div>
                ))}
              </div>
              
              {!isExpanded && Object.keys(input).length > 2 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <button
                    onClick={() => setIsExpanded(true)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 underline transition-colors"
                  >
                    Show all {Object.keys(input).length} parameters
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Additional text */}
      {text && (
        <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
          <div className="text-xs text-gray-600 mb-1 font-medium">Additional Information:</div>
          <div className="text-sm text-gray-700">{text}</div>
        </div>
      )}
      
      {/* Tool execution indicator */}
      <div className="mt-4 pt-3 border-t border-indigo-200">
        <div className="flex items-center space-x-2 text-xs text-indigo-700">
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
          <span>Tool execution initiated</span>
        </div>
      </div>
    </div>
  );
}