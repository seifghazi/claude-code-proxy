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
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Formats large text with proper line breaks and structure, optimized for the new conversation flow
 */
export function formatLargeText(text: string): string {
  if (!text) return '';

  // Escape HTML first
  const escaped = escapeHtml(text);

  // Simple, safe formatting - just handle line breaks and basic markdown
  return escaped
    // Preserve existing double line breaks as paragraph breaks
    .replace(/\n\n/g, '</p><p class="mt-3">')
    // Convert single line breaks to <br> tags
    .replace(/\n/g, '<br>')
    // Format inline code (backticks)
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
    // Format bold text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Format italic text
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Wrap in paragraph
    .replace(/^(.*)$/, '<p>$1</p>');
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