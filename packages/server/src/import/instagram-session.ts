import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { BrowserContext, Page } from 'playwright-core';
import { FetchError } from './safeFetch.ts';
import { openLockedBrowser, type LockedBrowser } from './browser.ts';
import { readEmbed } from './instagram.ts';

/**
 * Instagram through a dummy account's session (the owner's choice; free, no third-party service).
 *
 *  - LOGIN: headless Chromium opens instagram.com/accounts/login/, the owner's typed username and password go into the form ONCE, and only the
 *    resulting session (Playwright storageState: cookies) is kept, in <data>/instagram-session.json with mode 0600. The password is never written
 *    anywhere (not the file, not a log, not an error message) and is not kept after the function returns.
 *  - READ: a post is opened in a browser that starts from that session; the caption and the visible comments are read from the page.
 *  - Same lock-down as browser.ts (host allow-list, no images/fonts/media), ONE Instagram browser at a time, a minimum gap between runs and a
 *    cap per minute so the account is not hammered.
 *
 *  - LIVE LOGIN (liveStart ...): instead of typing the password into our own form, the owner gets a LIVE VIEW of that same locked-down Chromium on
 *    Instagram's own login page (JPEG frames over plain HTTP, taps/keys/text sent back). Instagram's markup never has to be guessed (two-factor,
 *    "was this you?" and cookie dialogs are handled by the owner), and the password never passes through our code as a value: it goes from the owner's
 *    keystrokes straight into the page. When the browser holds a `sessionid` it is validated like the password flow does and saved the same way.
 *    A redirect cannot do this: the session cookie belongs to instagram.com and a browser never hands it to another site.
 *    Same lock, same allow-list (images/fonts ARE loaded here, because the owner has to see the page, but only from allowed hosts), hard time cap,
 *    closed on cancel/logout/abandon/disconnect.
 *
 * HONESTY: written WITHOUT being able to reach Instagram from the build sandbox. Everything below is verified only against a local FAKE Instagram
 * (test/instagram.test.ts). The real login page and post page change often and differ per country/A-B test, so nothing here relies on generated
 * class names: forms are found by input name/type/autocomplete, buttons by role and visible text, outcomes by cookies, the address and the words on
 * the page. If Instagram changes, the failure is always a clear message (never a wrong recipe), and the paste box keeps working.
 * Instagram's terms discourage automated access: the dummy account can be restricted or asked to confirm itself.
 */

/** Hosts a logged-in Instagram page needs. UNVERIFIED against the real site: if pages stay blank, a needed host is missing here. */
export const INSTAGRAM_HOSTS = (host: string): boolean => /(^|\.)(instagram\.com|cdninstagram\.com|facebook\.com|facebook\.net|fbcdn\.net)$/.test(host);

export class InstagramError extends Error {
  code: 'no-session' | 'expired' | 'challenge' | 'rate' | 'not-found' | 'no-browser' | 'failed';
  constructor(code: InstagramError['code'], message: string) { super(message); this.name = 'InstagramError'; this.code = code; }
}

export type LoginErrorCode = 'bad-password' | 'bad-code' | 'challenge' | 'blocked' | 'rate' | 'no-browser' | 'timeout' | 'no-login-pending' | 'bad-input' | 'failed';
export type LoginResult =
  | { ok: true; username: string }
  | { needsCode: true; kind: 'sms' | 'app' }
  | { error: string; code: LoginErrorCode };

export interface InstagramStatus { loggedIn: boolean; username?: string; since?: string }

/** What a logged-in read of a post gives: the creator's own comments come first because that is where the recipe usually is. */
export interface SessionPost { caption: string; ownerComments: string[]; otherComments: string[]; imageUrl: string | null }

/** What importInstagram needs from the session. */
export interface InstagramReader { hasSession(): boolean; readPost(code: string): Promise<SessionPost> }

/** One thing the owner did in the live view. x/y are CSS pixels of the page (0..w, 0..h as returned by liveStart). */
export type LiveEvent =
  | { type: 'tap'; x: number; y: number }
  | { type: 'wheel'; x: number; y: number; dx?: number; dy: number }
  | { type: 'key'; key: string }
  | { type: 'text'; text: string };
export interface LiveStatus {
  id: string; state: 'open' | 'logged-in' | 'closed'; w: number; h: number; seq: number;
  /** why it is closed: cancelled, timeout, abandoned, error, failed (Instagram kept no login) or unknown (no such session) */
  reason?: 'cancelled' | 'timeout' | 'abandoned' | 'error' | 'failed' | 'unknown';
  username?: string; message: string; secondsLeft: number;
}
export class LiveError extends Error {
  status: number; code: 'busy' | 'bad-input' | 'no-live' | 'rate' | 'no-browser' | 'failed';
  constructor(status: number, code: LiveError['code'], message: string) { super(message); this.name = 'LiveError'; this.status = status; this.code = code; }
}

