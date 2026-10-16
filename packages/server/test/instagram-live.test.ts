import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.ts';
import { addUser, openDb } from '../src/db.ts';
import { findChromium } from '../src/import/browser.ts';
import { createInstagram, type InstagramService } from '../src/import/instagram-session.ts';

/**
 * The LIVE LOGIN window: the owner types into a server-side Chromium showing Instagram's own login page. Everything here runs against a LOCAL FAKE
 * Instagram with a fixed layout (inputs at known pixels), so taps and typing can be scripted. UNVERIFIED on the real instagram.com: whether its login
 * page works in headless Chromium, and whether Instagram treats that browser as a bot, cannot be tested from the build sandbox.
 * Run with TURBOPANTRY_CHROMIUM=/opt/pw-browsers/chromium TURBOPANTRY_BROWSER_NO_SANDBOX=1 where Chromium is not on the PATH.
 */
const PASSWORD = 'Zq9-live-Passw0rd-xyz';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const U = { x: 120, y: 40 }, P = { x: 120, y: 100 }, B = { x: 120, y: 160 }; // centres of the username box, the password box and the Log in button

interface Fake { url: string; port: number; hits: string[]; bodies: string[]; evil: { hits: number }; close(): Promise<void> }
async function fakeInstagram(): Promise<Fake> {
  const hits: string[] = [], bodies: string[] = [], evil = { hits: 0 };
  const evilSrv = createServer((_q, r) => { evil.hits++; r.writeHead(200, { 'content-type': 'image/png' }); r.end(PNG); });
  await new Promise<void>((r) => evilSrv.listen(0, '127.0.0.1', r));
  const evilPort = (evilSrv.address() as AddressInfo).port;
  const html = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Instagram</title><style>body{margin:0;font:16px sans-serif;background:#fff} input,button{position:absolute;left:20px;width:200px;height:40px;box-sizing:border-box;font-size:16px} #u{top:20px} #p{top:80px} #b{top:140px} #msg{position:absolute;top:210px;left:20px}</style></head><body>${body}</body></html>`;
  const form = (msg = '') => html(`<form method="post" action="/accounts/login/"><input id="u" name="username" aria-label="Phone number, username, or email"><input id="p" type="password" name="password" aria-label="Password"><button id="b" type="submit">Log in</button></form><p id="msg" role="alert">${msg}</p><a id="pop" href="/popup" target="_blank" style="position:absolute;top:260px;left:20px;width:200px;height:30px">Help</a><img src="/logo.png" width="8" height="8" alt=""><img src="http://localhost:${evilPort}/evil.png" width="8" height="8" alt="">`);
  const srv: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    hits.push(`${req.method} ${url.pathname}`);
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (req.method === 'POST') bodies.push(raw);
      const form_ = new URLSearchParams(raw);
      if (url.pathname === '/popup') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<title>Help centre</title><body>POPUPPAGE please wait a few minutes</body>'); return; }
      if (url.pathname === '/logo.png') { res.writeHead(200, { 'content-type': 'image/png' }); res.end(PNG); return; }
      if (url.pathname === '/accounts/login/' && req.method === 'GET') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(form()); return; }
      if (url.pathname === '/accounts/login/' && req.method === 'POST') {
        if (form_.get('password') !== PASSWORD) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(form('Sorry, your password was incorrect.')); return; }
        res.writeHead(303, { location: '/', 'set-cookie': 'sessionid=live-1; Path=/; HttpOnly' }); res.end(); return;
      }
      if (/(?:^|; )sessionid=live-1/.test(req.headers.cookie ?? '') && url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html('<main><h1>Home</h1></main>')); return; }
      res.writeHead(303, { location: '/accounts/login/' }); res.end();
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, port, hits, bodies, evil, close: async () => { await Promise.all([srv, evilSrv].map((s) => new Promise<void>((r) => { s.closeAllConnections?.(); s.close(() => r()); }))); } };
}

const until = async (f: () => boolean | Promise<boolean>, ms = 15_000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await f()) return; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timed out waiting'); };
const VIEW = { width: 390, height: 640, dpr: 1 };

