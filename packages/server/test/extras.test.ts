import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app.ts';
import { addUser, openDb, resetUserToken, userForToken } from '../src/db.ts';
import { cacheAllRecipeImages, sniffImage } from '../src/images.ts';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 7)]);
let server: Server, base: string, token: string, dir: string;
const fetched: string[] = [];
const db = openDb(':memory:');

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tp-img-'));
  token = addUser(db, 'Alex');
  const fetchPicture = async (url: string) => {
    fetched.push(url);
    if (url.includes('page.html')) return { url, type: 'text/html', bytes: Buffer.from('<html>not a picture, just pretending</html>') };
    if (url.includes('down')) throw new Error('offline');
    return { url, type: 'image/png', bytes: PNG };
  };
  server = createApp({ db, imagesDir: dir, fetchPicture });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const call = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
};
const recipe = (imageUrl: string | null) => ({ title: 'Soup', description: '', imageUrl, sourceUrl: null, sourceName: null, servings: 2, prepMinutes: null, cookMinutes: null, totalMinutes: null, steps: [], tags: [], notes: '', ingredients: [] });

describe('recipe photos are kept on the server', () => {
  it('sniffs what the bytes are, never what the server claims', () => {
    expect(sniffImage(PNG)?.ext).toBe('png');
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from('<html>x</html>   '))).toBeNull();
  });
  it('saving a recipe stores its photo under the hash of the content and serves it with a forever cache', async () => {
    const r = await call('POST', '/api/recipes', recipe('https://example.com/a.jpg'));
    expect(r.body.imageUrl).toMatch(/^\/images\/[0-9a-f]{64}\.png$/);
    const res = await fetch(`${base}${r.body.imageUrl}`); // no token needed: the content hash is the key
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
  });
  it('the same photo is stored once, and saving the recipe again does not fetch it again', async () => {
    const a = await call('POST', '/api/recipes', recipe('https://example.com/b.jpg'));
    const b = await call('POST', '/api/recipes', recipe('https://example.com/c.jpg'));
    expect(a.body.imageUrl).toBe(b.body.imageUrl);
    expect(readdirSync(dir).filter((f) => f.endsWith('.png'))).toHaveLength(1);
    const before = fetched.length;
    const put = await call('PUT', `/api/recipes/${a.body.id}`, { ...recipe(a.body.imageUrl), title: 'Renamed' });
    expect(put.body.imageUrl).toBe(a.body.imageUrl); // the client sends the saved path back and it is kept
    expect(fetched.length).toBe(before);
  });
  it('keeps the website address when the photo cannot be had or is not a picture', async () => {
    expect((await call('POST', '/api/recipes', recipe('https://example.com/down.jpg'))).body.imageUrl).toBe('https://example.com/down.jpg');
    expect((await call('POST', '/api/recipes', recipe('https://example.com/page.html'))).body.imageUrl).toBe('https://example.com/page.html');
  });
  it('only serves well-formed picture names', async () => {
    expect((await fetch(`${base}/images/../../etc/passwd`)).status).not.toBe(200);
    expect((await fetch(`${base}/images/${'0'.repeat(64)}.png`)).status).toBe(404);
    expect((await fetch(`${base}/images/${'0'.repeat(64)}.svg`)).status).not.toBe(200);
  });
  it('photos saved before caching existed are fetched in the background', async () => {
    db.prepare("INSERT INTO recipes (title, image_url, created_by) VALUES ('Old', 'https://example.com/old.jpg', 'Alex')").run();
    const n = await cacheAllRecipeImages(db, dir, async (url) => ({ url, type: 'image/png', bytes: PNG }));
    expect(n).toBeGreaterThanOrEqual(1);
    expect((db.prepare("SELECT image_url FROM recipes WHERE title = 'Old'").get() as { image_url: string }).image_url).toMatch(/^\/images\//);
  });
});

describe('a lost token', () => {
  it('new-token replaces the main token, keeps the account and its data', () => {
    const d = openDb(':memory:');
    const old = addUser(d, 'Sam');
    const fresh = resetUserToken(d, 'Sam')!;
    expect(fresh).toMatch(/^tp_/);
    expect(userForToken(d, old)).toBeNull();
    expect(userForToken(d, fresh)?.name).toBe('Sam');
    expect(resetUserToken(d, 'Nobody')).toBeNull();
  });
});

describe('older databases', () => {
  it('moves items and lines from the old broad aisles to precise groups', () => {
    const d = openDb(':memory:');
    d.prepare("INSERT INTO items (name, key, category) VALUES ('Cheddar cheese', 'cheddar cheese', 'Dairy & eggs'), ('Mystery thing', 'mystery thing', 'Produce')").run();
    // opening again re-runs the check, as a restart would after an update
    const file = join(mkdtempSync(join(tmpdir(), 'tp-db-')), 'x.db');
    const f = openDb(file);
    f.prepare("INSERT INTO items (name, key, category) VALUES ('Cheddar cheese', 'cheddar cheese', 'Dairy & eggs')").run();
    f.close();
    const again = openDb(file);
    expect((again.prepare('SELECT category FROM items').get() as { category: string }).category).toBe('Cheese');
  });
});
