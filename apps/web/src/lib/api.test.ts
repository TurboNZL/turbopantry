import { describe, expect, it } from 'vitest';
import { accessHeaders } from './api.ts';

describe('accessHeaders (Cloudflare Access service token)', () => {
  it('sends both headers when both are set, trimmed', () => expect(accessHeaders({ cfAccessId: ' id.access ', cfAccessSecret: ' s3cret ' })).toEqual({ 'CF-Access-Client-Id': 'id.access', 'CF-Access-Client-Secret': 's3cret' }));
  it('sends nothing when either is missing or blank', () => {
    expect(accessHeaders({})).toEqual({});
    expect(accessHeaders({ cfAccessId: 'x' })).toEqual({});
    expect(accessHeaders({ cfAccessId: 'x', cfAccessSecret: '  ' })).toEqual({});
  });
});
