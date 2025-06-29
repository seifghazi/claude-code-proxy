/**
 * Utility functions for formatting and displaying data
 */

/**
 * Safely converts any value to a formatted string for display
 */
export function formatValue(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

/**
 * Formats JSON with proper indentation and returns a formatted string
 */
export function formatJSON(obj: any, maxLength: number = 1000): string {
  try {
    const jsonString = JSON.stringify(obj, null, 2);
    if (jsonString.length > maxLength) {
      return jsonString.substring(0, maxLength) + '...';
    }
    return jsonString;
  } catch (error) {
    return String(obj);
  }
}

/**
 * Escapes HTML characters to prevent XSS
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Formats large text with proper line breaks and structure, optimized for the new conversation flow
 */
export function formatLargeText(text: string): string {
  if (!text) return '';
  
  // Escape HTML first
  const escaped = escapeHtml(text);
  
  // Format the text with proper spacing and structure
  return escaped
    // Preserve existing double line breaks
    .replace(/\n\n/g, '<br><br>')
    // Convert single line breaks to single <br> tags
    .replace(/\n/g, '<br>')
    // Format bullet points with modern styling
    .replace(/^(\s*)([-*•])\s+(.+)$/gm, '$1<span class="inline-flex items-center space-x-2"><span class="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0"></span><span>$3</span></span>')
    // Format numbered lists with modern styling
    .replace(/^(\s*)(\d+)\.\s+(.+)$/gm, '$1<span class="inline-flex items-center space-x-2"><span class="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-semibold">$2</span><span>$3</span></span>')
    // Format headers with better typography
    .replace(/^([A-Z][^<\n]*:)(<br>|$)/gm, '<div class="font-semibold text-gray-900 mt-4 mb-2 border-b border-gray-200 pb-1">$1</div>$2')
    // Format code blocks with better styling
    .replace(/\b([A-Z_]{3,})\b/g, '<code class="bg-gradient-to-r from-gray-100 to-blue-50 border border-gray-200 px-2 py-0.5 rounded-md text-xs text-blue-700 font-mono font-medium">$1</code>')
    // Format file paths and technical terms
    .replace(/\b([a-zA-Z0-9_-]+\.[a-zA-Z]{2,4})\b/g, '<span class="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-xs font-mono border border-slate-200">$1</span>')
    // Format URLs with modern link styling
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" class="text-blue-600 hover:text-blue-800 underline underline-offset-2 decoration-blue-300 hover:decoration-blue-500 transition-colors font-medium" target="_blank" rel="noopener noreferrer">$1</a>')
    // Format quoted text
    .replace(/^(\s*)([""](.+?)[""])/gm, '$1<blockquote class="border-l-4 border-blue-200 bg-blue-50 pl-4 py-2 my-2 italic text-gray-700 rounded-r">$3</blockquote>')
    // Add proper spacing around paragraphs
    .replace(/(<br><br>)/g, '<div class="my-4"></div>')
    // Clean up any excessive spacing
    .replace(/(<br>\s*){3,}/g, '<br><br>')
    // Format emphasis patterns
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em class="italic text-gray-700">$1</em>')
    // Format inline code
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono border border-gray-200">$1</code>');
}

/**
 * Determines if a value is a complex object that should be JSON-formatted
 */
export function isComplexObject(value: any): boolean {
  return value !== null && 
         typeof value === 'object' && 
         !Array.isArray(value) && 
         Object.keys(value).length > 0;
}

/**
 * Truncates text to a specified length with ellipsis
 */
export function truncateText(text: string, maxLength: number = 200): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Formats timestamp for display in the conversation flow
 */
export function formatTimestamp(timestamp: string | Date): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    // Less than a minute ago
    if (diff < 60000) {
      return 'Just now';
    }
    
    // Less than an hour ago
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes}m ago`;
    }
    
    // Less than a day ago
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }
    
    // More than a day ago - show time
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  } catch {
    return String(timestamp);
  }
}

/**
 * Formats file size for display
 */
export function formatFileSize(bytes: number): string {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Creates a content preview for message summaries
 */
export function createContentPreview(content: any, maxLength: number = 100): string {
  if (typeof content === 'string') {
    return content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
  }
  
  if (Array.isArray(content)) {
    const textContent = content.find(c => c.type === 'text')?.text || '';
    if (textContent) {
      return textContent.length > maxLength ? textContent.substring(0, maxLength) + '...' : textContent;
    }
    return `${content.length} content blocks`;
  }
  
  if (content && typeof content === 'object') {
    if (content.text) {
      return content.text.length > maxLength ? content.text.substring(0, maxLength) + '...' : content.text;
    }
    return 'Complex content';
  }
  
  return 'No content';
}