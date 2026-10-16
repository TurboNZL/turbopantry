import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { FetchError } from './safeFetch.ts';

/**
 * Renders a page that only exists once its JavaScript has run (Osta) in a headless Chromium and returns the resulting HTML.
 * The browser is the second place (after safeFetch.ts) where this server touches a stranger's address, so it is locked down: every request the page
 * makes is checked against an allow-list of hosts and everything else is aborted before it leaves, images/fonts/media are not loaded at all, and one
 * render runs at a time. Chromium comes from the machine (apt install chromium); playwright-core downloads nothing.
 */
export interface RenderOptions { /** text that must appear on the page before it counts as loaded */ readyText: string; timeoutMs?: number }
export type PageRenderer = (url: string, opts: RenderOptions) => Promise<{ url: string; html: string }>;

/** Hosts an Osta page needs to render: the site itself and the Google services its backend uses. Everything else is refused. */
export const OSTA_HOSTS = (host: string): boolean => /(^|\.)(ostarecipes\.com|googleapis\.com|gstatic\.com|firebaseio\.com|firebaseapp\.com|firebasestorage\.app)$/.test(host);

const CANDIDATES = ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome', 'chrome'];

/** TURBOPANTRY_CHROMIUM, else the first browser found on the PATH, else null. */
export function findChromium(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.TURBOPANTRY_CHROMIUM) return existsSync(env.TURBOPANTRY_CHROMIUM) ? env.TURBOPANTRY_CHROMIUM : null;
  for (const name of CANDIDATES) {
    try { const p = execFileSync('which', [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); if (p) return p; } catch { /* not installed */ }
  }
  return null;
}

export interface BrowserOptions {
  executablePath?: string | null;
  /** Which hosts the page may talk to. Production uses OSTA_HOSTS; only the tests pass something else. */
  allowHost?: (host: string) => boolean;
  /** Chromium refuses to run as root without it, and some containers need it. Set TURBOPANTRY_BROWSER_NO_SANDBOX=1 to force it. */
  noSandbox?: boolean;
}

/** A launched, locked-down browser context. Shared by the Osta renderer and the Instagram session code (instagram-session.ts). */
export interface LockedBrowser { browser: import('playwright-core').Browser; context: import('playwright-core').BrowserContext }
export interface LockOptions extends BrowserOptions {
  /** Saved cookies/storage (Playwright storageState) to start from: the Instagram session. */
  storageState?: string | { cookies: any[]; origins: any[] };
  /** What the page is called in the "no browser" message. */
  purpose?: string;
  /** Pretend to be an ordinary desktop Chrome (Instagram refuses "HeadlessChrome"). Off for Osta, which never needed it. */
  plainUserAgent?: boolean;
  /** Let images, fonts and media load (still only from allowed hosts). ONLY for a page a person is looking at (the Instagram live login view). */
  allowMedia?: boolean;
  /** Page size in CSS pixels and the pixel ratio (the live view lays the page out for the owner's phone). */
  viewport?: { width: number; height: number };
  deviceScaleFactor?: number;
}

/** Starts Chromium and a context in which every request is checked against allowHost (everything else is aborted) and images/fonts/media are never loaded. Caller closes `browser`. */
export async function openLockedBrowser(opts: LockOptions = {}): Promise<LockedBrowser> {
  const allowHost = opts.allowHost ?? OSTA_HOSTS;
  const executablePath = opts.executablePath === undefined ? findChromium() : opts.executablePath;
  if (!executablePath) throw new FetchError('no-browser', `This server has no browser installed for ${opts.purpose ?? 'Osta imports'}. The owner can add one (see the Self-hosting guide).`);
  let chromium;
  try { ({ chromium } = await import('playwright-core')); } catch { throw new FetchError('no-browser', 'The browser component is not installed on this server.'); }
  const noSandbox = opts.noSandbox ?? (process.getuid?.() === 0 || process.env.TURBOPANTRY_BROWSER_NO_SANDBOX === '1');
  const browser = await chromium.launch({ executablePath, headless: true, args: noSandbox ? ['--no-sandbox'] : [] }).catch(() => { throw new FetchError('no-browser', 'The browser on this server could not be started.'); });
  try {
    const userAgent = opts.plainUserAgent ? `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36` : undefined;
    const context = await browser.newContext({ javaScriptEnabled: true, acceptDownloads: false, serviceWorkers: 'block', locale: 'en-US', ...(userAgent ? { userAgent, viewport: opts.viewport ?? { width: 1280, height: 900 } } : opts.viewport ? { viewport: opts.viewport } : {}), ...(opts.deviceScaleFactor ? { deviceScaleFactor: opts.deviceScaleFactor } : {}), ...(opts.storageState ? { storageState: opts.storageState as any } : {}) });
    await context.route('**/*', (route) => {
      const req = route.request();
      let host = '';
      try { host = new URL(req.url()).hostname; } catch { return route.abort(); }
      if (!['http:', 'https:'].includes(new URL(req.url()).protocol) || !allowHost(host)) return route.abort();
      if (!opts.allowMedia && ['image', 'media', 'font'].includes(req.resourceType())) return route.abort();
      return route.continue();
    });
    return { browser, context };
  } catch (e) { await browser.close().catch(() => undefined); throw e; }
}

export function createBrowserRenderer(opts: BrowserOptions = {}): PageRenderer {
  let queue: Promise<unknown> = Promise.resolve();

  async function run(url: string, o: RenderOptions) {
    const { browser, context } = await openLockedBrowser(opts);
    try {
      const page = await context.newPage();
      const timeout = o.timeoutMs ?? 25_000;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      try {
        await page.waitForFunction((t) => [...document.querySelectorAll('p,h1,h2,h3,h4')].some((e) => e.textContent?.trim() === t), o.readyText, { timeout });
      } catch { throw new FetchError('fetch-failed', 'The page did not show a recipe in time. It may be private, deleted, or the site changed.'); }
      return { url: page.url(), html: await page.content() };
    } catch (e) {
      throw e instanceof FetchError ? e : new FetchError('fetch-failed', 'The page could not be loaded.');
    } finally { await browser.close().catch(() => undefined); }
  }

  // one render at a time: a browser is heavy, and the server may be a Raspberry Pi
  return (url, o) => { const next = queue.then(() => run(url, o), () => run(url, o)); queue = next.catch(() => undefined); return next; };
}
