import type { IncomingMessage, ServerResponse } from 'node:http';
import { GROUPS, type Store } from '@turbopantry/shared';
import { addDeviceToken, listDeviceTokens, revokeDeviceToken, type Db, type User } from './db.ts';
import type { Hub } from './events.ts';
import { json, readJson } from './http.ts';

const bad = (res: ServerResponse, msg: string, status = 400) => json(res, status, { error: msg });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

interface StoreRow { id: number; name: string; group_order: string }
const toStore = (r: StoreRow): Store => ({ id: r.id, name: r.name, order: JSON.parse(r.group_order) as string[] });
export const listStores = (db: Db): Store[] => (db.prepare('SELECT * FROM stores ORDER BY name COLLATE NOCASE').all() as unknown as StoreRow[]).map(toStore);
const getStore = (db: Db, id: number): Store | null => { const r = db.prepare('SELECT * FROM stores WHERE id = ?').get(id) as StoreRow | undefined; return r ? toStore(r) : null; };

function storeBody(body: unknown): { name?: string; order?: string[] } | string {
  if (!isObj(body)) return 'Send a store as a JSON object.';
  const out: { name?: string; order?: string[] } = {};
  if ('name' in body) { const n = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : ''; if (!n) return 'A store needs a name.'; out.name = n; }
  if ('order' in body) {
    if (!Array.isArray(body.order) || body.order.length > GROUPS.length) return 'order must be a list of shopping groups.';
    const o = [...new Set(body.order.filter((g): g is string => typeof g === 'string' && GROUPS.includes(g)))];
    out.order = o;
  }
  return out;
}

/** Shop layouts (the order of the shopping groups, shared by the household) and the per-device sign-in tokens used for pairing. Returns true when the request was one of these. */
export async function extraRoutes(path: string, m: string, req: IncomingMessage, res: ServerResponse, db: Db, user: User, hub: Hub): Promise<boolean> {
  if (path === '/api/stores') {
    if (m === 'GET') { json(res, 200, listStores(db)); return true; }
    if (m === 'POST') {
      const v = storeBody(await readJson(req));
      if (typeof v === 'string' || !v.name) { bad(res, typeof v === 'string' ? v : 'A store needs a name.'); return true; }
      try { const r = db.prepare('INSERT INTO stores (name, group_order) VALUES (?, ?)').run(v.name, JSON.stringify(v.order ?? [])); hub.send('stores', user.name); json(res, 201, getStore(db, Number(r.lastInsertRowid))); }
      catch (e) { bad(res, String((e as Error).message).includes('UNIQUE') ? `There is already a store called ${v.name}.` : (e as Error).message, 409); }
      return true;
    }
    bad(res, 'Method not allowed', 405); return true;
  }
  const one = /^\/api\/stores\/(\d+)$/.exec(path);
  if (one) {
    const id = Number(one[1]), cur = getStore(db, id);
    if (!cur) { bad(res, 'No such store', 404); return true; }
    if (m === 'PUT') {
      const v = storeBody(await readJson(req));
      if (typeof v === 'string') { bad(res, v); return true; }
      try { db.prepare('UPDATE stores SET name = ?, group_order = ? WHERE id = ?').run(v.name ?? cur.name, JSON.stringify(v.order ?? cur.order), id); }
      catch (e) { bad(res, String((e as Error).message).includes('UNIQUE') ? 'There is already a store with that name.' : (e as Error).message, 409); return true; }
      hub.send('stores', user.name); json(res, 200, getStore(db, id)); return true;
    }
    if (m === 'DELETE') { db.prepare('DELETE FROM stores WHERE id = ?').run(id); hub.send('stores', user.name); json(res, 200, { ok: true }); return true; }
    bad(res, 'Method not allowed', 405); return true;
  }

  // ---- pairing: another device signs in with a token of its own, so nothing is ever "the" token that can be lost for good
  if (path === '/api/devices') {
    if (m === 'GET') { json(res, 200, listDeviceTokens(db, user.id)); return true; }
    if (m === 'POST') {
      const body = await readJson(req);
      const label = isObj(body) && typeof body.label === 'string' ? body.label : '';
      json(res, 201, { token: addDeviceToken(db, user.id, label || 'Paired device') });
      return true;
    }
    bad(res, 'Method not allowed', 405); return true;
  }
  const dev = /^\/api\/devices\/(\d+)$/.exec(path);
  if (dev && m === 'DELETE') {
    if (!revokeDeviceToken(db, user.id, Number(dev[1]))) { bad(res, 'No such device', 404); return true; }
    json(res, 200, { ok: true }); return true;
  }
  return false;
}
