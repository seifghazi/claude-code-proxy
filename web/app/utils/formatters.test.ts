import { describe, it, expect } from 'vitest';
import { escapeHtml, formatLargeText } from './formatters';

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes less than', () => {
    expect(escapeHtml('a < b')).toBe('a &lt; b');
  });

  it('escapes greater than', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('He said "hello"')).toBe('He said &quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("It's fine")).toBe("It&#039;s fine");
  });

  it('escapes all special characters together', () => {
    expect(escapeHtml('<script>"alert(\'xss\')&"</script>')).toBe(
      '&lt;script&gt;&quot;alert(&#039;xss&#039;)&amp;&quot;&lt;/script&gt;'
    );
  });
});

describe('formatLargeText', () => {
  it('returns empty string for empty input', () => {
    expect(formatLargeText('')).toBe('');
  });

  it('wraps simple text in paragraph tags', () => {
    expect(formatLargeText('Hello world')).toBe('<p>Hello world</p>');
  });

  it('converts single newlines to br tags', () => {
    expect(formatLargeText('Line1\nLine2')).toBe('<p>Line1<br>Line2</p>');
  });

  it('converts double newlines to paragraph breaks with proper nesting', () => {
    const result = formatLargeText('Line1\n\nLine2');
    expect(result).toBe('<p>Line1</p><p class="mt-3">Line2</p>');
  });

  it('handles multiple paragraph breaks correctly', () => {
    const result = formatLargeText('Para1\n\nPara2\n\nPara3');
    expect(result).toBe('<p>Para1</p><p class="mt-3">Para2</p><p class="mt-3">Para3</p>');
  });

  it('escapes HTML in the input', () => {
    const result = formatLargeText('<script>alert("xss")</script>');
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>');
  });

  it('formats inline code with backticks', () => {
    const result = formatLargeText('Use `code` here');
    expect(result).toContain('<code');
    expect(result).toContain('>code</code>');
  });

  it('formats bold text', () => {
    const result = formatLargeText('This is **bold** text');
    expect(result).toContain('<strong>bold</strong>');
  });

  it('formats italic text', () => {
    const result = formatLargeText('This is *italic* text');
    expect(result).toContain('<em>italic</em>');
  });
});
