import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { APP_NAME, type Health, type Status } from '@turbopantry/shared';
import { countUsers, userForToken, type Db } from './db.ts';

declare const __APP_VERSION__: string | undefined;
export const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

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

export interface AppOptions { db: Db; webDir?: string }

/** The whole HTTP surface. Every /api route except /api/health needs a token: the server is meant to sit behind a public tunnel. */
export function createApp({ db, webDir }: AppOptions): Server {
  return createServer((req, res) => {
    try { handle(req, res); } catch (e) { console.error(e); if (!res.headersSent) json(res, 500, { error: 'Server error' }); else res.end(); }
  });

  function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;

    if (path === '/api/health' && req.method === 'GET') {
      return json(res, 200, { ok: true, name: APP_NAME, version: VERSION } satisfies Health);
    }
    if (path.startsWith('/api/')) {
      const token = bearer(req);
      const user = token ? userForToken(db, token) : null;
      if (!user) return json(res, 401, { error: 'Wrong or missing token' });
      if (path === '/api/status' && req.method === 'GET') {
        return json(res, 200, { user: user.name, users: countUsers(db), recipes: 0, lists: 0 } satisfies Status);
      }
      return json(res, 404, { error: 'Not found' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
    return serveWeb(path, req, res);
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