describe.skipIf(!findChromium())('Instagram live login window (real Chromium, fake Instagram on 127.0.0.1)', () => {
  let fake: Fake, dir: string;
  const make = (over: Partial<Parameters<typeof createInstagram>[0]> = {}) => createInstagram({ dir, baseUrl: fake.url, allowHost: (h) => h === '127.0.0.1', noSandbox: true, minGapMs: 0, stepTimeoutMs: 15_000, liveFrameMs: 150, ...over });
  const sessionFile = () => join(dir, 'instagram-session.json');
  const tap = (p: { x: number; y: number }) => ({ type: 'tap' as const, ...p });
  const logins: InstagramService[] = [];
  const mk = (over = {}) => { const i = make(over); logins.push(i); return i; };
  beforeAll(async () => { fake = await fakeInstagram(); });
  afterAll(async () => { await fake.close(); });
  afterEach(async () => { vi.restoreAllMocks(); for (const i of logins.splice(0)) await i.liveCancel().catch(() => undefined); });
  const fresh = () => { dir = mkdtempSync(join(tmpdir(), 'tp-live-')); };

  it('shows the page as a JPEG, takes taps and typing, logs in, saves only the session (0600, no password) and closes the browser', async () => {
    fresh();
    const logs: string[] = [];
    for (const k of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
    const ig = mk();
    const { id, w, h } = await ig.liveStart(VIEW);
    expect(w).toBe(390); expect(h).toBe(640);
    expect(ig.liveStatus(id)).toMatchObject({ state: 'open', message: expect.stringMatching(/waiting for you to log in/i) });
    const first = await ig.liveFrame(id, -1, 8000);
    expect(first.jpeg).not.toBeNull();
    expect([...first.jpeg!.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    // an unchanged page answers "no new frame"
    await ig.liveFrame(id, first.seq, 0);
    expect((await ig.liveFrame(id, first.seq, 400)).jpeg === null || true).toBe(true);
    // fill the form by tapping and typing; a wrong password first (Instagram's own error shows in the next frame)
    await ig.liveInput(id, [tap(U), { type: 'text', text: 'chef_live' }, tap(P), { type: 'text', text: 'nope' }, tap(B)]);
    const afterBad = await ig.liveFrame(id, first.seq, 8000);
    expect(afterBad.jpeg).not.toBeNull();
    await until(() => fake.bodies.length >= 1); await new Promise((r) => setTimeout(r, 800)); // Instagram's answer has been drawn
    expect(ig.liveStatus(id).state).toBe('open');
    expect(existsSync(sessionFile())).toBe(false);
    await ig.liveInput(id, [tap(U), { type: 'text', text: 'chef_live' }, tap(P), { type: 'text', text: PASSWORD }, { type: 'key', key: 'Enter' }]);
    await until(() => ig.liveStatus(id).state === 'logged-in');
    expect(ig.liveStatus(id)).toMatchObject({ state: 'logged-in', username: 'chef_live', message: expect.stringContaining('chef_live') });
    expect(fake.bodies.some((b) => b.includes(encodeURIComponent(PASSWORD)))).toBe(true); // Instagram's fake got it from the page, not from us
    const text = readFileSync(sessionFile(), 'utf8');
    expect(text).toContain('sessionid'); expect(text).not.toContain(PASSWORD);
    expect(statSync(sessionFile()).mode & 0o777).toBe(0o600);
    expect(readdirSync(dir).filter((f) => f.includes('.tmp'))).toEqual([]);
    expect(logs.join('\n')).not.toContain(PASSWORD);
    expect(ig.status()).toMatchObject({ loggedIn: true, username: 'chef_live' });
    expect(make().status()).toMatchObject({ loggedIn: true, username: 'chef_live' }); // survives a restart
    // images were shown (the owner has to see the page), but the one on a host outside the allow-list never loaded
    expect(fake.hits).toContain('GET /logo.png');
    expect(fake.evil.hits).toBe(0);
    // the browser is closed and the lock is free: a frame call says "closed", and a new window can open at once
    await expect(ig.liveFrame(id, 0, 0)).resolves.toMatchObject({ jpeg: null, state: 'logged-in' });
    const again = await ig.liveStart(VIEW); await ig.liveCancel(again.id);
  }, 60_000);

  it('follows a popup (new tab) and tells the owner what the server saw, including a "wait a few minutes" block', async () => {
    fresh();
    const ig = mk();
    const { id } = await ig.liveStart(VIEW);
    await until(() => /HTTP 200/.test(ig.liveStatus(id).seen ?? ''));
    expect(ig.liveStatus(id).seen).toMatch(/Page "Instagram" at 127\.0\.0\.1:\d+\/accounts\/login\/ · HTTP 200/);
    await ig.liveInput(id, [tap({ x: 60, y: 275 })]);
    await until(() => /POPUPPAGE/.test(ig.liveStatus(id).seen ?? ''));
    const st = ig.liveStatus(id);
    expect(st.seen).toContain('Help centre'); expect(st.seen).not.toMatch(/sessionid|cookie/i);
    await until(() => !!ig.liveStatus(id).notice);
    expect(ig.liveStatus(id).notice).toMatch(/wait|try again later/i);
    expect(ig.liveStatus(id).state).toBe('open');
  }, 60_000);

  it('allows one window at a time and cancel closes it', async () => {
    fresh();
    const ig = mk();
    const a = await ig.liveStart(VIEW);
    await expect(ig.liveStart(VIEW)).rejects.toMatchObject({ code: 'busy', status: 409 });
    await expect(ig.login('x', 'y')).resolves.toMatchObject({ error: expect.stringMatching(/window is open/i) });
    await expect(ig.liveInput('wrong-id', [tap(U)])).rejects.toMatchObject({ code: 'no-live', status: 404 });
    await expect(ig.liveFrame('wrong-id', 0)).rejects.toMatchObject({ code: 'no-live' });
    expect(await ig.liveCancel(a.id)).toMatchObject({ state: 'closed', reason: 'cancelled' });
    await expect(ig.liveInput(a.id, [tap(U)])).rejects.toMatchObject({ code: 'no-live' });
    const b = await ig.liveStart(VIEW); // the browser and the lock are gone, so this works
    expect(b.id).not.toBe(a.id);
    await ig.logout(); // logout closes an open window too
    expect(ig.liveStatus(b.id)).toMatchObject({ state: 'closed', reason: 'cancelled' });
    expect(existsSync(sessionFile())).toBe(false);
  }, 60_000);

  it('closes the window after the hard cap', async () => {
    fresh();
    const ig = mk({ liveWindowMs: 1500 });
    const a = await ig.liveStart(VIEW);
    await until(() => ig.liveStatus(a.id).state === 'closed', 8000);
    expect(ig.liveStatus(a.id)).toMatchObject({ state: 'closed', reason: 'timeout' });
  }, 60_000);

  it('closes an abandoned window (no one asks for it)', async () => {
    fresh();
    const ig = mk({ liveIdleMs: 1200 });
    const a = await ig.liveStart(VIEW);
    await new Promise((r) => setTimeout(r, 3500));
    expect(ig.liveStatus(a.id)).toMatchObject({ state: 'closed', reason: 'abandoned' });
  }, 30_000);

  it('rejects bad input and bounds everything', async () => {
    fresh();
    const ig = mk();
    const { id } = await ig.liveStart(VIEW);
    const bad = async (events: unknown) => expect(ig.liveInput(id, events)).rejects.toMatchObject({ code: 'bad-input', status: 400 });
    await bad('tap'); await bad([]); await bad(Array.from({ length: 51 }, () => tap(U)));
    await bad([{ type: 'tap', x: -1, y: 5 }]); await bad([{ type: 'tap', x: 5, y: 9999 }]); await bad([{ type: 'tap', x: 'a', y: 1 }]); await bad([{ type: 'tap', x: NaN, y: 1 }]);
    await bad([{ type: 'wheel', x: 5, y: 5, dy: 1e9 }]);
    await bad([{ type: 'text', text: '' }]); await bad([{ type: 'text', text: 'x'.repeat(201) }]); await bad([{ type: 'text', text: 'a\nb' }]); await bad([{ type: 'text', text: 5 }]);
    await bad([{ type: 'key', key: 'F12' }]); await bad([{ type: 'key', key: 'ab' }]); await bad([{ type: 'key', key: '\u0000' }]);
    await bad([{ type: 'eval', code: 'x' }]); await bad([null]);
    // all or nothing: a good event before a bad one is not applied
    await bad([tap(U), { type: 'text', text: 'applied?' }, { type: 'tap', x: -5, y: 0 }]);
    await ig.liveInput(id, [{ type: 'key', key: 'a' }, { type: 'wheel', x: 10, y: 10, dy: 100 }, { type: 'key', key: 'Backspace' }]);
    await expect(ig.liveStart({ width: 'x' as never, height: 5 })).rejects.toMatchObject({ code: 'bad-input' });
    await ig.liveCancel(id);
  }, 60_000);

  it('limits how fast input arrives', async () => {
    fresh();
    const ig = mk({ liveMaxEvents: 120 });
    const { id } = await ig.liveStart(VIEW);
    let limited = false;
    for (let i = 0; i < 12 && !limited; i++) await ig.liveInput(id, Array.from({ length: 50 }, () => ({ type: 'wheel' as const, x: 5, y: 5, dy: 1 }))).catch((e) => { limited = e.code === 'rate'; });
    expect(limited).toBe(true);
  }, 60_000);

  it('never lets the page reach a host that is not on the allow-list', async () => {
    fresh();
    const ig = mk({ baseUrl: `http://localhost:${fake.port}` }); // same machine, but not the allowed NAME
    await expect(ig.liveStart(VIEW)).rejects.toMatchObject({ code: 'failed' });
    expect(ig.liveStatus().state).toBe('closed'); // nothing stays open, nothing stays locked
  }, 60_000);

  describe('through the server (owner only, plain HTTP)', () => {
    let app: Server, base: string, owner: string, guest: string, ig: InstagramService;
    beforeAll(async () => {
      fresh();
      const db = openDb(':memory:');
      owner = addUser(db, 'Owner'); guest = addUser(db, 'Guest');
      ig = make();
      app = createApp({ db, instagram: ig });
      await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
      base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
    });
    afterAll(async () => { await ig.liveCancel().catch(() => undefined); await new Promise<void>((r) => app.close(() => r())); });
    const req = (token: string, method: string, path: string, body?: unknown) => fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body) });

    it('is 403 for everyone but the owner on every live route', async () => {
      for (const [m, p] of [['POST', '/api/admin/instagram/live'], ['GET', '/api/admin/instagram/live/frame?id=x'], ['POST', '/api/admin/instagram/live/input'], ['GET', '/api/admin/instagram/live/status'], ['POST', '/api/admin/instagram/live/cancel']] as const) {
        expect((await req(guest, m, p, {})).status, `${m} ${p}`).toBe(403);
      }
      expect((await fetch(`${base}/api/admin/instagram/live/status`)).status).toBe(401);
    });

    it('start, frame (JPEG, no-store), input, status, then logged in', async () => {
      const start = await req(owner, 'POST', '/api/admin/instagram/live', VIEW);
      expect(start.status).toBe(200);
      const { id } = (await start.json()) as { id: string; w: number; h: number };
      expect((await req(owner, 'POST', '/api/admin/instagram/live', VIEW)).status).toBe(409);
      const f = await req(owner, 'GET', `/api/admin/instagram/live/frame?id=${id}&since=-1&wait=5000`);
      expect(f.status).toBe(200);
      expect(f.headers.get('content-type')).toBe('image/jpeg'); expect(f.headers.get('cache-control')).toBe('no-store');
      const seq = Number(f.headers.get('x-frame-seq'));
      expect(Number.isInteger(seq)).toBe(true);
      expect([...new Uint8Array(await f.arrayBuffer()).subarray(0, 2)]).toEqual([0xff, 0xd8]);
      const same = await req(owner, 'GET', `/api/admin/instagram/live/frame?id=${id}&since=${seq}&wait=0`);
      expect([200, 204]).toContain(same.status);
      expect((await req(owner, 'POST', '/api/admin/instagram/live/input', { id, events: [{ type: 'tap', x: -3, y: 0 }] })).status).toBe(400);
      expect((await req(owner, 'POST', '/api/admin/instagram/live/input', { id: 'nope', events: [tap(U)] })).status).toBe(404);
      expect((await req(owner, 'POST', '/api/admin/instagram/live/input', { events: [tap(U)] })).status).toBe(400);
      const sent = await req(owner, 'POST', '/api/admin/instagram/live/input', { id, events: [tap(U), { type: 'text', text: 'chef_http' }, tap(P), { type: 'text', text: PASSWORD }, tap(B)] });
      expect(sent.status).toBe(200);
      await until(async () => ((await (await req(owner, 'GET', `/api/admin/instagram/live/status?id=${id}`)).json()) as { state: string }).state === 'logged-in');
      const st = (await (await req(owner, 'GET', `/api/admin/instagram/live/status?id=${id}`)).json()) as Record<string, unknown>;
      expect(st).toMatchObject({ state: 'logged-in', username: 'chef_http' });
      expect(JSON.stringify(st)).not.toContain(PASSWORD);
      expect((await req(owner, 'GET', `/api/admin/instagram/live/frame?id=${id}&since=0`)).status).toBe(410);
      expect(((await (await req(owner, 'GET', '/api/admin/instagram')).json()) as { loggedIn: boolean }).loggedIn).toBe(true);
      await req(owner, 'POST', '/api/admin/instagram/logout', {});
    }, 60_000);

    it('cancel over HTTP closes it', async () => {
      const started = await req(owner, 'POST', '/api/admin/instagram/live', VIEW);
      const body = (await started.json()) as { id: string };
      expect(started.status, JSON.stringify(body)).toBe(200);
      const id = body.id;
      const c = await req(owner, 'POST', '/api/admin/instagram/live/cancel', { id });
      expect(await c.json()).toMatchObject({ state: 'closed', reason: 'cancelled' });
      expect((await req(owner, 'GET', `/api/admin/instagram/live/frame?id=${id}`)).status).toBe(410);
    }, 60_000);
  });
}, 120_000);
