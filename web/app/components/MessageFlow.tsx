import { useState } from 'react';
import { User, Bot, Settings, ChevronDown, ChevronRight, Clock, Sparkles, ArrowDown } from 'lucide-react';
import { MessageContent } from './MessageContent';
import { formatLargeText } from '../utils/formatters';

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: any;
  timestamp: string;
  turnNumber?: number;
  isNewInTurn?: boolean;
  isDuplicate?: boolean;
}

interface MessageFlowProps {
  message: ConversationMessage;
  index: number;
  isLast: boolean;
  totalMessages: number;
}

export function MessageFlow({ message, index, isLast, totalMessages }: MessageFlowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getRoleConfig = () => {
    switch (message.role) {
      case 'user':
        return {
          icon: <User className="w-5 h-5 text-blue-600" />,
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          accentColor: 'border-l-blue-500',
          textColor: 'text-blue-900',
          titleColor: 'text-blue-700',
          name: 'User'
        };
      case 'assistant':
        return {
          icon: <Bot className="w-5 h-5 text-gray-600" />,
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          accentColor: 'border-l-gray-500',
          textColor: 'text-gray-900',
          titleColor: 'text-gray-700',
          name: 'Assistant'
        };
      case 'system':
        return {
          icon: <Settings className="w-5 h-5 text-amber-600" />,
          bgColor: 'bg-amber-50',
          borderColor: 'border-amber-200',
          accentColor: 'border-l-amber-500',
          textColor: 'text-amber-900',
          titleColor: 'text-amber-700',
          name: 'System'
        };
      default:
        return {
          icon: <Bot className="w-5 h-5 text-gray-600" />,
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          accentColor: 'border-l-gray-500',
          textColor: 'text-gray-900',
          titleColor: 'text-gray-700',
          name: 'Unknown'
        };
    }
  };

  const roleConfig = getRoleConfig();

  // Helper function to check if content is a system reminder
  const isSystemReminder = (text: string) => {
    return text.includes('<system-reminder>') || text.includes('</system-reminder>');
  };

  // Helper function to extract non-system-reminder content for preview
  const extractNonSystemContent = (content: string) => {
    // Split by system-reminder tags and filter out the reminder parts
    const parts = content.split(/<system-reminder>[\s\S]*?<\/system-reminder>/g);
    return parts.filter(part => part.trim()).join(' ').trim();
  };

  // Determine if content should be expandable
  const getContentPreview = () => {
    if (typeof message.content === 'string') {
      const nonSystemContent = extractNonSystemContent(message.content);
      if (!nonSystemContent && isSystemReminder(message.content)) {
        return "[System reminder]";
      }
      return nonSystemContent.length > 300 ? nonSystemContent.substring(0, 300) + '...' : nonSystemContent;
    }
    
    if (Array.isArray(message.content)) {
      const allText = message.content
        .filter(c => c.type === 'text' && c.text)
        .map(c => {
          const nonSystemContent = extractNonSystemContent(c.text);
          return nonSystemContent;
        })
        .filter(text => text)
        .join('\\n');
        
      if (!allText) {
        const hasToolUse = message.content.some(c => c.type === 'tool_use');
        const hasSystemReminder = message.content.some(c => c.type === 'text' && c.text && isSystemReminder(c.text));
        if (hasToolUse) return "[Tool call]";
        if (hasSystemReminder) return "[System reminder]";
        return "[Context message]";
      }

      return allText.length > 300 ? allText.substring(0, 300) + '...' : allText;
    }
    
    if (message.content?.type) {
      return `[${message.content.type.replace('_', ' ')}]`;
    }

    try {
      const str = JSON.stringify(message.content, null, 2);
      return str.length > 300 ? str.substring(0, 300) + '...' : str;
    } catch {
      return '[Complex content]';
    }
  };

  const shouldShowExpander = () => {
    if (typeof message.content === 'string') {
      // Show expander if content is long OR contains system reminders
      return message.content.length > 300 || isSystemReminder(message.content);
    }
    
    if (Array.isArray(message.content)) {
       const allText = message.content
        .filter(c => c.type === 'text' && c.text)
        .map(c => c.text)
        .join('\\n');
      return allText.length > 300 || message.content.length > 1;
    }
    
    return true;
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="relative">
      {/* Connection line to next message */}
      {!isLast && (
        <div className="absolute left-5 top-16 w-0.5 h-8 bg-gray-200"></div>
      )}
      
      {/* Message container */}
      <div className={`relative ${message.isNewInTurn ? 'animate-in slide-in-from-left-2' : ''}`}>
        {/* New message indicator */}
        {message.isNewInTurn && (
          <div className="absolute -left-2 top-0 w-1 h-full bg-gradient-to-b from-blue-500 to-transparent rounded-full opacity-60"></div>
        )}
        
        <div className={`
          ${roleConfig.bgColor} 
          ${roleConfig.borderColor} 
          ${roleConfig.accentColor}
          border border-l-4 rounded-xl p-5 
          ${message.isNewInTurn ? 'ring-2 ring-blue-200/30 shadow-md' : 'shadow-sm'}
          transition-all duration-200 hover:shadow-md
        `}>
          <div className="flex items-start space-x-4">
            {/* Avatar */}
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border-2 border-gray-200 shadow-sm">
                {roleConfig.icon}
              </div>
            </div>
            
            {/* Message content */}
            <div className="flex-1 min-w-0">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <span className={`font-semibold text-lg ${roleConfig.titleColor}`}>
                    {roleConfig.name}
                  </span>
                  {message.isNewInTurn && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full border border-green-200 font-medium">
                      NEW
                    </span>
                  )}
                  <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded-full border border-gray-200">
                    #{index + 1}
                  </span>
                  {message.turnNumber && (
                    <span className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-full border border-purple-200">
                      Turn {message.turnNumber}
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    <span>{formatTimestamp(message.timestamp)}</span>
                  </div>
                </div>
              </div>
              
              {/* Content */}
              <div className="space-y-4">
                {shouldShowExpander() && !isExpanded ? (
                  <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                    <div className="text-sm text-gray-700 leading-relaxed">
                      {typeof message.content === 'string' ? (
                        <div dangerouslySetInnerHTML={{ __html: formatLargeText(getContentPreview()) }} />
                      ) : (
                        <div className="space-y-2">
                          <div className="text-gray-600 font-medium">
                            {Array.isArray(message.content) ? (
                              `Message contains ${message.content.length} content blocks`
                            ) : (
                              'Complex content'
                            )}
                          </div>
                          {Array.isArray(message.content) && (
                            <div className="text-xs text-gray-500 pl-2 border-l-2 border-gray-200">
                              {message.content.map(item => item.type).join(' → ')}
                            </div>
                          )}
                          <div className="text-xs text-gray-500 mt-1 italic">
                            {getContentPreview()}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setIsExpanded(true)}
                      className="mt-3 flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                      <span>Show full content</span>
                    </button>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                    {shouldShowExpander() && isExpanded && (
                      <div className="mb-3 pb-3 border-b border-gray-200">
                        <button
                          onClick={() => setIsExpanded(false)}
                          className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                        >
                          <ChevronDown className="w-4 h-4" />
                          <span>Collapse</span>
                        </button>
                      </div>
                    )}
                    <MessageContent content={message.content} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Flow indicator */}
        {!isLast && (
          <div className="flex items-center justify-center py-2">
            <ArrowDown className="w-4 h-4 text-gray-400" />
          </div>
        )}
      </div>
    </div>
  );
} 