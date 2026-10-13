import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app.ts';
import { addUser, openDb } from '../src/db.ts';

let server: Server, base: string, token: string;

beforeAll(async () => {
  const web = mkdtempSync(join(tmpdir(), 'tp-web-'));
  mkdirSync(join(web, 'assets'));
  writeFileSync(join(web, 'index.html'), '<!doctype html><title>TurboPantry</title>');
  writeFileSync(join(web, 'assets', 'app-abc123.js'), 'console.log(1)');
  const db = openDb(':memory:');
  token = addUser(db, 'Alex');
  server = createApp({ db, webDir: web });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('api', () => {
  it('answers /api/health without a token', async () => {
    const r = await fetch(`${base}/api/health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, name: 'TurboPantry' });
  });
  it('rejects every other /api route without a valid token', async () => {
    expect((await fetch(`${base}/api/status`)).status).toBe(401);
    expect((await fetch(`${base}/api/status`, { headers: { authorization: 'Bearer nope' } })).status).toBe(401);
    expect((await fetch(`${base}/api/anything`)).status).toBe(401);
  });
  it('accepts a user token', async () => {
    const r = await fetch(`${base}/api/status`, { headers: { authorization: `Bearer ${token}` } });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ user: 'Alex', users: 1 });
  });
  it('404s unknown routes for a signed-in user', async () => {
    expect((await fetch(`${base}/api/nothing`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(404);
  });
});

describe('web client', () => {
  it('serves index.html at / and for unknown paths (single-page app)', async () => {
    for (const p of ['/', '/recipes/123']) {
      const r = await fetch(`${base}${p}`);
      expect(r.status).toBe(200);
      expect(await r.text()).toContain('TurboPantry');
    }
  });
  it('serves fingerprinted assets as immutable', async () => {
    const r = await fetch(`${base}/assets/app-abc123.js`);
    expect(r.headers.get('cache-control')).toContain('immutable');
  });
  it('does not escape the web folder', async () => {
    const r = await fetch(`${base}/..%2f..%2fetc%2fpasswd`);
    expect(await r.text()).not.toContain('root:');
  });
});

describe('accounts', () => {
  it('refuses a duplicate name and an empty one', () => {
    const db = openDb(':memory:');
    addUser(db, 'Sam');
    expect(() => addUser(db, 'sam')).toThrow();
    expect(() => addUser(db, '  ')).toThrow();
  });
});
