import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Recipe, RecipeGroup, RecipeSummary } from '@turbopantry/shared';
import { atomically, type Db, type User } from './db.ts';
import type { Hub } from './events.ts';
import { json, readJson } from './http.ts';

const bad = (res: ServerResponse, msg: string, status = 400) => json(res, status, { error: msg });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const listRecipeGroups = (db: Db): RecipeGroup[] =>
  (db.prepare('SELECT g.id, g.name, (SELECT COUNT(*) FROM recipe_group_members m WHERE m.group_id = g.id) AS count FROM recipe_groups g ORDER BY g.name COLLATE NOCASE').all() as unknown as RecipeGroup[]);

/** Adds `groupIds` to each recipe summary, and keeps only the ones in group `only` when it is given. */
export function withGroups(db: Db, list: RecipeSummary[], only?: number | null): RecipeSummary[] {
  const rows = db.prepare('SELECT recipe_id, group_id FROM recipe_group_members').all() as { recipe_id: number; group_id: number }[];
  const by = new Map<number, number[]>();
  for (const r of rows) by.set(r.recipe_id, [...(by.get(r.recipe_id) ?? []), r.group_id]);
  const out = list.map((r) => ({ ...r, groupIds: by.get(r.id) ?? [] }));
  return only ? out.filter((r) => r.groupIds.includes(only)) : out;
}
export const withGroupIds = (db: Db, r: Recipe): Recipe => ({ ...r, groupIds: (db.prepare('SELECT group_id FROM recipe_group_members WHERE recipe_id = ? ORDER BY group_id').all(r.id) as { group_id: number }[]).map((x) => x.group_id) });

/** Recipe groups: named collections ("Weeknight", "Baking"), shared by the household. A recipe can be in several. Returns true when the request was one of these. */
export async function recipeGroupRoutes(path: string, m: string, req: IncomingMessage, res: ServerResponse, db: Db, user: User, hub: Hub): Promise<boolean> {
  if (path === '/api/recipe-groups') {
    if (m === 'GET') { json(res, 200, listRecipeGroups(db)); return true; }
    if (m === 'POST') {
      const b = await readJson(req);
      const name = isObj(b) && typeof b.name === 'string' ? b.name.trim().slice(0, 60) : '';
      if (!name) { bad(res, 'A group needs a name.'); return true; }
      try { const r = db.prepare('INSERT INTO recipe_groups (name) VALUES (?)').run(name); hub.send('recipes', user.name); json(res, 201, { id: Number(r.lastInsertRowid), name, count: 0 }); }
      catch (e) { bad(res, String((e as Error).message).includes('UNIQUE') ? `There is already a group called ${name}.` : (e as Error).message, 409); }
      return true;
    }
    bad(res, 'Method not allowed', 405); return true;
  }
  const one = /^\/api\/recipe-groups\/(\d+)$/.exec(path);
  if (one) {
    const id = Number(one[1]);
    if (!db.prepare('SELECT 1 FROM recipe_groups WHERE id = ?').get(id)) { bad(res, 'No such group', 404); return true; }
    if (m === 'PUT') {
      const b = await readJson(req);
      const name = isObj(b) && typeof b.name === 'string' ? b.name.trim().slice(0, 60) : '';
      if (!name) { bad(res, 'A group needs a name.'); return true; }
      try { db.prepare('UPDATE recipe_groups SET name = ? WHERE id = ?').run(name, id); } catch { bad(res, 'There is already a group with that name.', 409); return true; }
      hub.send('recipes', user.name); json(res, 200, listRecipeGroups(db).find((g) => g.id === id)); return true;
    }
    if (m === 'DELETE') { db.prepare('DELETE FROM recipe_groups WHERE id = ?').run(id); hub.send('recipes', user.name); json(res, 200, { ok: true }); return true; }
    bad(res, 'Method not allowed', 405); return true;
  }
  const mine = /^\/api\/recipes\/(\d+)\/groups$/.exec(path);
  if (mine && m === 'PUT') {
    const id = Number(mine[1]);
    if (!db.prepare('SELECT 1 FROM recipes WHERE id = ?').get(id)) { bad(res, 'No such recipe', 404); return true; }
    const b = await readJson(req);
    if (!isObj(b) || !Array.isArray(b.groupIds) || b.groupIds.length > 100 || !b.groupIds.every((n) => Number.isInteger(n))) { bad(res, 'Send {"groupIds": [1, 2]}.'); return true; }
    const wanted = [...new Set(b.groupIds as number[])].filter((g) => db.prepare('SELECT 1 FROM recipe_groups WHERE id = ?').get(g));
    atomically(db, () => { db.prepare('DELETE FROM recipe_group_members WHERE recipe_id = ?').run(id); for (const g of wanted) db.prepare('INSERT INTO recipe_group_members (recipe_id, group_id) VALUES (?, ?)').run(id, g); });
    hub.send('recipes', user.name); json(res, 200, { groupIds: wanted }); return true;
  }
  return false;
}