export interface InstagramService extends InstagramReader {
  status(): InstagramStatus;
  /** Opens the live login window (a server-side browser on Instagram's login page). width/height/dpr are the owner's viewport. */
  liveStart(view: { width: number; height: number; dpr?: number }): Promise<{ id: string; w: number; h: number }>;
  /** The newest frame (JPEG) when it differs from `since`; waits up to waitMs for a change, then answers jpeg: null. */
  liveFrame(id: string, since: number, waitMs?: number): Promise<{ seq: number; jpeg: Buffer | null; state: LiveStatus['state'] }>;
  liveInput(id: string, events: unknown): Promise<void>;
  liveStatus(id?: string): LiveStatus;
  liveCancel(id?: string): Promise<LiveStatus>;
  login(username: string, password: string): Promise<LoginResult>;
  submitCode(code: string): Promise<LoginResult>;
  logout(): Promise<void>;
}

export interface InstagramOptions {
  /** Where instagram-session.json lives (the data directory). */
  dir: string;
  baseUrl?: string;
  allowHost?: (host: string) => boolean;
  executablePath?: string | null;
  noSandbox?: boolean;
  /** Reads of posts allowed per minute (default 4). */
  maxReadsPerMinute?: number;
  /** Quiet time between two uses of the browser (default 4 s). */
  minGapMs?: number;
  /** Login attempts allowed per 10 minutes (default 5). */
  maxLoginsPer10Min?: number;
  /** How long to wait for Instagram to answer one step (default 30 s). */
  stepTimeoutMs?: number;
  /** How long a login waits for the two-factor code (default 5 minutes). */
  codeWindowMs?: number;
  /** Hard cap for one live login window (default 5 minutes). */
  liveWindowMs?: number;
  /** The live window closes when nobody has asked for it for this long (default 3 minutes: long enough to fetch a code from another app). */
  liveIdleMs?: number;
  /** Time between two screenshots while the page is changing (default 350 ms, about 3 a second). */
  liveFrameMs?: number;
}

