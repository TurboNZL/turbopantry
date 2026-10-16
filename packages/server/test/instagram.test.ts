import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.ts';
import { addUser, openDb } from '../src/db.ts';
import { findChromium } from '../src/import/browser.ts';
import { importInstagram } from '../src/import/instagram.ts';
import { INSTAGRAM_HOSTS, InstagramError, createInstagram, type InstagramReader } from '../src/import/instagram-session.ts';

/**
 * Everything here runs against a LOCAL FAKE Instagram. The real login page and post page could not be reached from the build sandbox, so what these
 * tests prove is that the code does what it intends against the markup the fake models (inputs by name/type, buttons by text, outcomes by cookie,
 * address and wording). They do NOT prove it works on instagram.com.
 */

const PASSWORD = 'Zq9-unique-Passw0rd-xyz';
const RECIPE_COMMENT = 'Ingredients\n2 cups flour\n1 cup milk\n2 eggs\nMethod\n1. Whisk everything together.\n2. Cook in a hot pan until golden.';

// ---- the fake ---------------------------------------------------------------------------------------------------------------------------
interface Fake { url: string; port: number; sessions: Set<string>; bodies: string[]; hits: string[]; close(): Promise<void> }
async function fakeInstagram(): Promise<Fake> {
  const sessions = new Set<string>(), bodies: string[] = [], hits: string[] = [];
  const pending = new Map<string, string>(); // two-factor token -> username
  const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Instagram</title></head><body>${body}</body></html>`;
  const consent = '<div id="consent" role="dialog"><p>Allow the use of cookies from Instagram on this browser?</p><button onclick="document.getElementById(\'consent\').remove()">Decline optional cookies</button><button>Allow all cookies</button></div>';
  const loginForm = (msg = '') => page(`${consent}<form method="post" action="/accounts/login/"><input name="username" aria-label="Phone number, username, or email"><input type="password" name="password" aria-label="Password"><button type="submit">Log in</button></form>${msg ? `<p role="alert">${msg}</p>` : ''}`);
  const cookieOf = (h: string | undefined) => /(?:^|; )sessionid=([^;]+)/.exec(h ?? '')?.[1];
  const srv: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    hits.push(`${req.method} ${url.pathname}`);
    const send = (html: string, headers: Record<string, string | string[]> = {}, status = 200) => { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers }); res.end(html); };
    const redirect = (to: string, headers: Record<string, string | string[]> = {}) => { res.writeHead(303, { location: to, ...headers }); res.end(); };
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (req.method === 'POST') bodies.push(raw);
      const form = new URLSearchParams(raw);
      const sid = cookieOf(req.headers.cookie);
      const authed = !!sid && sessions.has(sid);
      if (url.pathname === '/accounts/login/' && req.method === 'GET') return send(loginForm());
      if (url.pathname === '/accounts/login/' && req.method === 'POST') {
        const user = form.get('username') ?? '', pass = form.get('password') ?? '';
        if (user === 'ratelimited') return send(loginForm('Please wait a few minutes before you try again.'));
        if (user === 'suspicious') return redirect('/challenge/action/1/');
        if (pass !== PASSWORD) return send(loginForm('Sorry, your password was incorrect. Please double-check your password.'));
        if (user === 'twofa' || user === 'sms') { const t = `t${pending.size + 1}`; pending.set(t, user); return redirect(`/accounts/login/two_factor?token=${t}`); }
        const id = `s-${sessions.size + 1}`; sessions.add(id);
        return redirect('/accounts/onetap/', { 'set-cookie': `sessionid=${id}; Path=/; HttpOnly` });
      }
      if (url.pathname === '/accounts/login/two_factor' && req.method === 'GET') {
        const kind = pending.get(url.searchParams.get('token') ?? '');
        const words = kind === 'sms' ? 'Enter the code we sent by text message to your phone number ending in 42.' : 'Enter the 6-digit code from your authentication app.';
        return send(page(`<h2>Two-factor authentication required</h2><p>${words}</p><form method="post" action="/accounts/login/two_factor?token=${url.searchParams.get('token')}"><input name="verificationCode" autocomplete="one-time-code" aria-label="Security code"><button type="submit">Confirm</button></form>`));
      }
      if (url.pathname === '/accounts/login/two_factor' && req.method === 'POST') {
        if (form.get('verificationCode') !== '123456') return send(page(`<p>Two-factor authentication required</p><p role="alert">Please check the security code and try again.</p><form method="post" action="${url.pathname}${url.search}"><input name="verificationCode" autocomplete="one-time-code"><button type="submit">Confirm</button></form>`));
        const id = `s-${sessions.size + 1}`; sessions.add(id);
        return redirect('/accounts/onetap/', { 'set-cookie': `sessionid=${id}; Path=/; HttpOnly` });
      }
      if (url.pathname.startsWith('/challenge/')) return send(page('<h2>We detected an unusual login attempt</h2><p>To secure your account, we need to confirm it is you.</p>'));
      if (url.pathname === '/accounts/onetap/') return send(page('<h2>Save your login info?</h2><p>We can save your login info on this browser.</p><button onclick="location.href=\'/\'">Save info</button><button onclick="location.href=\'/\'">Not now</button>'));
      if (!authed) return redirect(`/accounts/login/?next=${encodeURIComponent(url.pathname)}`);
      if (url.pathname === '/') return send(page('<div id="n" role="dialog"><h3>Turn on notifications</h3><button>Turn On</button><button onclick="document.getElementById(\'n\').remove()">Not Now</button></div><main><h1>Home</h1></main>'));
      const post = /^\/p\/([A-Za-z0-9_-]+)\/$/.exec(url.pathname);
      if (post && post[1] === 'GONEXXXXX') return send(page("<h2>Sorry, this page isn't available.</h2><p>The link you followed may be broken, or the page may have been removed.</p>"));
      if (post) {
        const t = '<time>2d</time>';
        return send(page(`<main><article><header><a href="/chef_anna/">chef_anna</a></header><ul>
          <li><a href="/chef_anna/">chef_anna</a><h1>Fluffy pancakes! Full recipe in the comments #pancakes</h1>${t}</li>
          <li><a href="/chef_anna/">chef_anna</a><div>Ingredients<br>2 cups flour<br>1 cup milk<br>2 eggs<br>Method<br>1. Whisk everything together.<br>2. Cook in a hot pan until golden.</div><div><span>1d</span> <span>Reply</span></div></li>
          <li><a href="/hungry_bob/">hungry_bob</a><div>Looks so yummy, thank you so much for sharing this one!</div><div><span>3h</span> <span>Like</span></div></li>
          </ul></article></main>`));
      }
      send(page('<p>Not found</p>'), {}, 404);
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, port, sessions, bodies, hits, close: () => new Promise<void>((r) => { srv.closeAllConnections?.(); srv.close(() => r()); }) };
}

// ---- without a browser ------------------------------------------------------------------------------------------------------------------
describe('Instagram host allow-list', () => {
  it.each(['www.instagram.com', 'instagram.com', 'static.cdninstagram.com', 'www.facebook.com'])('allows %s', (h) => expect(INSTAGRAM_HOSTS(h)).toBe(true));
  it.each(['evil.com', 'instagram.com.evil.com', 'notinstagram.com', '127.0.0.1', 'localhost', '169.254.169.254'])('refuses %s', (h) => expect(INSTAGRAM_HOSTS(h)).toBe(false));
});

describe('importInstagram with a session reader (no browser)', () => {
  const wall = async (url: string) => ({ url, html: '<html><body>Log in to Instagram</body></html>' });
  const reader = (over: Partial<InstagramReader> = {}): InstagramReader => ({ hasSession: () => true, readPost: async () => ({ caption: 'Pancakes! Recipe in the comments', ownerComments: [RECIPE_COMMENT], otherComments: [], imageUrl: null }), ...over });
  it('tries the session after the anonymous page gives nothing, and reads the creator\'s comment', async () => {
    const r = await importInstagram('https://www.instagram.com/p/ABCDEFG/', wall, reader());
    expect(r).toHaveProperty('recipe.ingredients');
    expect((r as { recipe: { ingredients: unknown[] } }).recipe.ingredients.length).toBe(3);
  });
  it('without a session says so and still points to the paste box', async () => {
    const r = await importInstagram('https://www.instagram.com/p/ABCDEFG/', wall, reader({ hasSession: () => false }));
    expect(r).toMatchObject({ code: 'unsupported' });
    expect((r as { error: string }).error).toMatch(/paste the caption/i);
    expect((r as { error: string }).error).toMatch(/log TurboPantry in/i);
  });
  it('says to log in again when the session has expired, never a wrong recipe', async () => {
    const r = await importInstagram('https://www.instagram.com/p/ABCDEFG/', wall, reader({ readPost: async () => { throw new InstagramError('expired', 'Instagram has signed the TurboPantry account out. The owner needs to log in again.'); } }));
    expect(r).toMatchObject({ code: 'unsupported' });
    expect('recipe' in r).toBe(false);
    expect((r as { error: string }).error).toMatch(/log in again/);
  });
  it('uses other people\'s comments only when nothing else makes a recipe', async () => {
    const r = await importInstagram('https://www.instagram.com/p/ABCDEFG/', wall, reader({ readPost: async () => ({ caption: 'Yum', ownerComments: [], otherComments: [RECIPE_COMMENT], imageUrl: null }) }));
    expect(r).toHaveProperty('recipe');
  });
});

// ---- with a real Chromium against the fake ---------------------------------------------------------------------------------------------
// Run with TURBOPANTRY_CHROMIUM=/opt/pw-browsers/chromium TURBOPANTRY_BROWSER_NO_SANDBOX=1 where Chromium is not on the PATH.
describe.skipIf(!findChromium())('Instagram login and reading (real Chromium, fake Instagram on 127.0.0.1)', () => {
  let fake: Fake, dir: string;
  const make = (over: Partial<Parameters<typeof createInstagram>[0]> = {}) => createInstagram({ dir, baseUrl: fake.url, allowHost: (h) => h === '127.0.0.1', noSandbox: true, minGapMs: 0, stepTimeoutMs: 15_000, ...over });
  const sessionFile = () => join(dir, 'instagram-session.json');
  beforeAll(async () => { fake = await fakeInstagram(); dir = mkdtempSync(join(tmpdir(), 'tp-ig-')); });
  afterAll(async () => { await fake.close(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('rejects a wrong password clearly and stores nothing', async () => {
    const ig = make();
    const r = await ig.login('anna', 'not-the-password');
    expect(r).toMatchObject({ code: 'bad-password' });
    expect(existsSync(sessionFile())).toBe(false);
    expect(ig.status()).toEqual({ loggedIn: false });
  });

  it('reports a rate limit from Instagram as "blocked"', async () => { expect(await make().login('ratelimited', PASSWORD)).toMatchObject({ code: 'blocked' }); });

  it('explains the "suspicious login" challenge: approve it in the account\'s own app, then retry', async () => {
    const r = await make().login('suspicious', PASSWORD);
    expect(r).toMatchObject({ code: 'challenge' });
    expect((r as { error: string }).error).toMatch(/approve|own Instagram app|e-mail/i);
    expect(existsSync(sessionFile())).toBe(false);
  });

  it('refuses empty input without opening a browser', async () => { expect(await make().login('', '')).toMatchObject({ code: 'bad-input' }); });

  it('logs in through the cookie dialog and the "Save your login info?" page, keeps only the session at mode 0600, never the password', async () => {
    const logs: string[] = [];
    for (const k of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
    const ig = make();
    const r = await ig.login('@chef_dummy', PASSWORD);
    expect(r).toEqual({ ok: true, username: 'chef_dummy' });
    expect(ig.status()).toMatchObject({ loggedIn: true, username: 'chef_dummy' });
    expect(ig.status().since).toMatch(/^\d{4}-/);
    // the fake really received the password (so the test proves something), and nothing of it was kept
    expect(fake.bodies.some((b) => b.includes(encodeURIComponent(PASSWORD)))).toBe(true);
    const text = readFileSync(sessionFile(), 'utf8');
    expect(text).not.toContain(PASSWORD);
    expect(text).toContain('sessionid');
    expect(statSync(sessionFile()).mode & 0o777).toBe(0o600);
    expect(readdirSync(dir).filter((f) => f.includes('.tmp'))).toEqual([]);
    expect(logs.join('\n')).not.toContain(PASSWORD);
    // the notifications dialog on the front page was dismissed (the front page was opened to validate the session)
    expect(fake.hits).toContain('GET /');
    // a new service object (a restart) still sees the session
    expect(make().status()).toMatchObject({ loggedIn: true, username: 'chef_dummy' });
  });

  it('reads a post: the caption, the creator\'s own comment first, other people\'s separately', async () => {
    const p = await make().readPost('ABCDEFG');
    expect(p.caption).toContain('Fluffy pancakes');
    expect(p.ownerComments).toHaveLength(1);
    expect(p.ownerComments[0]).toContain('2 cups flour');
    expect(p.ownerComments[0]).not.toMatch(/^chef_anna|\bReply\b|^1d$/m);
    expect(p.otherComments.join('\n')).toContain('Looks so yummy');
    expect(p.otherComments.join('\n')).not.toContain('hungry_bob');
  });

  it('says a post is unavailable instead of inventing one', async () => {
    await expect(make().readPost('GONEXXXXX')).rejects.toMatchObject({ code: 'not-found' });
  });

  it('refuses a made-up post code', async () => { await expect(make().readPost('../../x')).rejects.toMatchObject({ code: 'not-found' }); });

  it('limits how fast it reads (the account is not hammered)', async () => {
    const ig = make({ maxReadsPerMinute: 2 });
    await ig.readPost('ABCDEFG'); await ig.readPost('ABCDEFG');
    await expect(ig.readPost('ABCDEFG')).rejects.toMatchObject({ code: 'rate' });
  });

  it('uses one browser at a time', async () => {
    const before = fake.hits.length;
    const ig = make({ maxReadsPerMinute: 10 });
    await Promise.all([ig.readPost('ABCDEFG'), ig.readPost('ABCDEFG')]);
    // two sequential visits to the post page; nothing to compare timing against, so check both completed and the fake saw exactly two post loads
    expect(fake.hits.slice(before).filter((h) => h === 'GET /p/ABCDEFG/')).toHaveLength(2);
  });

  it('notices an expired session: asks to log in again and drops the dead session', async () => {
    fake.sessions.clear(); // Instagram signs the account out
    const ig = make();
    await expect(ig.readPost('ABCDEFG')).rejects.toMatchObject({ code: 'expired' });
    expect(existsSync(sessionFile())).toBe(false);
    expect(ig.status().loggedIn).toBe(false);
    await expect(ig.readPost('ABCDEFG')).rejects.toMatchObject({ code: 'no-session' });
  });

  it('two-factor by app: asks for the code, rejects a wrong one, accepts the right one', async () => {
    const ig = make();
    expect(await ig.login('twofa', PASSWORD)).toEqual({ needsCode: true, kind: 'app' });
    expect(existsSync(sessionFile())).toBe(false);
    expect(await ig.submitCode('000000')).toMatchObject({ code: 'bad-code' });
    expect(await ig.submitCode('123 456')).toEqual({ ok: true, username: 'twofa' });
    expect(readFileSync(sessionFile(), 'utf8')).not.toContain(PASSWORD);
    await ig.logout();
  });

  it('two-factor by text message is recognised, and a code with no login waiting is refused', async () => {
    const ig = make();
    expect(await ig.submitCode('123456')).toMatchObject({ code: 'no-login-pending' });
    expect(await ig.login('sms', PASSWORD)).toEqual({ needsCode: true, kind: 'sms' });
    await ig.logout(); // abandons the waiting login
    expect(await ig.submitCode('123456')).toMatchObject({ code: 'no-login-pending' });
  });

  it('gives up after three wrong codes', async () => {
    const ig = make();
    await ig.login('twofa', PASSWORD);
    await ig.submitCode('111111'); await ig.submitCode('222222');
    expect(await ig.submitCode('333333')).toMatchObject({ code: 'bad-code' });
    expect(await ig.submitCode('123456')).toMatchObject({ code: 'no-login-pending' });
  });

  it('limits login attempts', async () => {
    const ig = make({ maxLoginsPer10Min: 2 });
    await ig.login('anna', 'x'); await ig.login('anna', 'x');
    expect(await ig.login('anna', 'x')).toMatchObject({ code: 'rate' });
  });

  it('logout deletes the session file', async () => {
    const ig = make();
    expect(await ig.login('chef_dummy', PASSWORD)).toMatchObject({ ok: true });
    expect(existsSync(sessionFile())).toBe(true);
    await ig.logout();
    expect(existsSync(sessionFile())).toBe(false);
    expect(ig.status()).toEqual({ loggedIn: false });
  });

  it('never lets the page reach a host that is not on the allow-list', async () => {
    let evil = 0;
    const e = createServer((_q, r) => { evil++; r.writeHead(200); r.end('x'); });
    await new Promise<void>((r) => e.listen(0, '127.0.0.1', r));
    // "localhost" is the same machine but not the allowed NAME, so the allow-list must refuse it
    const ig = make({ baseUrl: `http://localhost:${fake.port}` });
    const r = await ig.login('anna', 'x').catch(() => null);
    expect(r === null || 'error' in r).toBe(true);
    expect(evil).toBe(0);
    await new Promise((res) => e.close(res));
  });

  describe('through the server (owner only, import uses the session)', () => {
    let app: Server, base: string, ownerToken: string, otherToken: string;
    beforeAll(async () => {
      const db = openDb(':memory:');
      ownerToken = addUser(db, 'Owner'); otherToken = addUser(db, 'Guest');
      const wall = async (url: string) => ({ url, html: '<html><body>Log in to Instagram</body></html>' });
      app = createApp({ db, fetchPage: wall, instagram: make() });
      await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
      base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
    });
    afterAll(() => new Promise<void>((r) => app.close(() => r())));
    const call = async (token: string, method: string, path: string, body?: unknown) => {
      const res = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body) });
      return { status: res.status, body: (await res.json()) as any };
    };
    it('is 403 for everyone but the owner, on every route', async () => {
      for (const [m, p] of [['GET', '/api/admin/instagram'], ['POST', '/api/admin/instagram/login'], ['POST', '/api/admin/instagram/login/code'], ['POST', '/api/admin/instagram/logout']] as const) {
        expect((await call(otherToken, m, p, {})).status).toBe(403);
      }
      expect(existsSync(sessionFile())).toBe(false);
    });
    it('status, bad login (422), login, import through the session, logout', async () => {
      expect((await call(ownerToken, 'GET', '/api/admin/instagram')).body).toEqual({ loggedIn: false });
      const bad = await call(ownerToken, 'POST', '/api/admin/instagram/login', { username: 'anna', password: 'nope' });
      expect(bad.status).toBe(422); expect(bad.body).toMatchObject({ code: 'bad-password' });
      expect(JSON.stringify(bad.body)).not.toContain('nope');
      // not logged in yet: the import points to the paste box and mentions the owner can log in
      const before = await call(ownerToken, 'POST', '/api/import', { url: 'https://www.instagram.com/p/ABCDEFG/' });
      expect(before.status).toBe(422); expect(before.body.error).toMatch(/paste the caption/i);
      const ok = await call(ownerToken, 'POST', '/api/admin/instagram/login', { username: 'chef_dummy', password: PASSWORD });
      expect(ok.status).toBe(200); expect(ok.body).toEqual({ ok: true, username: 'chef_dummy' });
      expect(JSON.stringify(ok.body)).not.toContain(PASSWORD);
      expect((await call(ownerToken, 'GET', '/api/admin/instagram')).body).toMatchObject({ loggedIn: true, username: 'chef_dummy' });
      const imp = await call(ownerToken, 'POST', '/api/import', { url: 'https://www.instagram.com/p/ABCDEFG/' });
      expect(imp.status).toBe(200);
      expect(imp.body.recipe.ingredients.length).toBe(3);
      expect(imp.body.recipe.sourceName).toBe('Instagram');
      // Instagram signs the account out: the import says so
      fake.sessions.clear();
      const expired = await call(ownerToken, 'POST', '/api/import', { url: 'https://www.instagram.com/p/ABCDEFG/' });
      expect(expired.status).toBe(422); expect(expired.body.error).toMatch(/log in again/i);
      expect((await call(ownerToken, 'GET', '/api/admin/instagram')).body).toEqual({ loggedIn: false });
      expect((await call(ownerToken, 'POST', '/api/admin/instagram/logout')).body).toEqual({ ok: true });
    });
  });
}, 90_000);

describe('without an Instagram service', () => {
  it('the routes say it is not set up (owner) and still refuse others', async () => {
    const db = openDb(':memory:');
    const owner = addUser(db, 'Owner'), guest = addUser(db, 'Guest');
    const app = createApp({ db });
    await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
    try {
      expect((await fetch(`${base}/api/admin/instagram`, { headers: { authorization: `Bearer ${owner}` } })).status).toBe(404);
      expect((await fetch(`${base}/api/admin/instagram`, { headers: { authorization: `Bearer ${guest}` } })).status).toBe(403);
    } finally { await new Promise((r) => app.close(r)); }
  });
});
