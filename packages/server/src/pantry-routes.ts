import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Item } from '@turbopantry/shared';
import type { Db, User } from './db.ts';
import type { Hub } from './events.ts';
import { HttpError, json, readJson } from './http.ts';
import { adjustStock, createItem, deleteItem, dismissPair, duplicateItems, getItem, ItemError, listItems, mergeItems, updateItem, validateItem } from './items.ts';
import { addRecipeShortfall, addToList, clearChecked, deleteEntry, listEntries, topUpEssentials, updateEntry, type AddInput, type EntryPatch } from './list.ts';
import { getRecipe } from './recipes.ts';

const bad = (res: ServerResponse, msg: string, status = 400) => json(res, status, { error: msg });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The pantry, stock and shopping-list routes. Returns true when the request was one of them. */
export async function pantryRoutes(path: string, method: string, req: IncomingMessage, res: ServerResponse, db: Db, user: User, hub: Hub): Promise<boolean> {
  try {
    return await route(path, method, req, res, db, user, hub);
  } catch (e) {
    if (e instanceof ItemError) { bad(res, e.message, e.status); return true; }
    throw e;
  }
}

async function route(path: string, m: string, req: IncomingMessage, res: ServerResponse, db: Db, user: User, hub: Hub): Promise<boolean> {
  // ---- items
  if (path === '/api/items') {
    if (m === 'GET') { json(res, 200, listItems(db)); return true; }
    if (m === 'POST') {
      const v = validateItem(await readJson(req));
      if (typeof v === 'string') { bad(res, v); return true; }
      const { item, existed } = createItem(db, v);
      if (!existed) hub.send('items', user.name);
      json(res, existed ? 200 : 201, { ...item, existed });
      return true;
    }
    bad(res, 'Method not allowed', 405); return true;
  }
  if (path === '/api/items/duplicates' && m === 'GET') { json(res, 200, duplicateItems(db).map((p) => ({ a: p.a, b: p.b, reason: p.reason }))); return true; }
  if (path === '/api/items/duplicates/dismiss' && m === 'POST') {
    const body = await readJson(req);
    if (!isObj(body) || !Number.isInteger(body.a) || !Number.isInteger(body.b)) { bad(res, 'Send {"a": 1, "b": 2}.'); return true; }
    dismissPair(db, body.a as number, body.b as number); json(res, 200, { ok: true }); return true;
  }
  const merge = /^\/api\/items\/(\d+)\/merge$/.exec(path);
  if (merge && m === 'POST') {
    const body = await readJson(req);
    if (!isObj(body) || !Number.isInteger(body.into)) { bad(res, 'Send {"into": itemId}.'); return true; }
    const merged = mergeItems(db, Number(merge[1]), body.into as number);
    hub.send('items', user.name); hub.send('list', user.name); hub.send('recipes', user.name); json(res, 200, merged); return true;
  }
  const oneItem = /^\/api\/items\/(\d+)$/.exec(path);
  if (oneItem) {
    const id = Number(oneItem[1]);
    if (m === 'PUT') {
      const body = await readJson(req);
      const v = validateItem(body);
      if (typeof v === 'string') { bad(res, v); return true; }
      const addAlias = isObj(body) && typeof body.addAlias === 'string' ? body.addAlias.trim().slice(0, 150) : undefined;
      const saved = updateItem(db, id, { ...v, ...(addAlias ? { addAlias } : {}) });
      if (!saved) { bad(res, 'No such item', 404); return true; }
      const topped = topUpEssentials(db, user.name);
      hub.send('items', user.name); if (topped) hub.send('list', user.name); json(res, 200, getItem(db, id) ?? saved); return true;
    }
    if (m === 'DELETE') {
      if (!deleteItem(db, id)) { bad(res, 'No such item', 404); return true; }
      hub.send('items', user.name); hub.send('list', user.name); json(res, 200, { ok: true }); return true;
    }
    bad(res, 'Method not allowed', 405); return true;
  }

  // ---- stock
  if (path === '/api/stock/adjust' && m === 'POST') {
    const body = await readJson(req);
    if (!isObj(body) || !Array.isArray(body.changes) || !body.changes.length || body.changes.length > 200) { bad(res, 'Send {"changes": [{"itemId": 1, "delta": -2}]}.'); return true; }
    const changes = body.changes.map((c) => (isObj(c) && Number.isInteger(c.itemId) && typeof c.delta === 'number' && Number.isFinite(c.delta) && Math.abs(c.delta) <= 1e7 ? { itemId: c.itemId as number, delta: c.delta } : null));
    if (changes.some((c) => !c)) { bad(res, 'Each change needs an itemId and a number delta.'); return true; }
    const reason = typeof body.reason === 'string' && /^[a-z ]{1,20}$/.test(body.reason) ? body.reason : 'manual';
    const recipeId = Number.isInteger(body.recipeId) ? (body.recipeId as number) : null;
    const result = adjustStock(db, changes as { itemId: number; delta: number }[], reason, user.name, recipeId);
    const topped = topUpEssentials(db, user.name); // things you can't run out of go straight on the list
    json(res, 200, result);
    hub.send('items', user.name); if (topped) hub.send('list', user.name);
    return true;
  }

  // ---- the shopping list
  if (path === '/api/list') {
    if (m === 'GET') { json(res, 200, listEntries(db)); return true; }
    if (m === 'POST') {
      const body = await readJson(req);
      if (!isObj(body)) { bad(res, 'Send what to add as a JSON object.'); return true; }
      const input: AddInput = {};
      if (Number.isInteger(body.itemId)) input.itemId = body.itemId as number;
      if (typeof body.name === 'string') input.name = body.name;
      if (body.qty === null || (typeof body.qty === 'number' && Number.isFinite(body.qty) && body.qty >= 0 && body.qty <= 1e7)) input.qty = body.qty as number | null;
      if (body.unit === null || typeof body.unit === 'string') input.unit = body.unit as string | null;
      if (typeof body.note === 'string') input.note = body.note;
      if (body.stock === 'more' || body.stock === 'out' || body.stock === 'keep') input.stock = body.stock;
      const entry = addToList(db, input, user.name);
      hub.send('list', user.name); hub.send('items', user.name); json(res, 201, entry); return true;
    }
    bad(res, 'Method not allowed', 405); return true;
  }
  if (path === '/api/list/clear-checked' && m === 'POST') { const removed = clearChecked(db); hub.send('list', user.name); json(res, 200, { removed }); return true; }
  if (path === '/api/list/from-recipe' && m === 'POST') {
    const body = await readJson(req);
    const recipe = isObj(body) && Number.isInteger(body.recipeId) ? getRecipe(db, body.recipeId as number) : null;
    if (!isObj(body) || !recipe) { bad(res, 'No such recipe', 404); return true; }
    const servings = typeof body.servings === 'number' && body.servings > 0 ? body.servings : recipe.servings;
    const factor = typeof body.factor === 'number' && body.factor > 0 && body.factor <= 1000 ? body.factor : recipe.servings && servings ? servings / recipe.servings : 1; // a recipe without servings scales by batches
    const only = Array.isArray(body.only) ? body.only.filter((n): n is number => Number.isInteger(n)) : undefined;
    const result = addRecipeShortfall(db, recipe, factor, user.name, only);
    hub.send('list', user.name); json(res, 200, result); return true;
  }
  const oneEntry = /^\/api\/list\/(\d+)$/.exec(path);
  if (oneEntry) {
    const id = Number(oneEntry[1]);
    if (m === 'PUT') {
      const body = await readJson(req);
      if (!isObj(body)) { bad(res, 'Send the changes as a JSON object.'); return true; }
      const patch: EntryPatch = {};
      if ('qty' in body) { if (body.qty !== null && !(typeof body.qty === 'number' && Number.isFinite(body.qty) && body.qty >= 0 && body.qty <= 1e7)) { bad(res, 'qty must be a number or null.'); return true; } patch.qty = body.qty as number | null; }
      if (typeof body.note === 'string') patch.note = body.note;
      if (typeof body.checked === 'boolean') patch.checked = body.checked;
      const r = updateEntry(db, id, patch, user.name);
      if (!r) { bad(res, 'No such entry', 404); return true; }
      hub.send('list', user.name); if (r.stock) hub.send('items', user.name);
      json(res, 200, r); return true;
    }
    if (m === 'DELETE') { if (!deleteEntry(db, id)) { bad(res, 'No such entry', 404); return true; } hub.send('list', user.name); json(res, 200, { ok: true }); return true; }
    bad(res, 'Method not allowed', 405); return true;
  }
  return false;
}

export type { Item };
export { HttpError };
