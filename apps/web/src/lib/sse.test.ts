import { describe, expect, it } from 'vitest';
import { parseSse } from './sse.ts';

describe('parseSse (live updates)', () => {
  it('reads named events and keeps an unfinished one for the next chunk', () => {
    const a = parseSse('retry: 3000\n\n: connected\n\nevent: list\ndata: {"by":"Alex"}\n\nevent: items\ndata: {"by"');
    expect(a.events).toEqual([{ type: 'list', data: '{"by":"Alex"}' }]);
    const b = parseSse(a.rest + ':"Sam"}\n\n');
    expect(b.events).toEqual([{ type: 'items', data: '{"by":"Sam"}' }]);
  });
  it('ignores keep-alive comments and CRLF line ends', () => expect(parseSse(': keep-alive\r\n\r\nevent: recipes\r\ndata: {}\r\n\r\n').events).toEqual([{ type: 'recipes', data: '{}' }]));
});
