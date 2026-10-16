import type { IncomingMessage, ServerResponse } from 'node:http';
import { sanitizeLayout, type Layout, type LayoutKind } from '@turbopantry/shared';
import type { Db, User } from './db.ts';
import type { Hub } from './events.ts';
import { json, readJson } from './http.ts';

const bad = (res: ServerResponse, msg: string, status = 400) => json(res, status, { error: msg });

/** Floor plans for the faux-3D views, shared by the household: one for the kitchen, one per shop. */
export async function layoutRoutes(path: string, m: string, req: IncomingMessage, res: ServerResponse, db: Db, user: User, hub: Hub): Promise<boolean> {
  const match = /^\/api\/layouts\/(?:(pantry)|store\/(\d+))$/.exec(path);
  if (!match) return false;
  const kind: LayoutKind = match[1] ? 'pantry' : 'store';
  const storeId = match[2] ? Number(match[2]) : null;
  if (m !== 'GET' && m !== 'PUT') { bad(res, 'Method not allowed', 405); return true; }
  if (storeId !== null && !db.prepare('SELECT 1 FROM stores WHERE id = ?').get(storeId)) { bad(res, 'No such store', 404); return true; }
  const where = storeId === null ? 'kind = ? AND store_id IS NULL' : 'kind = ? AND store_id = ?';
  const args = storeId === null ? [kind] : [kind, storeId];

  if (m === 'GET') {
    const row = db.prepare(`SELECT data FROM layouts WHERE ${where}`).get(...args) as { data: string } | undefined;
    let layout: Layout = { blocks: [] };
    if (row) { const clean = sanitizeLayout(JSON.parse(row.data), kind); if (typeof clean !== 'string') layout = clean; }
    json(res, 200, layout); return true;
  }
  const clean = sanitizeLayout(await readJson(req), kind);
  if (typeof clean === 'string') { bad(res, clean); return true; }
  const data = JSON.stringify(clean);
  if (db.prepare(`SELECT 1 FROM layouts WHERE ${where}`).get(...args)) db.prepare(`UPDATE layouts SET data = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${where}`).run(data, ...args);
  else db.prepare('INSERT INTO layouts (kind, store_id, data) VALUES (?, ?, ?)').run(kind, storeId, data);
  hub.send('layouts', user.name);
  json(res, 200, clean); return true;
}
