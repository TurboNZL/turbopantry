import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { APP_NAME, type Health, type Status } from '@turbopantry/shared';
import { countUsers, userForToken, type Db, type User } from './db.ts';
import { countRecipes, createRecipe, deleteRecipe, getRecipe, listRecipes, updateRecipe, validateRecipe } from './recipes.ts';
import { importFromUrl } from './import/index.ts';
import type { Updater } from './update.ts';
import type { PageFetcher } from './import/safeFetch.ts';
import { safeFetchPage } from './import/safeFetch.ts';


const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json',
};

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function bearer(req: IncomingMessage): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');
  return m?.[1] ?? null;
}

export interface AppOptions { db: Db; webDir?: string; /** How pages are fetched for import. Tests pass a fake; the default refuses private addresses. */ fetchPage?: PageFetcher; /** Present only when this server can update itself (see update.ts and index.ts). */ updater?: Updater; /** Shown by /api/health. index.ts reads it from git (the newest tag, e.g. v2026.10.3). */ version?: string }

const MAX_BODY = 1024 * 1024;
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const c of req as AsyncIterable<Buffer>) { size += c.length; if (size > MAX_BODY) throw new HttpError(413, 'That request is too large.'); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'The request body is not valid JSON.'); }
}

/** The whole HTTP surface. Every /api route except /api/health needs a token: the server is meant to sit behind a public tunnel. */
export function createApp({ db, webDir, fetchPage = safeFetchPage, updater, version = 'dev' }: AppOptions): Server {
  return createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (e instanceof HttpError) return json(res, e.status, { error: e.message });
      console.error(e);
      if (!res.headersSent) json(res, 500, { error: 'Server error' }); else res.end();
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;

    if (path === '/api/health' && req.method === 'GET') {
      return json(res, 200, { ok: true, name: APP_NAME, version } satisfies Health);
    }
    if (path.startsWith('/api/')) {
      const token = bearer(req);
      const user = token ? userForToken(db, token) : null;
      if (!user) return json(res, 401, { error: 'Wrong or missing token' });
      if (path === '/api/status' && req.method === 'GET') {
        return json(res, 200, { user: user.name, users: countUsers(db), recipes: countRecipes(db), lists: 0 } satisfies Status);
      }
      return api(path, url, req, res, user);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
    return serveWeb(path, req, res);
  }

  async function api(path: string, url: URL, req: IncomingMessage, res: ServerResponse, user: User) {
    const m = req.method ?? 'GET';
    const userName = user.name;
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
        return typeof r === 'string' ? json(res, 400, { error: r }) : json(res, 201, createRecipe(db, r, userName));
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
        const saved = updateRecipe(db, id, r);
        return saved ? json(res, 200, saved) : json(res, 404, { error: 'No such recipe' });
      }
      if (m === 'DELETE') return deleteRecipe(db, id) ? json(res, 200, { ok: true }) : json(res, 404, { error: 'No such recipe' });
      return json(res, 405, { error: 'Method not allowed' });
    }
    if (path === '/api/import' && m === 'POST') {
      const body = await readJson(req) as { url?: unknown };
      if (typeof body?.url !== 'string' || !body.url.trim()) return json(res, 400, { error: 'Send {"url": "https://..."}', code: 'bad-url' });
      const result = await importFromUrl(body.url.trim(), fetchPage);
      return 'recipe' in result ? json(res, 200, result) : json(res, 422, result);
    }
    return json(res, 404, { error: 'Not found' });
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
