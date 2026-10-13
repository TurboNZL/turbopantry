import { describe, expect, it } from 'vitest';
import { docNameFromLink, renderMarkdown } from './markdown.ts';

describe('renderMarkdown', () => {
  it('escapes HTML so a guide cannot inject markup', () => {
    const html = renderMarkdown('hello <script>alert(1)</script> **bold**');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>bold</strong>');
  });
  it('only links http(s) and mailto addresses', () => {
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('href="javascript');
    expect(renderMarkdown('[x](https://example.com)')).toContain('href="https://example.com"');
  });
  it('turns links to other guides into in-app links', () => {
    expect(docNameFromLink('SELF_HOSTING.md#docker')).toBe('SELF_HOSTING');
    expect(renderMarkdown('[host](SELF_HOSTING.md)')).toContain('data-doc="SELF_HOSTING"');
  });
});
