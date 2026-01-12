import { describe, it, expect } from 'vitest';

// Test the escapeHtml and string regex patterns used in CodeViewer
// We test the logic directly since the component uses internal functions

describe('CodeViewer escapeHtml', () => {
  // Replicate the escapeHtml function from CodeViewer
  const escapeHtml = (str: string) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  it('escapes double quotes for attribute safety', () => {
    expect(escapeHtml('class="foo"')).toBe('class=&quot;foo&quot;');
  });

  it('escapes single quotes for attribute safety', () => {
    expect(escapeHtml("class='foo'")).toBe("class=&#039;foo&#039;");
  });

  it('escapes HTML tags', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('a && b')).toBe('a &amp;&amp; b');
  });
});

describe('CodeViewer string regex patterns', () => {
  // Test the improved string patterns
  const doubleQuotePattern = /"(?:[^"\\]|\\.)*"/;
  const singleQuotePattern = /'(?:[^'\\]|\\.)*'/;
  const backtickPattern = /`(?:[^`\\]|\\.)*`/;

  describe('double-quoted strings', () => {
    it('matches simple double-quoted strings', () => {
      expect('"hello"'.match(doubleQuotePattern)?.[0]).toBe('"hello"');
    });

    it('matches strings with escaped quotes', () => {
      expect('"He said \\"hello\\""'.match(doubleQuotePattern)?.[0]).toBe('"He said \\"hello\\""');
    });

    it('matches strings with escaped backslashes', () => {
      expect('"path\\\\to\\\\file"'.match(doubleQuotePattern)?.[0]).toBe('"path\\\\to\\\\file"');
    });

    it('matches empty strings', () => {
      expect('""'.match(doubleQuotePattern)?.[0]).toBe('""');
    });
  });

  describe('single-quoted strings', () => {
    it('matches simple single-quoted strings', () => {
      expect("'hello'".match(singleQuotePattern)?.[0]).toBe("'hello'");
    });

    it('matches strings with escaped quotes', () => {
      expect("'It\\'s fine'".match(singleQuotePattern)?.[0]).toBe("'It\\'s fine'");
    });

    it('matches empty strings', () => {
      expect("''".match(singleQuotePattern)?.[0]).toBe("''");
    });
  });

  describe('backtick strings', () => {
    it('matches simple backtick strings', () => {
      expect('`hello`'.match(backtickPattern)?.[0]).toBe('`hello`');
    });

    it('matches strings with escaped backticks', () => {
      expect('`use \\`code\\``'.match(backtickPattern)?.[0]).toBe('`use \\`code\\``');
    });

    it('matches empty strings', () => {
      expect('``'.match(backtickPattern)?.[0]).toBe('``');
    });
  });
});
