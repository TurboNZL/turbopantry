import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { APP_NAME, type Health, type Status } from '@turbopantry/shared';
import { countUsers, userForToken, type Db, type User } from './db.ts';
import { countRecipes, createRecipe, deleteRecipe, getRecipe, listRecipes, updateRecipe, validateRecipe } from './recipes.ts';
import { HttpError, json, readJson } from './http.ts';
import { Hub } from './events.ts';
import { countOpen } from './list.ts';
import { linkIngredients, suggestionsFor } from './link.ts';
import { pantryRoutes } from './pantry-routes.ts';
import { extraRoutes } from './extra-routes.ts';
import { cacheImage, IMAGE_PATH, TYPE_OF } from './images.ts';
import { importFromText, importFromUrl } from './import/index.ts';
import type { Updater } from './update.ts';
import type { PageFetcher } from './import/safeFetch.ts';
import { safeFetchPage, safeFetchPicture, type PictureFetcher } from './import/safeFetch.ts';
import type { PageRenderer } from './import/browser.ts';


const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json',
};

function bearer(req: IncomingMessage): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');
  return m?.[1] ?? null;
}

/** Pages that may call /api from another origin: the Android app's WebView serves the web client from http://localhost (apps/android). */
export const DEFAULT_CORS_ORIGINS = ['http://localhost'];
const CORS_ALLOW_HEADERS = 'Authorization, Content-Type, Range, CF-Access-Client-Id, CF-Access-Client-Secret';
/** CORS answer headers for a request from `origin`, or null when that origin is not allowed (the browser then blocks the page, as before). Never '*': the API takes tokens. */
export function corsHeaders(origin: string | undefined, allowed: string[]): Record<string, string> | null {
  return origin && allowed.includes(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : null;
}

export interface AppOptions { db: Db; webDir?: string; /** Where recipe photos are kept (saved from the website when a recipe is saved). Absent = photos stay hotlinked. */ imagesDir?: string; fetchPicture?: PictureFetcher; /** How pages are fetched for import. Tests pass a fake; the default refuses private addresses. */ fetchPage?: PageFetcher; /** Renders JavaScript-only pages (Osta links). index.ts passes the real headless browser; tests pass a fake. */ render?: PageRenderer; /** Present only when this server can update itself (see update.ts and index.ts). */ updater?: Updater; /** Shown by /api/health. index.ts reads it from git (the newest tag, e.g. v2026.10.3). */ version?: string; /** Origins allowed to call /api from a page (CORS). Default: the Android app's http://localhost. */ corsOrigins?: string[] }

/** The whole HTTP surface. Every /api route except /api/health needs a token: the server is meant to sit behind a public tunnel. */
export function createApp({ db, webDir, imagesDir, fetchPicture = safeFetchPicture, fetchPage = safeFetchPage, render, updater, version = 'dev', corsOrigins = DEFAULT_CORS_ORIGINS }: AppOptions): Server {
  const hub = new Hub();
  const server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (e instanceof HttpError) return json(res, e.status, { error: e.message });
      console.error(e);
      if (!res.headersSent) json(res, 500, { error: 'Server error' }); else res.end();
    });
  });
  server.on('close', () => hub.closeAll());
  return server;

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;

    if (path.startsWith('/api/')) {
      const cors = corsHeaders(req.headers.origin, corsOrigins);
      for (const [k, v] of Object.entries(cors ?? {})) res.setHeader(k, v);
      // a preflight carries no token (and no Cloudflare Access headers), so it is answered before the token check
      if (req.method === 'OPTIONS' && cors) {
        res.writeHead(204, { 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS', 'access-control-allow-headers': CORS_ALLOW_HEADERS, 'access-control-max-age': '86400' });
        return res.end();
      }
    }
    if (path === '/api/health' && req.method === 'GET') {
      return json(res, 200, { ok: true, name: APP_NAME, version } satisfies Health);
    }
    const img = IMAGE_PATH.exec(path);
    if (img && imagesDir && (req.method === 'GET' || req.method === 'HEAD')) {
      // a photo is named by the hash of its content, so the name is the only key needed and it can be cached for good
      const file = join(imagesDir, `${img[1]}.${img[2]}`);
      if (!existsSync(file)) return json(res, 404, { error: 'No such picture' });
      res.writeHead(200, { 'content-type': TYPE_OF[img[2]!]!, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' });
      if (req.method === 'HEAD') return res.end();
      createReadStream(file).pipe(res); return;
    }
    if (path.startsWith('/api/')) {
      const token = bearer(req);
      const user = token ? userForToken(db, token) : null;
      if (!user) return json(res, 401, { error: 'Wrong or missing token' });
      if (path === '/api/status' && req.method === 'GET') {
        return json(res, 200, { user: user.name, users: countUsers(db), recipes: countRecipes(db), lists: countOpen(db) } satisfies Status);
      }
      return api(path, url, req, res, user);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
    return serveWeb(path, req, res);
  }

  async function api(path: string, url: URL, req: IncomingMessage, res: ServerResponse, user: User) {
    const m = req.method ?? 'GET';
    const userName = user.name;
    if (path === '/api/events' && m === 'GET') { hub.join(req, res); return; }
    if (await pantryRoutes(path, m, req, res, db, user, hub)) return;
    if (await extraRoutes(path, m, req, res, db, user, hub)) return;
    if (path === '/api/admin/update') {
      if (!user.isAdmin) return json(res, 403, { error: 'Only the owner (the first account) can update the server.' });
      if (m === 'GET') return json(res, 200, { available: !!updater?.available, restarts: !!updater?.restarts, ...(updater?.state() ?? { status: 'idle', log: [], startedAt: null, restarting: false }) });
      if (m === 'POST') {
        if (!updater?.available) return json(res, 404, { error: 'This server cannot update itself.' });
        return updater.start() ? json(res, 202, { ok: true }) : json(res, 409, { error: 'An update is already running.' });
      }
      return json(res, 405, { error: 'Method not allowed' });
    }
    if (path === '/api/recipes') {
      if (m === 'GET') return json(res, 200, listRecipes(db, url.searchParams.get('q') ?? ''));
      if (m === 'POST') {
        const r = validateRecipe(await readJson(req));
        if (typeof r === 'string') return json(res, 400, { error: r });
        const saved = createRecipe(db, { ...r, imageUrl: await keepPhoto(r.imageUrl), ingredients: linkIngredients(db, r.ingredients) }, userName);
        hub.send('recipes', userName);
        return json(res, 201, saved);
      }
      return json(res, 405, { error: 'Method not allowed' });
    }
    const one = /^\/api\/recipes\/(\d+)$/.exec(path);
    if (one) {
      const id = Number(one[1]);
      if (m === 'GET') { const r = getRecipe(db, id); return r ? json(res, 200, r) : json(res, 404, { error: 'No such recipe' }); }
      if (m === 'PUT') {
        const r = validateRecipe(await readJson(req));
        if (typeof r === 'string') return json(res, 400, { error: r });
        const saved = updateRecipe(db, id, { ...r, imageUrl: await keepPhoto(r.imageUrl), ingredients: linkIngredients(db, r.ingredients) });
        if (saved) hub.send('recipes', userName);
        return saved ? json(res, 200, saved) : json(res, 404, { error: 'No such recipe' });
      }
      if (m === 'DELETE') { const ok = deleteRecipe(db, id); if (ok) hub.send('recipes', userName); return ok ? json(res, 200, { ok: true }) : json(res, 404, { error: 'No such recipe' }); }
      return json(res, 405, { error: 'Method not allowed' });
    }
    if (path === '/api/import' && m === 'POST') {
      const body = await readJson(req) as { url?: unknown; text?: unknown; comments?: unknown };
      const pasted = typeof body?.text === 'string' && body.text.trim() ? [body.text.slice(0, 20000), ...(Array.isArray(body.comments) ? body.comments.filter((c): c is string => typeof c === 'string').slice(0, 30).map((c) => c.slice(0, 20000)) : [])] : null;
      if (!pasted && (typeof body?.url !== 'string' || !body.url.trim())) return json(res, 400, { error: 'Send {"url": "https://..."} or {"text": "the caption"}', code: 'bad-url' });
      const link = typeof body?.url === 'string' && body.url.trim() ? body.url.trim() : null;
      const result = pasted ? importFromText(pasted, link) : await importFromUrl(link!, { fetchPage, render });
      if (!('recipe' in result)) return json(res, 422, result);
      // link what is already in the pantry (exact words only) and say what else it could be, so the review can confirm each line
      const linked = linkIngredients(db, result.recipe.ingredients);
      return json(res, 200, { ...result, recipe: { ...result.recipe, ingredients: linked }, suggestions: suggestionsFor(db, linked) });
    }
    return json(res, 404, { error: 'Not found' });
  }

  /** The recipe's photo, saved on this server (so it loads fast and survives the website changing); the original address stays when it cannot be fetched. */
  async function keepPhoto(url: string | null): Promise<string | null> {
    if (!url || !imagesDir || !/^https?:/i.test(url)) return url;
    return (await cacheImage(imagesDir, url, fetchPicture)) ?? url;
  }

  function serveWeb(path: string, req: IncomingMessage, res: ServerResponse) {
    if (!webDir) return json(res, 404, { error: 'No web client is installed on this server' });
    let rel: string;
    try { rel = normalize(decodeURIComponent(path)); } catch { return json(res, 400, { error: 'Bad path' }); }
    let file = join(webDir, rel);
    if (file !== webDir && !file.startsWith(webDir + sep)) return json(res, 403, { error: 'Forbidden' });
    const isFile = (p: string) => existsSync(p) && statSync(p).isFile();
    const asset = isFile(file);
    if (!asset) file = join(webDir, 'index.html'); // single-page app: unknown paths open the app
    if (!isFile(file)) return json(res, 404, { error: 'No web client is installed on this server' });
    const hashed = asset && /\/assets\//.test(path);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      // fingerprinted bundles never change; everything else (index.html, the service worker, icons) is revalidated
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  }
}
