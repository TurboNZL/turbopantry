import type { IncomingMessage, ServerResponse } from 'node:http';
import type { User } from './db.ts';
import { json, readJson } from './http.ts';
import { LiveError, type InstagramService, type LoginResult } from './import/instagram-session.ts';

/**
 * The owner's Instagram login (a dummy account, see import/instagram-session.ts). Owner only: whoever holds this session can read Instagram as that account.
 *   GET  /api/admin/instagram              {loggedIn, username?, since?}
 *   POST /api/admin/instagram/login        {username, password} -> {ok, username} | {needsCode, kind} | {error, code}
 *   POST /api/admin/instagram/login/code   {code}               -> same
 *   POST /api/admin/instagram/logout       -> {ok}
 *  Live login window (the owner types into Instagram's own page, shown as JPEG frames; no WebSocket, plain requests, works through a tunnel):
 *   POST /api/admin/instagram/live         {width,height,dpr}  -> {id,w,h}
 *   GET  /api/admin/instagram/live/frame?id=&since=&wait=  -> image/jpeg (X-Frame-Seq), 204 when unchanged, 410 when closed
 *   POST /api/admin/instagram/live/input   {id, events:[{type:'tap'|'wheel'|'key'|'text',...}]}
 *   GET  /api/admin/instagram/live/status?id=  -> {state:'open'|'logged-in'|'closed',...}
 *   POST /api/admin/instagram/live/cancel  {id?}
 * The password is read from the request body, handed to the browser and dropped. It is never stored, logged or echoed in an error.
 */
export async function instagramRoutes(path: string, m: string, req: IncomingMessage, res: ServerResponse, user: User, ig?: InstagramService): Promise<boolean> {
  if (!/^\/api\/admin\/instagram(\/|$)/.test(path)) return false;
  if (!user.isAdmin) { json(res, 403, { error: 'Only the owner (the first account) can manage the Instagram login.' }); return true; }
  if (!ig) { json(res, 404, { error: 'The Instagram login is not set up on this server.' }); return true; }
  const answer = (r: LoginResult) => json(res, 'error' in r ? (r.code === 'rate' || r.code === 'blocked' ? 429 : 422) : 200, r);
  const text = (b: unknown, k: string) => (typeof b === 'object' && b !== null && typeof (b as Record<string, unknown>)[k] === 'string' ? (b as Record<string, string>)[k]! : '');

  if (path.startsWith('/api/admin/instagram/live')) { await liveRoutes(path, m, req, res, ig); return true; }
  if (path === '/api/admin/instagram' && m === 'GET') { json(res, 200, ig.status()); return true; }
  if (path === '/api/admin/instagram/login' && m === 'POST') { const b = await readJson(req); answer(await ig.login(text(b, 'username'), text(b, 'password'))); return true; }
  if (path === '/api/admin/instagram/login/code' && m === 'POST') { answer(await ig.submitCode(text(await readJson(req), 'code'))); return true; }
  if (path === '/api/admin/instagram/logout' && m === 'POST') { await ig.logout(); json(res, 200, { ok: true }); return true; }
  json(res, 404, { error: 'Not found' }); return true;
}

async function liveRoutes(path: string, m: string, req: IncomingMessage, res: ServerResponse, ig: InstagramService) {
  const url = new URL(req.url ?? '/', 'http://x');
  const id = url.searchParams.get('id') ?? undefined;
  const intParam = (k: string, d: number, hi: number) => { const n = Number(url.searchParams.get(k)); return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), hi) : d; };
  try {
    if (path === '/api/admin/instagram/live' && m === 'POST') { json(res, 200, await ig.liveStart((await readJson(req)) as { width: number; height: number; dpr?: number })); return; }
    if (path === '/api/admin/instagram/live/frame' && m === 'GET') {
      if (!id) throw new LiveError(400, 'bad-input', 'Missing id.');
      const f = await ig.liveFrame(id, intParam('since', -1, 1e9), intParam('wait', 0, 5000));
      const head = { 'cache-control': 'no-store', 'x-frame-seq': String(f.seq), 'access-control-expose-headers': 'X-Frame-Seq' };
      if (f.jpeg) { res.writeHead(200, { ...head, 'content-type': 'image/jpeg', 'content-length': f.jpeg.length }); res.end(f.jpeg); return; }
      if (f.state !== 'open') { json(res, 410, ig.liveStatus(id)); return; }
      res.writeHead(204, head); res.end(); return;
    }
    if (path === '/api/admin/instagram/live/input' && m === 'POST') {
      const b = (await readJson(req)) as { id?: unknown; events?: unknown } | null;
      if (typeof b?.id !== 'string') throw new LiveError(400, 'bad-input', 'Missing id.');
      await ig.liveInput(b.id, b.events); json(res, 200, { ok: true }); return;
    }
    if (path === '/api/admin/instagram/live/status' && m === 'GET') { json(res, 200, ig.liveStatus(id)); return; }
    if (path === '/api/admin/instagram/live/cancel' && m === 'POST') {
      const b = (await readJson(req).catch(() => null)) as { id?: unknown } | null;
      json(res, 200, await ig.liveCancel(typeof b?.id === 'string' ? b.id : id)); return;
    }
    json(res, 404, { error: 'Not found' });
  } catch (e) {
    if (e instanceof LiveError) { json(res, e.status, { error: e.message, code: e.code }); return; }
    throw e;
  }
}
