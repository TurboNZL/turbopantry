import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app.ts';
import { addUser, openDb } from '../src/db.ts';

let server: Server, base: string, token: string;
const db = openDb(':memory:');
beforeAll(async () => {
  token = addUser(db, 'Alex');
  server = createApp({ db });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const call = async (method: string, path: string, body?: unknown, auth = true) => {
  const res = await fetch(`${base}${path}`, { method, headers: { ...(auth ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
};
const block = (o: Record<string, unknown> = {}) => ({ id: 'b1', kind: 'fridge', x: 1, y: 2, w: 2, d: 2, h: 5, rot: 0, label: 'Fridge', color: '#c9d6e2', ...o });

describe('floor plans', () => {
  it('needs a token', async () => { expect((await call('GET', '/api/layouts/pantry', undefined, false)).status).toBe(401); });

  it('starts empty, saves, and reads back', async () => {
    expect((await call('GET', '/api/layouts/pantry')).body).toEqual({ blocks: [] });
    const put = await call('PUT', '/api/layouts/pantry', { blocks: [block(), block({ id: 'b2', kind: 'wall', x: 5, label: 'Wall' })] });
    expect(put.status).toBe(200);
    const got = await call('GET', '/api/layouts/pantry');
    expect(got.body.blocks.map((b: any) => b.id)).toEqual(['b1', 'b2']);
    await call('PUT', '/api/layouts/pantry', { blocks: [block()] });
    expect((await call('GET', '/api/layouts/pantry')).body.blocks).toHaveLength(1); // replaced, not appended
  });

  it('cleans what it stores', async () => {
    const r = await call('PUT', '/api/layouts/pantry', { blocks: [block({ x: -9, w: 999, label: '  Fridge  ', color: 'nope', secret: 'x', groups: ['Milk & cream', 'zzz'] })] });
    expect(r.body.blocks[0]).toEqual({ id: 'b1', kind: 'fridge', x: 0, y: 2, w: 24, d: 2, h: 5, z: 0, rot: 0, label: 'Fridge', color: '#c9d6e2', groups: ['Milk & cream'] });
  });

  it('rejects bad plans', async () => {
    expect((await call('PUT', '/api/layouts/pantry', { nope: 1 })).status).toBe(400);
    expect((await call('PUT', '/api/layouts/pantry', { blocks: Array.from({ length: 121 }, (_, i) => block({ id: `i${i}` })) })).status).toBe(400);
    expect((await call('PUT', '/api/layouts/pantry', { blocks: [block(), block()] })).status).toBe(400);
    expect((await call('DELETE', '/api/layouts/pantry')).status).toBe(405);
  });

  it('keeps one plan per shop and drops it with the shop', async () => {
    const a = (await call('POST', '/api/stores', { name: 'Countdown' })).body, b = (await call('POST', '/api/stores', { name: 'Pak’nSave' })).body;
    expect((await call('GET', `/api/layouts/store/${a.id}`)).body).toEqual({ blocks: [] });
    await call('PUT', `/api/layouts/store/${a.id}`, { blocks: [block({ id: 's1', kind: 'aisle', label: 'Aisle 1', groups: ['Milk & cream'], walk: 1 })] });
    expect((await call('GET', `/api/layouts/store/${a.id}`)).body.blocks[0]).toMatchObject({ groups: ['Milk & cream'], walk: 1 });
    expect((await call('GET', `/api/layouts/store/${b.id}`)).body.blocks).toEqual([]);
    expect((await call('GET', '/api/layouts/store/9999')).status).toBe(404);
    expect((await call('PUT', '/api/layouts/store/9999', { blocks: [] })).status).toBe(404);
    await call('DELETE', `/api/stores/${a.id}`);
    expect(db.prepare('SELECT COUNT(*) AS n FROM layouts WHERE store_id = ?').get(a.id)).toEqual({ n: 0 });
  });

  it('announces a change on the live stream', async () => {
    const ac = new AbortController();
    const res = await fetch(`${base}/api/events`, { headers: { authorization: `Bearer ${token}` }, signal: ac.signal });
    const reader = res.body!.getReader();
    await reader.read();
    await call('PUT', '/api/layouts/pantry', { blocks: [] });
    let text = '';
    const dec = new TextDecoder();
    for (let i = 0; i < 5 && !text.includes('event: layouts'); i++) text += dec.decode((await reader.read()).value);
    ac.abort();
    expect(text).toContain('event: layouts');
  });
});

describe('item places', () => {
  it('can be any short name, not only the old five', async () => {
    const it = (await call('POST', '/api/items', { name: 'Rice', place: 'Garage freezer' })).body;
    expect(it.place).toBe('Garage freezer');
    expect((await call('PUT', `/api/items/${it.id}`, { place: '  ' + 'x'.repeat(40) })).body.place).toBe('x'.repeat(30));
    expect((await call('PUT', `/api/items/${it.id}`, { place: null })).body.place).toBeNull();
  });
});
