import { COUNT_MODES, GROUPS, defaultsForUnit, guessCategory, itemKey, type CountMode, type Item } from '@turbopantry/shared';
import { atomically, type Db } from './db.ts';

interface Row {
  id: number; name: string; key: string; aliases: string; category: string; unit: string | null; qty: number; step: number; default_qty: number; min_qty: number;
  tracked: number; grams_per_cup: number | null; place: string | null; count_mode: string; recipe_only: number;
}
const toItem = (r: Row): Item => ({
  id: r.id, name: r.name, aliases: JSON.parse(r.aliases) as string[], category: r.category, unit: r.unit, qty: r.qty, step: r.step, defaultQty: r.default_qty,
  minQty: r.min_qty, mode: r.count_mode as CountMode, tracked: !!r.tracked, gramsPerCup: r.grams_per_cup, place: r.place, recipeOnly: !!r.recipe_only,
});

/** An item that only a recipe knows about: made by linking, never stocked (and none now). Shown in the pantry only when asked for. */
const SEL = 'SELECT i.*, (i.from_recipe = 1 AND i.qty = 0 AND NOT EXISTS (SELECT 1 FROM stock_log s WHERE s.item_id = i.id AND s.delta > 0)) AS recipe_only FROM items i';
export const listItems = (db: Db): Item[] => (db.prepare(`${SEL} ORDER BY i.name COLLATE NOCASE`).all() as unknown as Row[]).map(toItem);
export const getItem = (db: Db, id: number): Item | null => { const r = db.prepare(`${SEL} WHERE i.id = ?`).get(id) as Row | undefined; return r ? toItem(r) : null; };
export const getItemByKey = (db: Db, key: string): Item | null => { const r = db.prepare(`${SEL} WHERE i.key = ?`).get(key) as Row | undefined; return r ? toItem(r) : null; };

export class ItemError extends Error { status: number; constructor(status: number, m: string) { super(m); this.status = status; } }

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 1e6) / 1e6 : undefined);

export interface ItemInput {
  name?: string; aliases?: string[]; category?: string; unit?: string | null; qty?: number; step?: number; defaultQty?: number; minQty?: number;
  mode?: CountMode; tracked?: boolean; fromRecipe?: boolean; gramsPerCup?: number | null; place?: string | null;
}

/** Checks and cleans an item body (fields it does not mention are left out). */
export function validateItem(body: unknown): ItemInput | string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'Send an item as a JSON object.';
  const b = body as Record<string, unknown>, out: ItemInput = {};
  if ('name' in b) { const n = str(b.name, 100); if (!n) return 'An item needs a name.'; if (!itemKey(n)) return 'That name has no usable words.'; out.name = n; }
  if ('aliases' in b) { if (!Array.isArray(b.aliases) || b.aliases.length > 30) return 'Aliases must be a list of at most 30.'; out.aliases = [...new Set(b.aliases.map((a) => str(a, 150)).filter(Boolean))]; }
  if ('category' in b) { const c = str(b.category, 40); if (!GROUPS.includes(c)) return `Group must be one of: ${GROUPS.join(', ')}.`; out.category = c; }
  if ('mode' in b) { if (!(COUNT_MODES as readonly string[]).includes(b.mode as string)) return `mode must be one of: ${COUNT_MODES.join(', ')}.`; out.mode = b.mode as CountMode; }
  if ('unit' in b) { const u = b.unit === null ? null : str(b.unit, 20); out.unit = u || null; }
  if ('place' in b) { const p = b.place === null ? null : str(b.place, 30); out.place = p || null; }
  for (const [k, lo, hi] of [['qty', 0, 1e7], ['step', 0.001, 1e6], ['defaultQty', 0, 1e7], ['minQty', 0, 1e7]] as const) {
    if (k in b) { const v = num(b[k], lo, hi); if (v === undefined || (k === 'step' && v <= 0)) return `${k} must be a number between ${lo} and ${hi}.`; out[k] = v; }
  }
  if ('gramsPerCup' in b) { if (b.gramsPerCup === null) out.gramsPerCup = null; else { const v = num(b.gramsPerCup, 1, 2000); if (v === undefined) return 'gramsPerCup must be a number of grams.'; out.gramsPerCup = v; } }
  if ('tracked' in b) out.tracked = !!b.tracked;
  if ('fromRecipe' in b) out.fromRecipe = !!b.fromRecipe;
  return out;
}