interface SessionFile { v: 1; username: string; since: string; state: { cookies: unknown[]; origins: unknown[] } }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const LIVE_KEYS = new Set(['Backspace', 'Enter', 'Tab', 'Escape', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Space']);
const num = (v: unknown, lo: number, hi: number): number | null => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null;

// ---- words on the page. English only (the browser is started with locale en-US so Instagram answers in English).
const RE_CONSENT = /decline optional cookies|only allow essential cookies|allow (all|essential)( and optional)? cookies|accept all( cookies)?/i;
const RE_NOT_NOW = /^(not now|skip|no thanks|dismiss|maybe later)$/i;
const RE_BAD_PASSWORD = /password was incorrect|password you entered is incorrect|login information you entered is incorrect|incorrect (username|password)|doesn.t belong to an account|check your username|find your account/i;
const RE_BLOCKED = /wait a few minutes|try again later|too many (attempts|requests)|temporarily (blocked|locked)|we limit how often|rate.?limit/i;
const RE_CHALLENGE = /suspicious|confirm it.s you|unusual login|verify your identity|help us confirm|automated behavio|your account has been (locked|disabled)|we suspect automated|confirm your identity/i;
const RE_BAD_CODE = /check the security code|code (you entered )?(is|was) (incorrect|invalid|not valid)|isn.t valid|not a valid code|code is no longer valid|code has expired/i;
const RE_UNAVAILABLE = /this page isn.t available|link you followed may be broken|sorry, this (page|post|content) isn.t available|content isn.t available/i;

const PASSWORD_INPUT = 'input[type="password"]';
const USER_INPUT = 'input[name="username"], input[name="email"], input[autocomplete="username"], input[autocomplete="username webauthn"], input[type="email"]';
const CODE_INPUT = 'input[name="verificationCode"], input[name="security_code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]';

export function createInstagram(opts: InstagramOptions): InstagramService {
  const base = (opts.baseUrl ?? 'https://www.instagram.com').replace(/\/+$/, '');
  const file = join(opts.dir, 'instagram-session.json');
  const allowHost = opts.allowHost ?? INSTAGRAM_HOSTS;
  const maxReads = opts.maxReadsPerMinute ?? 4, minGap = opts.minGapMs ?? 4000, maxLogins = opts.maxLoginsPer10Min ?? 5;
  const stepMs = opts.stepTimeoutMs ?? 30_000, codeWindow = opts.codeWindowMs ?? 5 * 60_000;
  const liveWindow = opts.liveWindowMs ?? 5 * 60_000, liveIdle = opts.liveIdleMs ?? 3 * 60_000, frameMs = opts.liveFrameMs ?? 350;
  const launch = (storageState?: SessionFile['state'], extra: Partial<Parameters<typeof openLockedBrowser>[0]> = {}): Promise<LockedBrowser> =>
    openLockedBrowser({ allowHost, executablePath: opts.executablePath, noSandbox: opts.noSandbox, storageState: storageState as never, purpose: 'Instagram imports', plainUserAgent: true, ...extra });

  // ---- one Instagram browser at a time, with a quiet gap after each use
  let tail: Promise<void> = Promise.resolve(), lastEnd = 0, holders = 0;
  async function lock(): Promise<() => void> {
    holders++;
    let done!: () => void;
    const mine = new Promise<void>((r) => { done = r; });
    const before = tail;
    tail = before.then(() => mine);
    await before;
    const wait = lastEnd + minGap - Date.now();
    if (wait > 0) await sleep(wait);
    let released = false;
    return () => { if (released) return; released = true; holders--; lastEnd = Date.now(); done(); };
  }
  const reads: number[] = [], logins: number[] = [];
  const recent = (list: number[], windowMs: number) => { const cut = Date.now() - windowMs; while (list.length && list[0]! < cut) list.shift(); return list.length; };

  // ---- the session file: cookies only, mode 0600
  function load(): SessionFile | null {
    try { const s = JSON.parse(readFileSync(file, 'utf8')) as SessionFile; return s?.v === 1 && Array.isArray(s.state?.cookies) ? s : null; } catch { return null; }
  }
  function save(s: SessionFile) {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 });
    chmodSync(tmp, 0o600); // the umask can only remove permissions, but be explicit
    renameSync(tmp, file);
  }
  const drop = () => { try { rmSync(file, { force: true }); } catch { /* nothing to delete */ } };

  // ---- page helpers
  const visible = async (page: Page, selector: string) => { try { return await page.locator(selector).first().isVisible(); } catch { return false; } };
  const bodyText = async (page: Page) => { try { return await page.evaluate(() => document.body?.innerText ?? ''); } catch { return ''; } };
  const hasSession = async (ctx: BrowserContext) => (await ctx.cookies()).some((c) => c.name === 'sessionid' && !!c.value);

  /** Clicks away the cookie dialog and the "Save your login info?" / "Turn on notifications" pages, whichever are showing. Never fails. */
  async function dismiss(page: Page, rounds = 4) {
    for (let i = 0; i < rounds; i++) {
      let clicked = false;
      for (const name of [RE_CONSENT, RE_NOT_NOW]) {
        try {
          const b = page.getByRole('button', { name }).first();
          if (await b.isVisible()) { await b.click({ timeout: 3000 }); clicked = true; await sleep(400); break; }
        } catch { /* it went away while we looked */ }
      }
      if (!clicked) return;
    }
  }

  type Outcome = { kind: 'ok' } | { kind: 'code'; mode: 'sms' | 'app' } | { kind: 'error'; code: LoginErrorCode; message: string };

  /** Waits for Instagram to answer a submitted form and says what it answered. */
  async function settle(page: Page, ctx: BrowserContext, step: 'password' | 'code'): Promise<Outcome> {
    const until = Date.now() + stepMs;
    while (Date.now() < until) {
      await sleep(350);
      if (page.isClosed()) return { kind: 'error', code: 'failed', message: 'The browser closed while logging in.' };
      if (await hasSession(ctx)) return { kind: 'ok' };
      const url = page.url();
      const text = await bodyText(page);
      if (!text) continue; // mid-navigation
      const onCode = (await visible(page, CODE_INPUT)) || /two_factor|\/accounts\/login\/two/.test(url);
      if (onCode) {
        if (step === 'code' && RE_BAD_CODE.test(text)) return { kind: 'error', code: 'bad-code', message: 'Instagram did not accept that code. Check it and try again (codes from an app change every 30 seconds).' };
        if (step === 'password') return { kind: 'code', mode: /authentication app|authenticator|app you use/i.test(text) ? 'app' : /text message|sms|phone number ending|sent to your phone/i.test(text) ? 'sms' : 'app' };
        continue;
      }
      if (/\/challenge\b/.test(url) || RE_CHALLENGE.test(text)) return { kind: 'error', code: 'challenge', message: 'Instagram wants to check that this login is really you. Open the dummy account in its own Instagram app (or its e-mail), approve the login attempt ("This was me"), then log in here again.' };
      if (RE_BLOCKED.test(text)) return { kind: 'error', code: 'blocked', message: 'Instagram is limiting logins from this server. Wait an hour or two before trying again, and do not retry in a loop.' };
      if (RE_BAD_PASSWORD.test(text)) return { kind: 'error', code: 'bad-password', message: 'Instagram says the username or the password is wrong.' };
    }
    return { kind: 'error', code: step === 'code' ? 'bad-code' : 'timeout', message: step === 'code' ? 'Instagram did not accept that code in time. Try again.' : 'Instagram did not answer in time. Try again in a few minutes.' };
  }

  /** Dismisses the follow-up pages, then proves the session works by opening the front page, and only then writes the file. */
  async function finish(page: Page, ctx: BrowserContext, username: string): Promise<LoginResult> {
    await dismiss(page);
    try { await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: stepMs }); } catch { /* checked below */ }
    await dismiss(page, 2);
    const text = await bodyText(page);
    const loginForm = await visible(page, PASSWORD_INPUT);
    if (loginForm || /\/accounts\/login|\/challenge\b/.test(page.url()) || !(await hasSession(ctx))) {
      return RE_CHALLENGE.test(text) || /\/challenge\b/.test(page.url())
        ? { error: 'Instagram wants to check that this login is really you. Approve it from the dummy account\'s own app or e-mail, then log in here again.', code: 'challenge' }
        : { error: 'Instagram accepted the password but did not keep the login. Try again in a few minutes.', code: 'failed' };
    }
    const state = await ctx.storageState();
    save({ v: 1, username, since: new Date().toISOString(), state: state as SessionFile['state'] });
    return { ok: true, username };
  }

  // ---- login (two steps when there is a two-factor code)
  interface Pending { lb: LockedBrowser; page: Page; username: string; release: () => void; timer: NodeJS.Timeout; tries: number }
  let pending: Pending | null = null;
  async function closePending() {
    const p = pending; if (!p) return;
    pending = null; clearTimeout(p.timer);
    await p.lb.browser.close().catch(() => undefined);
    p.release();
  }

  const fail = (code: LoginErrorCode, error: string): LoginResult => ({ error, code });
  const noBrowser = (e: unknown): LoginResult | null => e instanceof FetchError && e.code === 'no-browser' ? fail('no-browser', e.message) : null;

  async function login(usernameIn: string, password: string): Promise<LoginResult> {
    const username = String(usernameIn ?? '').trim().replace(/^@/, '');
    if (!username || !password || username.length > 128 || password.length > 256) return fail('bad-input', 'Enter the username and the password of the dummy Instagram account.');
    if (recent(logins, 10 * 60_000) >= maxLogins) return fail('rate', 'Too many login attempts in a short time. Wait ten minutes: repeated logins are what makes Instagram restrict an account.');
    if (live?.state === 'open') return fail('failed', 'The Instagram login window is open. Finish it or cancel it first.');
    logins.push(Date.now());
    await closePending();
    const release = await lock();
    let lb: LockedBrowser | null = null;
    let kept = false;
    try {
      lb = await launch();
      const page = await lb.context.newPage();
      page.setDefaultTimeout(stepMs);
      await page.goto(`${base}/accounts/login/`, { waitUntil: 'domcontentloaded', timeout: stepMs });
      await dismiss(page);
      // the form may render a moment after the page loads
      try { await page.locator(PASSWORD_INPUT).first().waitFor({ state: 'visible', timeout: stepMs }); }
      catch { return fail('failed', 'The Instagram login page did not show a login form. Instagram may have changed it, or may be refusing this server.'); }
      await page.locator(USER_INPUT).first().fill(username);
      await page.locator(PASSWORD_INPUT).first().fill(password);
      await page.locator(PASSWORD_INPUT).first().press('Enter');
      const out = await settle(page, lb.context, 'password');
      if (out.kind === 'code') {
        // keep the browser (and the lock: nothing else may use Instagram meanwhile) until the code is sent or the window passes
        const timer = setTimeout(() => { void closePending(); }, codeWindow);
        timer.unref?.();
        pending = { lb, page, username, release, timer, tries: 0 };
        kept = true;
        return { needsCode: true, kind: out.mode };
      }
      if (out.kind === 'error') return fail(out.code, out.message);
      return await finish(page, lb.context, username);
    } catch (e) {
      return noBrowser(e) ?? fail('failed', 'Logging in did not work. Instagram may be slow or may have changed its page.');
    } finally {
      if (!kept) { await lb?.browser.close().catch(() => undefined); release(); }
    }
  }

  async function submitCode(codeIn: string): Promise<LoginResult> {
    const p = pending;
    if (!p) return fail('no-login-pending', 'There is no login waiting for a code. Log in again to get a new one.');
    const code = String(codeIn ?? '').replace(/\s+/g, '');
    if (!/^\d{4,10}$/.test(code)) return fail('bad-code', 'The code is the 6 digits from the text message or the authentication app.');
    try {
      await p.page.locator(CODE_INPUT).first().fill(code);
      await p.page.locator(CODE_INPUT).first().press('Enter');
      const out = await settle(p.page, p.lb.context, 'code');
      if (out.kind === 'error' && out.code === 'bad-code') {
        if (++p.tries >= 3) { await closePending(); return fail('bad-code', 'That code was not accepted three times. Log in again to get a new one.'); }
        return fail('bad-code', out.message);
      }
      const result = out.kind === 'ok' ? await finish(p.page, p.lb.context, p.username) : out.kind === 'error' ? fail(out.code, out.message) : fail('failed', 'Instagram asked for another code. Log in again.');
      await closePending();
      return result;
    } catch {
      await closePending();
      return fail('failed', 'Sending the code did not work. Log in again.');
    }
  }

  // ---- reading a post
  const LOGIN_AGAIN = 'Instagram has signed the TurboPantry account out. The owner needs to log in again (Settings, Server, Instagram), or you can paste the caption below.';

  async function readPost(code: string): Promise<SessionPost> {
    const s = load();
    if (!s) throw new InstagramError('no-session', 'The server is not logged in to Instagram. The owner can log in with a spare account (Settings, Server, Instagram), or you can paste the caption below.');
    if (!/^[A-Za-z0-9_-]{5,40}$/.test(code)) throw new InstagramError('not-found', 'That is not an Instagram post link.');
    if (recent(reads, 60_000) >= maxReads) throw new InstagramError('rate', 'TurboPantry limits how fast it reads Instagram, to keep the account safe. Wait a minute and try again.');
    if (live?.state === 'open') throw new InstagramError('failed', 'The Instagram login window is open. Finish it or cancel it first.');
    reads.push(Date.now());
    const release = await lock();
    let lb: LockedBrowser | null = null;
    try {
      try { lb = await launch(s.state); } catch (e) { if (e instanceof FetchError && e.code === 'no-browser') throw new InstagramError('no-browser', e.message); throw e; }
      const page = await lb.context.newPage();
      page.setDefaultTimeout(stepMs);
      await page.goto(`${base}/p/${code}/`, { waitUntil: 'domcontentloaded', timeout: stepMs }).catch(() => { throw new InstagramError('failed', 'Instagram did not answer in time. Try again in a few minutes, or paste the caption below.'); });
      await dismiss(page, 2);
      const until = Date.now() + stepMs;
      for (;;) {
        const url = page.url();
        if (/\/accounts\/login|\/accounts\/suspended/.test(url) || (await visible(page, PASSWORD_INPUT))) { drop(); throw new InstagramError('expired', LOGIN_AGAIN); }
        const text = await bodyText(page);
        if (/\/challenge\b/.test(url) || RE_CHALLENGE.test(text)) throw new InstagramError('challenge', 'Instagram wants the TurboPantry account to confirm it is really the owner. Approve it from that account\'s own app or e-mail, then try again.');
        if (RE_UNAVAILABLE.test(text)) throw new InstagramError('not-found', 'Instagram says that post is not available. It may be private, deleted, or from an account the TurboPantry account may not see. Paste the caption below instead.');
        if (await page.locator('article h1, main h1, article time, main time').first().isVisible().catch(() => false)) break;
        if (Date.now() > until) throw new InstagramError('failed', 'The post did not show in time. Instagram may have changed its page; paste the caption below instead.');
        await sleep(400);
      }
      // expand "more" on a long caption, and load a few more comments (a small, fixed number of clicks)
      for (let i = 0; i < 4; i++) {
        let clicked = false;
        for (const sel of [page.getByRole('button', { name: /^(more|… more|\.\.\. more)$/i }).first(), page.getByRole('button', { name: /load more comments|view more comments|view all \d+ comments/i }).first()]) {
          try { if (await sel.isVisible()) { await sel.click({ timeout: 2000 }); clicked = true; await sleep(600); } } catch { /* ignore */ }
        }
        if (!clicked) break;
      }
      const dom = await page.evaluate(extractInPage);
      const html = await page.content();
      const embed = readEmbed(html); // the same three caption strategies as the anonymous embed, as a fallback for the page's own data
      const caption = (dom.caption || embed?.caption || '').trim();
      if (!caption && !dom.comments.length) throw new InstagramError('failed', 'The post opened, but no caption could be read from it. Instagram may have changed its page; paste the caption below instead.');
      const clean = (t: string) => t.trim();
      const seen = new Set<string>([caption]);
      const owner: string[] = [], other: string[] = [];
      for (const c of dom.comments) {
        const t = clean(c.text);
        if (t.length < 2 || seen.has(t)) continue;
        seen.add(t);
        (dom.owner && c.user.toLowerCase() === dom.owner.toLowerCase() ? owner : other).push(t);
      }
      return { caption, ownerComments: owner.slice(0, 10), otherComments: other.slice(0, 30), imageUrl: dom.image || embed?.imageUrl || null };
    } finally {
      await lb?.browser.close().catch(() => undefined);
      release();
    }
  }


  // ---- live login window ---------------------------------------------------------------------------------------------------------------
  interface Live {
    id: string; lb: LockedBrowser; release: () => void; w: number; h: number; dpr: number;
    seq: number; frame: Buffer | null; state: LiveStatus['state']; reason?: LiveStatus['reason']; message: string; username: string;
    deadline: number; lastSeen: number; lastFrameAsk: number; lastChange: number; timer: NodeJS.Timeout;
    pages: Page[]; internal: Page | null; waiters: (() => void)[]; poke: (() => void) | null; inputs: number[]; tries: number; nextCheck: number; closing: boolean;
  }
  let live: Live | null = null; // the current window, or the last finished one (so a late status call still gets its answer)
  const MSG_WAIT = 'Waiting for you to log in…';

  const livePage = (l: Live): Page | null => { for (let i = l.pages.length - 1; i >= 0; i--) if (!l.pages[i]!.isClosed()) return l.pages[i]!; return null; };
  const wake = (l: Live) => { const w = l.waiters.splice(0); for (const f of w) f(); };

  async function endLive(l: Live, state: 'logged-in' | 'closed', reason: LiveStatus['reason'] | undefined, message: string, username?: string) {
    if (l.closing) return;
    l.closing = true;
    clearTimeout(l.timer);
    l.state = state; l.reason = reason; l.message = message; if (username !== undefined) l.username = username;
    wake(l); l.poke?.();
    await l.lb.browser.close().catch(() => undefined);
    l.release();
  }

  async function captureLive(l: Live) {
    const page = livePage(l);
    if (!page) return;
    try {
      const jpeg = await page.screenshot({ type: 'jpeg', quality: 60, timeout: 5000 });
      if (l.state !== 'open') return;
      if (!l.frame || !jpeg.equals(l.frame)) { l.frame = jpeg; l.seq++; l.lastChange = Date.now(); wake(l); }
    } catch { /* mid-navigation or closing: the next round tries again */ }
  }

  /** The login worked in the owner's page: prove it the way the password flow does (front page opens, no login form), then save. */
  async function checkLiveSession(l: Live) {
    const ctx = l.lb.context;
    let p2: Page | null = null;
    try {
      p2 = await ctx.newPage(); l.internal = p2;
      p2.setDefaultTimeout(stepMs);
      await p2.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: stepMs }).catch(() => undefined);
      await dismiss(p2, 2);
      const loginForm = await visible(p2, PASSWORD_INPUT);
      const ok = !loginForm && !/\/accounts\/login|\/challenge\b/.test(p2.url()) && (await hasSession(ctx));
      if (!ok) {
        l.tries++; l.nextCheck = Date.now() + 3000;
        if (l.tries >= 3) await endLive(l, 'closed', 'failed', 'Instagram did not keep the login. Try again in a few minutes.');
        return;
      }
      let username = l.username.replace(/^@/, '').trim();
      if (!username) {
        // the front page links the logged-in profile in its navigation; the account number is the last resort
        try { username = await p2.evaluate(() => { const a = [...document.querySelectorAll('a[href^="/"]')].find((x) => /^profile$/i.test((x.getAttribute('aria-label') ?? x.textContent ?? '').trim())); return /^\/([A-Za-z0-9._]+)\/?$/.exec(a?.getAttribute('href') ?? '')?.[1] ?? ''; }); } catch { /* none */ }
      }
      if (!username) { const id = (await ctx.cookies()).find((c) => c.name === 'ds_user_id')?.value; username = id ? `account ${id.replace(/\D/g, '').slice(0, 20)}` : 'the Instagram account'; }
      if (l.state !== 'open') return;
      const state = await ctx.storageState();
      save({ v: 1, username: username.slice(0, 128), since: new Date().toISOString(), state: state as SessionFile['state'] });
      await endLive(l, 'logged-in', undefined, `Logged in as ${username}. The login is saved.`, username);
    } catch {
      l.tries++; l.nextCheck = Date.now() + 3000;
      if (l.tries >= 3) await endLive(l, 'closed', 'failed', 'Instagram did not keep the login. Try again in a few minutes.');
    } finally { l.internal = null; await p2?.close().catch(() => undefined); }
  }

  async function liveLoop(l: Live) {
    while (l.state === 'open' && !l.closing) {
      const now = Date.now();
      if (now > l.deadline) { await endLive(l, 'closed', 'timeout', 'The login window was open for 5 minutes and was closed. Open it again to try once more.'); return; }
      if (now - l.lastSeen > liveIdle) { await endLive(l, 'closed', 'abandoned', 'The login window was closed because nobody was looking at it.'); return; }
      try {
        const page = livePage(l);
        if (page) {
          // remember what was typed in the USERNAME box (never the password) so the saved session can say whose it is
          const u = await page.evaluate((sel) => (document.querySelector(sel) as HTMLInputElement | null)?.value ?? '', USER_INPUT).catch(() => '');
          if (u && u.length <= 128) l.username = u;
        }
        if (now >= l.nextCheck && (await hasSession(l.lb.context))) { await checkLiveSession(l); if (l.state !== 'open') return; }
      } catch { /* the page is changing */ }
      if (l.frame === null || now - l.lastFrameAsk < 20_000) await captureLive(l);
      const idleFor = Date.now() - l.lastChange;
      await Promise.race([sleep(idleFor > 5000 ? 1000 : frameMs), new Promise<void>((r) => { l.poke = r; })]);
      l.poke = null;
    }
  }

  async function liveStart(view: { width: number; height: number; dpr?: number }) {
    const w = num(view?.width, 240, 4000), h = num(view?.height, 240, 4000);
    if (w === null || h === null) throw new LiveError(400, 'bad-input', 'The size of the screen is missing.');
    const width = Math.round(Math.min(w, 1280)), height = Math.round(Math.min(h, 1800));
    const dpr = Math.min(2, Math.max(1, num(view?.dpr, 0.5, 8) ?? 1));
    await closePending();
    if (live?.state === 'open' || holders > 0) throw new LiveError(409, 'busy', 'Instagram is busy with another login or import. Wait a moment and try again, or cancel the window that is open.');
    if (recent(logins, 10 * 60_000) >= maxLogins) throw new LiveError(429, 'rate', 'Too many login attempts in a short time. Wait ten minutes: repeated logins are what makes Instagram restrict an account.');
    logins.push(Date.now());
    const release = await lock();
    let lb: LockedBrowser | null = null, made: Live | null = null;
    try {
      try { lb = await launch(undefined, { allowMedia: true, viewport: { width, height }, deviceScaleFactor: dpr }); }
      catch (e) { throw e instanceof FetchError && e.code === 'no-browser' ? new LiveError(422, 'no-browser', e.message) : e; }
      const page = await lb.context.newPage();
      page.setDefaultTimeout(stepMs);
      const l: Live = {
        id: randomBytes(12).toString('hex'), lb, release, w: width, h: height, dpr, seq: 0, frame: null, state: 'open', message: MSG_WAIT, username: '',
        deadline: Date.now() + liveWindow, lastSeen: Date.now(), lastFrameAsk: Date.now(), lastChange: Date.now(), timer: undefined as never,
        pages: [page], internal: null, waiters: [], poke: null, inputs: [], tries: 0, nextCheck: 0, closing: false,
      };
      made = l;
      l.timer = setTimeout(() => { void endLive(l, 'closed', 'timeout', 'The login window was open for 5 minutes and was closed. Open it again to try once more.'); }, liveWindow);
      l.timer.unref?.();
      lb.context.on('page', (np) => { if (np === l.internal) return; l.pages.push(np); np.setDefaultTimeout(stepMs); np.on('dialog', (d) => { void d.dismiss().catch(() => undefined); }); });
      page.on('dialog', (d) => { void d.dismiss().catch(() => undefined); });
      lb.browser.on('disconnected', () => { void endLive(l, 'closed', 'error', 'The browser on the server stopped.'); });
      await page.goto(`${base}/accounts/login/`, { waitUntil: 'domcontentloaded', timeout: stepMs }).catch(() => { throw new LiveError(502, 'failed', 'The Instagram login page did not open. Instagram may be slow, or may be refusing this server.'); });
      live = l;
      void liveLoop(l);
      return { id: l.id, w: width, h: height };
    } catch (e) {
      if (made) { clearTimeout(made.timer); made.closing = true; }
      await lb?.browser.close().catch(() => undefined);
      release();
      throw e;
    }
  }

  const current = (id: string): Live => {
    if (!live || live.id !== id) throw new LiveError(404, 'no-live', 'That login window is not open any more.');
    return live;
  };
  const statusOf = (l: Live): LiveStatus => ({ id: l.id, state: l.state, w: l.w, h: l.h, seq: l.seq, ...(l.reason ? { reason: l.reason } : {}), ...(l.username && l.state === 'logged-in' ? { username: l.username } : {}), message: l.message, secondsLeft: l.state === 'open' ? Math.max(0, Math.round((l.deadline - Date.now()) / 1000)) : 0 });

  async function liveFrame(id: string, since: number, waitMs = 0) {
    const l = current(id);
    l.lastSeen = l.lastFrameAsk = Date.now();
    if (l.state === 'open' && l.frame && l.seq !== since) return { seq: l.seq, jpeg: l.frame, state: l.state };
    if (l.state === 'open' && waitMs > 0) {
      l.poke?.();
      await new Promise<void>((r) => { const t = setTimeout(r, Math.min(waitMs, 5000)); t.unref?.(); l.waiters.push(() => { clearTimeout(t); r(); }); });
      l.lastSeen = Date.now();
      if (l.state === 'open' && l.frame && l.seq !== since) return { seq: l.seq, jpeg: l.frame, state: l.state };
    }
    return { seq: l.seq, jpeg: null, state: l.state };
  }

  async function liveInput(id: string, events: unknown) {
    const l = current(id);
    if (l.state !== 'open') throw new LiveError(404, 'no-live', 'That login window is not open any more.');
    if (!Array.isArray(events) || events.length === 0 || events.length > 50) throw new LiveError(400, 'bad-input', 'Send between 1 and 50 events at a time.');
    if (recent(l.inputs, 10_000) >= 200) throw new LiveError(429, 'rate', 'Too many inputs. Slow down.');
    // validate everything before touching the page: all or nothing
    const todo: LiveEvent[] = [];
    for (const raw of events) {
      const e = raw as Record<string, unknown> | null;
      if (!e || typeof e !== 'object') throw new LiveError(400, 'bad-input', 'Unknown input.');
      if (e.type === 'tap') { const x = num(e.x, 0, l.w), y = num(e.y, 0, l.h); if (x === null || y === null) throw new LiveError(400, 'bad-input', 'The tap is outside the page.'); todo.push({ type: 'tap', x, y }); }
      else if (e.type === 'wheel') { const x = num(e.x, 0, l.w), y = num(e.y, 0, l.h), dy = num(e.dy, -3000, 3000), dx = e.dx === undefined ? 0 : num(e.dx, -3000, 3000); if (x === null || y === null || dy === null || dx === null) throw new LiveError(400, 'bad-input', 'The scroll is outside the page.'); todo.push({ type: 'wheel', x, y, dx, dy }); }
      else if (e.type === 'key') { const k = e.key; if (typeof k !== 'string' || !(LIVE_KEYS.has(k) || [...k].length === 1) || /[\u0000-\u001f\u007f]/.test(k)) throw new LiveError(400, 'bad-input', 'That key is not allowed.'); todo.push({ type: 'key', key: k }); }
      else if (e.type === 'text') { const t = e.text; if (typeof t !== 'string' || t.length === 0 || t.length > 200 || /[\u0000-\u001f\u007f]/.test(t)) throw new LiveError(400, 'bad-input', 'The text must be 1 to 200 characters on one line.'); todo.push({ type: 'text', text: t }); }
      else throw new LiveError(400, 'bad-input', 'Unknown input.');
    }
    l.inputs.push(Date.now()); l.lastSeen = Date.now();
    const page = livePage(l);
    if (!page) return;
    for (const e of todo) {
      try {
        if (e.type === 'tap') await page.mouse.click(e.x, e.y);
        else if (e.type === 'wheel') { await page.mouse.move(e.x, e.y); await page.mouse.wheel(e.dx ?? 0, e.dy); }
        else if (e.type === 'key') { if ([...e.key].length === 1) await page.keyboard.type(e.key); else await page.keyboard.press(e.key); }
        else await page.keyboard.type(e.text);
      } catch { /* the page moved on; the next frame shows what happened */ }
    }
    l.lastChange = Date.now();
    const t = setTimeout(() => l.poke?.(), 180); t.unref?.();
  }

  function liveStatus(id?: string): LiveStatus {
    if (!live || (id && live.id !== id)) return { id: id ?? '', state: 'closed', reason: 'unknown', w: 0, h: 0, seq: 0, message: 'That login window is not open any more.', secondsLeft: 0 };
    live.lastSeen = Date.now();
    return statusOf(live);
  }

  async function liveCancel(id?: string): Promise<LiveStatus> {
    if (live && (!id || live.id === id) && live.state === 'open') await endLive(live, 'closed', 'cancelled', 'Cancelled.');
    return liveStatus(id);
  }

  return {
    status() { const s = load(); return s ? { loggedIn: true, username: s.username, since: s.since } : { loggedIn: false }; },
    hasSession: () => existsSync(file) && !!load(),
    login, submitCode, readPost,
    liveStart, liveFrame, liveInput, liveStatus, liveCancel,
    async logout() { await closePending(); if (live?.state === 'open') await endLive(live, 'closed', 'cancelled', 'Cancelled.'); drop(); },
  };
}

