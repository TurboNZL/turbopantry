import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  const fixture = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
  // the importer is given a fake fetcher here (the real one refuses loopback addresses, which is what a test server is)
  const fetchPage = async (url: string) => ({ url, html: fixture(url.endsWith('/pancakes') ? 'recipe-plain-string.html' : 'no-recipe.html') });
  server = createApp({ db, webDir: web, fetchPage });
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

describe('recipes api', () => {
  const auth = () => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });
  const draft = { title: 'Toast', description: '', imageUrl: null, sourceUrl: null, sourceName: null, servings: 2, prepMinutes: 1, cookMinutes: 3, totalMinutes: null,
    ingredients: [{ raw: '2 slices bread', quantity: 2, quantityMax: null, unit: 'slice', name: 'bread', note: null, section: null }], steps: ['Toast it.'], tags: ['Breakfast'], notes: '' };
  const post = (body: unknown, path = '/api/recipes') => fetch(`${base}${path}`, { method: 'POST', headers: auth(), body: JSON.stringify(body) });

  it('needs a token', async () => { expect((await fetch(`${base}/api/recipes`)).status).toBe(401); expect((await fetch(`${base}/api/import`, { method: 'POST', body: '{}' })).status).toBe(401); });
  it('creates, reads, lists, searches, updates and deletes', async () => {
    const created = await post(draft);
    expect(created.status).toBe(201);
    const r = await created.json() as { id: number; createdBy: string; tags: string[]; totalMinutes: number | null };
    expect(r).toMatchObject({ createdBy: 'Alex', tags: ['breakfast'] });
    expect((await (await fetch(`${base}/api/recipes/${r.id}`, { headers: auth() })).json() as { title: string }).title).toBe('Toast');
    const list = async (q: string) => (await (await fetch(`${base}/api/recipes?q=${encodeURIComponent(q)}`, { headers: auth() })).json()) as { id: number; totalMinutes: number | null }[];
    expect((await list('')).some((x) => x.id === r.id)).toBe(true);
    expect((await list('BREAD toast')).map((x) => x.id)).toContain(r.id); // any order, any case, ingredient names count
    expect((await list('zzzz-nothing')).length).toBe(0);
    expect((await list('100%')).length).toBe(0); // LIKE wildcards are escaped
    expect((await list('')).find((x) => x.id === r.id)!.totalMinutes).toBe(4); // prep + cook when no total is given
    const put = await fetch(`${base}/api/recipes/${r.id}`, { method: 'PUT', headers: auth(), body: JSON.stringify({ ...draft, title: 'Better toast' }) });
    expect((await put.json() as { title: string }).title).toBe('Better toast');
    expect((await fetch(`${base}/api/recipes/${r.id}`, { method: 'DELETE', headers: auth() })).status).toBe(200);
    expect((await fetch(`${base}/api/recipes/${r.id}`, { headers: auth() })).status).toBe(404);
    expect((await fetch(`${base}/api/recipes/${r.id}`, { method: 'DELETE', headers: auth() })).status).toBe(404);
  });
  it('rejects bad recipes and bad JSON', async () => {
    expect((await post({ ...draft, title: '  ' })).status).toBe(400);
    expect((await post({ ...draft, ingredients: 'no' })).status).toBe(400);
    expect((await post([])).status).toBe(400);
    expect((await fetch(`${base}/api/recipes`, { method: 'POST', headers: auth(), body: '{oops' })).status).toBe(400);
  });
  it('drops unsafe image and source links', async () => {
    const r = await (await post({ ...draft, imageUrl: 'javascript:alert(1)', sourceUrl: 'ftp://x' })).json() as { imageUrl: string | null; sourceUrl: string | null };
    expect([r.imageUrl, r.sourceUrl]).toEqual([null, null]);
  });
  it('refuses an oversized body', async () => { expect((await post({ ...draft, notes: 'x'.repeat(1_100_000) })).status).toBe(413); });

  it('import returns a draft without saving anything', async () => {
    const before = (await (await fetch(`${base}/api/recipes`, { headers: auth() })).json() as unknown[]).length;
    const r = await post({ url: 'https://example.com/pancakes' }, '/api/import');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ recipe: { title: 'Fluffy Pancakes' } });
    expect((await (await fetch(`${base}/api/recipes`, { headers: auth() })).json() as unknown[]).length).toBe(before);
  });
  it('import explains failures', async () => {
    expect(await (await post({ url: 'https://example.com/none' }, '/api/import')).json()).toMatchObject({ code: 'no-recipe' });
    expect((await post({}, '/api/import')).status).toBe(400);
  });
  it('the real fetcher (no fake) refuses internal addresses end to end', async () => {
    const db = openDb(':memory:'); const t = addUser(db, 'Sam');
    const real = createApp({ db });
    await new Promise<void>((r) => real.listen(0, '127.0.0.1', r));
    try {
      const res = await fetch(`http://127.0.0.1:${(real.address() as AddressInfo).port}/api/import`, { method: 'POST', headers: { authorization: `Bearer ${t}` }, body: JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data/' }) });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ code: 'blocked' });
    } finally { await new Promise((r) => real.close(r)); }
  });
});