/** An alias may not be the same words as ANOTHER item, or links would be ambiguous. */
function checkAliases(db: Db, id: number | null, name: string, aliases: string[]) {
  for (const a of aliases) {
    const other = getItemByKey(db, itemKey(a));
    if (other && other.id !== id) throw new ItemError(409, `"${a}" is already the item "${other.name}".`);
  }
  if (id !== null) { const own = getItemByKey(db, itemKey(name)); if (own && own.id !== id) throw new ItemError(409, `There is already an item called "${own.name}".`); }
}

/**
 * Makes an item. If one with the same words already exists it is returned instead (`existed`), so linking a recipe never makes duplicates.
 * The unit sets the step and default amount unless they are given; the category is guessed unless given.
 */
export function createItem(db: Db, input: ItemInput): { item: Item; existed: boolean } {
  if (!input.name) throw new ItemError(400, 'An item needs a name.');
  const key = itemKey(input.name);
  const have = getItemByKey(db, key);
  if (have) return { item: have, existed: true };
  const aliases = input.aliases ?? [];
  checkAliases(db, null, input.name, aliases);
  const unit = input.unit ?? null;
  const mode: CountMode = input.mode ?? (unit && ['g', 'kg', 'ml', 'l'].includes(unit) ? 'weight' : 'amount');
  const d = defaultsForUnit(unit, mode);
  const qty = input.qty ?? 0, minQty = input.minQty ?? 0;
  const tracked = input.tracked ?? true; // every item is in the pantry; one made by linking a recipe says `fromRecipe` and stays hidden until stocked
  const res = db.prepare(`INSERT INTO items (name, key, aliases, category, unit, qty, step, default_qty, min_qty, count_mode, tracked, grams_per_cup, place, from_recipe) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(input.name, key, JSON.stringify(aliases), input.category ?? guessCategory(input.name), unit, qty, input.step ?? d.step, input.defaultQty ?? d.defaultQty, minQty, mode, tracked ? 1 : 0, input.gramsPerCup ?? null, input.place ?? null, input.fromRecipe ? 1 : 0);
  return { item: getItem(db, Number(res.lastInsertRowid))!, existed: false };
}

export function updateItem(db: Db, id: number, input: ItemInput & { addAlias?: string }): Item | null {
  const cur = getItem(db, id);
  if (!cur) return null;
  const name = input.name ?? cur.name;
  const aliases = input.aliases ?? [...cur.aliases, ...(input.addAlias && itemKey(input.addAlias) !== itemKey(name) && !cur.aliases.some((a) => itemKey(a) === itemKey(input.addAlias!)) ? [input.addAlias] : [])];
  checkAliases(db, id, name, aliases);
  const next = { ...cur, ...input, name, aliases };
  const tracked = input.tracked ?? (cur.tracked || next.qty > 0 || next.minQty > 0);
  db.prepare(`UPDATE items SET name=?, key=?, aliases=?, category=?, unit=?, qty=?, step=?, default_qty=?, min_qty=?, count_mode=?, tracked=?, grams_per_cup=?, place=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`)
    .run(next.name, itemKey(next.name), JSON.stringify(aliases), next.category, next.unit, next.qty, next.step, next.defaultQty, next.minQty, next.mode, tracked ? 1 : 0, next.gramsPerCup, next.place, id);
  return getItem(db, id);
}

export const deleteItem = (db: Db, id: number): boolean => db.prepare('DELETE FROM items WHERE id = ?').run(id).changes > 0;

export interface StockChange { itemId: number; delta: number }

/**
 * Changes stock by amounts (negative = used), never below zero, all or nothing, and logs each one. The log is what makes "undo" a plain
 * opposite change. Returns the items as they are now and the changes that were really applied (a use of more than is left only takes what is there).
 */
export function adjustStock(db: Db, changes: StockChange[], reason: string, user: string, recipeId: number | null = null): { items: Item[]; applied: StockChange[] } {
  const out: Item[] = [], applied: StockChange[] = [];
  atomically(db, () => {
    for (const c of changes) {
      const cur = getItem(db, c.itemId);
      if (!cur) throw new ItemError(404, 'No such item.');
      const qty = Math.max(0, Math.round((cur.qty + c.delta) * 1e6) / 1e6);
      db.prepare(`UPDATE items SET qty = ?, tracked = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(qty, c.itemId);
      db.prepare('INSERT INTO stock_log (item_id, delta, reason, user, recipe_id) VALUES (?,?,?,?,?)').run(c.itemId, qty - cur.qty, reason, user, recipeId);
      out.push(getItem(db, c.itemId)!); applied.push({ itemId: c.itemId, delta: qty - cur.qty });
    }
  });
  return { items: out, applied };
}
