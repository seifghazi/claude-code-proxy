import { MessageCircle, Clock, Sparkles, ChevronDown, ChevronRight, GitBranch, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { MessageFlow } from './MessageFlow'
import { formatLargeText } from '../utils/formatters';

interface ConversationThreadProps {
  conversation: {
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
      type: string;
      message: any;
      uuid: string;
      timestamp: string;
    }>;
    startTime: string;
    endTime: string;
    messageCount: number;
  };
}

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: any;
  timestamp: string;
  turnNumber?: number;
  isNewInTurn?: boolean;
  isDuplicate?: boolean;
}

export function ConversationThread({ conversation }: ConversationThreadProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['flow']));

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  // Extract all messages and analyze conversation flow from JSONL messages
  const analyzeConversationFlow = () => {
    const allMessages: ConversationMessage[] = [];
    
    // Check if messages exist
    if (!conversation.messages || !Array.isArray(conversation.messages)) {
      console.warn('No messages found in conversation:', conversation);
      return allMessages;
    }
    
    // Convert JSONL messages to conversation messages
    conversation.messages.forEach((msg) => {
      // Parse the message content
      let parsedMessage: any;
      try {
        parsedMessage = typeof msg.message === 'string' ? JSON.parse(msg.message) : msg.message;
      } catch (e) {
        parsedMessage = msg.message;
      }

      // Determine the role based on the type field
      let role: 'user' | 'assistant' | 'system' = 'user';
      if (msg.type === 'assistant') {
        role = 'assistant';
      } else if (msg.type === 'system') {
        role = 'system';
      }

      // Extract content based on message structure
      let content = null;
      if (parsedMessage) {
        if (parsedMessage.content) {
          content = parsedMessage.content;
        } else if (parsedMessage.text) {
          content = parsedMessage.text;
        } else if (Array.isArray(parsedMessage)) {
          content = parsedMessage;
        } else if (typeof parsedMessage === 'string') {
          content = parsedMessage;
        } else {
          content = parsedMessage;
        }
      }

      if (content) {
        allMessages.push({
          role,
          content,
          timestamp: msg.timestamp,
          turnNumber: undefined, // Not available in JSONL format
          isNewInTurn: true,
        });
      }
    });
    
    return allMessages;
  };

  const messages = analyzeConversationFlow();

  if (messages.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <MessageCircle className="w-10 h-10 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-600 mb-2">No messages found</h3>
        <p className="text-sm text-gray-500">This conversation appears to be empty</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Conversation Flow Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection('flow')}
        >
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                <span>Conversation Flow</span>
                <div className="flex items-center space-x-2 text-sm">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  <span className="text-gray-600">
                    Conversation processed - 
                    <span className="font-semibold text-purple-700"> {messages.length}</span> messages
                  </span>
                </div>
              </h4>
              <p className="text-sm text-gray-600">
                {messages.length} messages • {conversation.messageCount} total
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
              {new Date(messages[messages.length - 1]?.timestamp).toLocaleTimeString()}
            </span>
            {expandedSections.has('flow') ? (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>
      </div>

      {/* Conversation Messages */}
      {expandedSections.has('flow') && (
        <div className="space-y-1">
          {messages.map((message, index) => (
            <MessageFlow
              key={`${conversation.sessionId}-${index}`}
              message={message}
              index={index}
              isLast={index === messages.length - 1}
              totalMessages={messages.length}
            />
          ))}
          
          {/* Conversation Summary */}
          <div className="mt-8 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-blue-900">Conversation Summary</div>
                  <div className="text-xs text-blue-700">
                    {messages.length} messages • {conversation.messageCount} total messages
                  </div>
                </div>
              </div>
              <div className="text-right text-xs text-blue-700">
                <div className="flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>Latest: {new Date().toLocaleTimeString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}