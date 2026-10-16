import type { IncomingMessage, ServerResponse } from 'node:http';
import type { User } from './db.ts';
import { json, readJson } from './http.ts';
import type { InstagramService, LoginResult } from './import/instagram-session.ts';

/**
 * The owner's Instagram login (a dummy account, see import/instagram-session.ts). Owner only: whoever holds this session can read Instagram as that account.
 *   GET  /api/admin/instagram              {loggedIn, username?, since?}
 *   POST /api/admin/instagram/login        {username, password} -> {ok, username} | {needsCode, kind} | {error, code}
 *   POST /api/admin/instagram/login/code   {code}               -> same
 *   POST /api/admin/instagram/logout       -> {ok}
 * The password is read from the request body, handed to the browser and dropped. It is never stored, logged or echoed in an error.
 */
export async function instagramRoutes(path: string, m: string, req: IncomingMessage, res: ServerResponse, user: User, ig?: InstagramService): Promise<boolean> {
  if (!/^\/api\/admin\/instagram(\/|$)/.test(path)) return false;
  if (!user.isAdmin) { json(res, 403, { error: 'Only the owner (the first account) can manage the Instagram login.' }); return true; }
  if (!ig) { json(res, 404, { error: 'The Instagram login is not set up on this server.' }); return true; }
  const answer = (r: LoginResult) => json(res, 'error' in r ? (r.code === 'rate' || r.code === 'blocked' ? 429 : 422) : 200, r);
  const text = (b: unknown, k: string) => (typeof b === 'object' && b !== null && typeof (b as Record<string, unknown>)[k] === 'string' ? (b as Record<string, string>)[k]! : '');

  if (path === '/api/admin/instagram' && m === 'GET') { json(res, 200, ig.status()); return true; }
  if (path === '/api/admin/instagram/login' && m === 'POST') { const b = await readJson(req); answer(await ig.login(text(b, 'username'), text(b, 'password'))); return true; }
  if (path === '/api/admin/instagram/login/code' && m === 'POST') { answer(await ig.submitCode(text(await readJson(req), 'code'))); return true; }
  if (path === '/api/admin/instagram/logout' && m === 'POST') { await ig.logout(); json(res, 200, { ok: true }); return true; }
  json(res, 404, { error: 'Not found' }); return true;
}
