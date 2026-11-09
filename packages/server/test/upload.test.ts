import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app.ts';
import { addUser, openDb } from '../src/db.ts';

let server: Server, base: string, token: string;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);

beforeAll(async () => {
  const db = openDb(':memory:');
  token = addUser(db, 'Alex'); addUser(db, 'Sam');
  server = createApp({ db, imagesDir: mkdtempSync(join(tmpdir(), 'tp-img-')) });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('photo upload and account name', () => {
  it('keeps an uploaded picture and serves it back', async () => {
    const r = await fetch(`${base}/api/images`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' }, body: PNG });
    expect(r.status).toBe(201);
    const { path } = await r.json() as { path: string };
    expect(path).toMatch(/^\/images\/[0-9a-f]{64}\.png$/);
    const got = await fetch(`${base}${path}`);
    expect(got.status).toBe(200); expect(got.headers.get('content-type')).toBe('image/png');
  });
  it('refuses something that is not a picture, whatever it claims to be', async () => {
    const r = await fetch(`${base}/api/images`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' }, body: Buffer.from('<svg onload=alert(1)></svg> not an image') });
    expect(r.status).toBe(400);
  });
  it('renames the account, and refuses a name someone else has', async () => {
    const put = (name: string) => fetch(`${base}/api/me`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
    expect((await put('Alexandra')).status).toBe(200);
    expect(await (await fetch(`${base}/api/status`, { headers: { authorization: `Bearer ${token}` } })).json()).toMatchObject({ user: 'Alexandra' });
    expect((await put('Sam')).status).toBe(400);
    expect((await put('  ')).status).toBe(400);
  });
});