/**
 * Runs INSIDE the page. Finds the creator's name, the caption and the comments by structure (h1, list items with a profile link), not by Instagram's
 * generated class names. UNVERIFIED on the real site; the fake in the tests has the structure this expects.
 */
export function extractInPage(): { owner: string; caption: string; comments: { user: string; text: string }[]; image: string } {
  const root = (document.querySelector('article') ?? document.querySelector('main') ?? document.body) as HTMLElement;
  const profile = (a: Element | null) => { const m = /^\/([A-Za-z0-9._]+)\/?$/.exec(a?.getAttribute('href') ?? ''); return m && !['p', 'reel', 'explore', 'accounts', 'direct'].includes(m[1]!) ? m[1]! : ''; };
  const links = [...root.querySelectorAll('a[href^="/"]')];
  const header = root.querySelector('header');
  const owner = profile(header?.querySelector('a[href^="/"]') ?? null) || profile(links.find((a) => profile(a)) ?? null);
  const NOISE = /^(\d+\s?(s|m|h|d|w|y|sec|secs|min|mins|hr|hrs|hour|hours|day|days|week|weeks)|reply|like|liked|see translation|edited|hide replies|verified|pinned|author|creator|more|… more|\d[\d,.]*\s*(likes?|k|m)?|view (all )?\d* ?(more )?repl(y|ies).*)$/i;
  let caption = '';
  const comments: { user: string; text: string }[] = [];
  for (const li of [...root.querySelectorAll('li')]) {
    const a = [...li.querySelectorAll('a[href^="/"]')].find((x) => profile(x));
    const user = profile(a ?? null);
    if (!user) continue;
    let own = (li as HTMLElement).innerText ?? '';
    for (const nested of [...li.querySelectorAll('li')]) own = own.replace((nested as HTMLElement).innerText ?? '', '');
    const lines = own.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines[0]?.toLowerCase() === user.toLowerCase() || lines[0]?.toLowerCase() === (a?.textContent ?? '').trim().toLowerCase()) lines.shift();
    const TOKEN = /^(\d+(s|m|h|d|w|y)|reply|like|likes|liked|see|translation|edited|verified|\d[\d,.]*)$/i;
    const text = lines.filter((l) => !NOISE.test(l) && !l.split(/\s+/).every((t) => TOKEN.test(t))).join('\n').trim(); // "1d Reply" is one line when the spans sit side by side
    if (!text) continue;
    if (!caption && li.querySelector('h1')) caption = text;
    else comments.push({ user, text });
  }
  if (!caption) { const h1 = root.querySelector('h1'); if (h1) caption = ((h1 as HTMLElement).innerText ?? '').trim(); }
  const image = document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '';
  return { owner, caption, comments, image };
}
