import { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle, AlertCircle, FileText, Database, Clock } from 'lucide-react';
import { formatValue, formatJSON, isComplexObject, truncateText } from '../utils/formatters';
import { CodeViewer } from './CodeViewer';

interface ToolResultProps {
  content: any;
  toolId?: string;
  isError?: boolean;
}

export function ToolResult({ content, toolId, isError = false }: ToolResultProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Detect if this is likely code content from a Read tool
  const isCodeContent = (content: string): boolean => {
    if (typeof content !== 'string') return false;
    
    // Check for line numbers pattern (e.g., "     1→" from cat -n output)
    const hasLineNumbers = /^\s*\d+→/m.test(content);
    
    // Check for common code patterns
    const hasCodePatterns = (
      content.includes('function') ||
      content.includes('const ') ||
      content.includes('let ') ||
      content.includes('var ') ||
      content.includes('import ') ||
      content.includes('export ') ||
      content.includes('class ') ||
      content.includes('interface ') ||
      content.includes('type ') ||
      content.includes('def ') ||
      content.includes('if (') ||
      content.includes('for (') ||
      content.includes('while (') ||
      content.includes('{') && content.includes('}')
    );
    
    // Check for file extension indicators in the content
    const hasFileExtension = /\.(js|jsx|ts|tsx|py|rb|go|rs|java|cpp|c|h|cs|php|swift|kt|scala|r|sh|bash|sql|html|css|json|yaml|yml|toml|md|xml)$/m.test(content);
    
    return hasLineNumbers || (hasCodePatterns && content.length > 100);
  };

  // Extract code from cat -n format if present
  const extractCodeFromCatN = (content: string): { code: string; fileName?: string } => {
    if (typeof content !== 'string') return { code: content };
    
    // Check if this is cat -n output
    if (!/^\s*\d+→/m.test(content)) {
      return { code: content };
    }
    
    // Extract the code by removing line numbers
    const lines = content.split('\n');
    const codeLines = lines.map(line => {
      // Match line number pattern and extract the code part
      const match = line.match(/^\s*\d+→(.*)$/);
      return match ? match[1] : line;
    });
    
    return { code: codeLines.join('\n') };
  };

  // Handle different content structures
  const getDisplayContent = () => {
    // If content is a string, return it directly
    if (typeof content === 'string') {
      return content;
    }

    // If content has a 'text' property, use that
    if (content && typeof content === 'object' && 'text' in content) {
      return content.text;
    }

    // If content has a 'content' property, use that
    if (content && typeof content === 'object' && 'content' in content) {
      return content.content;
    }

    // If it's an array, join with newlines
    if (Array.isArray(content)) {
      return content.map(item => formatValue(item)).join('\n');
    }

    // For complex objects, show JSON
    if (isComplexObject(content)) {
      return formatJSON(content);
    }

    // Fallback to string conversion
    return formatValue(content);
  };

  const displayContent = getDisplayContent();
  const isLargeContent = displayContent.length > 500;
  const shouldTruncate = isLargeContent && !isExpanded;
  const truncatedContent = shouldTruncate ? truncateText(displayContent, 500) : displayContent;

  // Determine if content should be rendered as JSON
  const isJSONContent = isComplexObject(content) || (typeof content === 'string' && content.startsWith('{'));
  
  // Check if this is code content
  const isCode = isCodeContent(displayContent);
  const { code: extractedCode } = isCode ? extractCodeFromCatN(displayContent) : { code: displayContent };

  const getResultConfig = () => {
    if (isError) {
      return {
        bgColor: 'bg-gradient-to-r from-red-50 to-pink-50',
        borderColor: 'border-red-200',
        accentColor: 'border-l-red-500',
        iconBg: 'bg-red-100',
        iconColor: 'text-red-600',
        titleColor: 'text-red-900',
        icon: <AlertCircle className="w-5 h-5" />,
        title: 'Tool Error'
      };
    }
    
    return {
      bgColor: 'bg-gradient-to-r from-emerald-50 to-green-50',
      borderColor: 'border-emerald-200',
      accentColor: 'border-l-emerald-500',
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      titleColor: 'text-emerald-900',
      icon: <CheckCircle className="w-5 h-5" />,
      title: 'Tool Result'
    };
  };

  const config = getResultConfig();

  return (
    <div className={`${config.bgColor} ${config.borderColor} ${config.accentColor} border border-l-4 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`w-10 h-10 ${config.iconBg} rounded-xl flex items-center justify-center shadow-sm`}>
            <div className={config.iconColor}>
              {config.icon}
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className={`font-semibold text-base ${config.titleColor}`}>
                {config.title}
              </span>
              <Database className="w-4 h-4 text-gray-500" />
            </div>
            {toolId && (
              <div className="flex items-center space-x-2 mt-1">
                <FileText className="w-3 h-3 text-gray-500" />
                <span className="text-xs text-gray-500 font-mono bg-white px-2 py-1 rounded-md border border-gray-200">
                  {toolId}
                </span>
              </div>
            )}
          </div>
        </div>
        
        {isLargeContent && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center space-x-2 text-xs text-gray-600 hover:text-gray-800 bg-white hover:bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 transition-all duration-200"
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

      {/* Content */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="p-4">
          {/* Content type indicator */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
            <div className="flex items-center space-x-2 text-xs text-gray-600">
              <Clock className="w-3 h-3" />
              <span>Result received</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                {isCode ? 'Code' : isJSONContent ? 'JSON' : 'Text'}
              </span>
              {!isCode && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  {displayContent.length} chars
                </span>
              )}
            </div>
          </div>
          
          {/* Main content */}
          {isCode ? (
            <CodeViewer code={extractedCode} fileName={content.fileName} />
          ) : isJSONContent ? (
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono overflow-x-auto bg-gray-50 rounded-lg p-3 border border-gray-200">
              {truncatedContent}
            </pre>
          ) : (
            <div 
              className="text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed"
              dangerouslySetInnerHTML={{ 
                __html: truncatedContent.replace(/\n/g, '<br>') 
              }}
            />
          )}
          
          {/* Expand/collapse controls */}
          {shouldTruncate && !isCode && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <button
                onClick={() => setIsExpanded(true)}
                className="text-xs text-blue-600 hover:text-blue-800 underline transition-colors"
              >
                Show full content ({displayContent.length.toLocaleString()} characters)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Metadata */}
      {content && typeof content === 'object' && Object.keys(content).length > 1 && (
        <div className="mt-3">
          <details className="cursor-pointer group">
            <summary className="text-xs text-gray-600 hover:text-gray-800 transition-colors flex items-center space-x-1">
              <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
              <span>Show raw data structure</span>
            </summary>
            <div className="mt-2 bg-white rounded-lg border border-gray-200 p-3">
              <pre className="text-xs overflow-x-auto font-mono text-gray-700 bg-gray-50 rounded p-2">
                {formatJSON(content)}
              </pre>
            </div>
          </details>
        </div>
      )}
      
      {/* Result indicator */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <div className={`flex items-center space-x-2 text-xs ${config.titleColor}`}>
          <div className={`w-2 h-2 rounded-full ${isError ? 'bg-red-500' : 'bg-emerald-500'}`}></div>
          <span>{isError ? 'Execution failed' : 'Execution completed'}</span>
        </div>
      </div>
    </div>
  );
}