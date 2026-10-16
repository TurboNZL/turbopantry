import { afterEach, describe, expect, it, vi } from 'vitest';
import { Api, accessHeaders } from './api.ts';

describe('accessHeaders (Cloudflare Access service token)', () => {
  it('sends both headers when both are set, trimmed', () => expect(accessHeaders({ cfAccessId: ' id.access ', cfAccessSecret: ' s3cret ' })).toEqual({ 'CF-Access-Client-Id': 'id.access', 'CF-Access-Client-Secret': 's3cret' }));
  it('sends nothing when either is missing or blank', () => {
    expect(accessHeaders({})).toEqual({});
    expect(accessHeaders({ cfAccessId: 'x' })).toEqual({});
    expect(accessHeaders({ cfAccessId: 'x', cfAccessSecret: '  ' })).toEqual({});
  });
});

describe('an answer that is not JSON', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('is an error, never a null handed to a screen (the Server tab crashed on `devices.length`)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Cloudflare Access sign in</html>', { status: 200, headers: { 'content-type': 'text/html' } })));
    await expect(new Api({ serverUrl: 'https://pantry.example.com', token: 't' }).listDevices()).rejects.toMatchObject({ code: 'not-json' });
  });
  it('still returns normal JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })));
    expect(await new Api({ serverUrl: '', token: 't' }).listDevices()).toEqual([]);
  });
});
