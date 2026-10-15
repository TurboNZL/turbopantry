import { CATEGORIES, convertAmount, gramsPerCupFor, guessCategory, itemKey, stockStatus, type Item, type ListEntry, type Recipe } from '@turbopantry/shared';
import { atomically, type Db } from './db.ts';
import { adjustStock, getItem, getItemByKey, ItemError } from './items.ts';

interface Row { id: number; item_id: number | null; name: string; qty: number | null; unit: string | null; note: string; checked: number; stock_applied: number; category: string; added_by: string; recipe_id: number | null; created_at: string }
const toEntry = (r: Row): ListEntry => ({ id: r.id, itemId: r.item_id, name: r.name, qty: r.qty, unit: r.unit, note: r.note, checked: !!r.checked, category: r.category, addedBy: r.added_by, recipeId: r.recipe_id, createdAt: r.created_at });

export function listEntries(db: Db): ListEntry[] {
  const rows = db.prepare('SELECT * FROM list_items ORDER BY checked, id').all() as unknown as Row[];
  const rank = (c: string) => { const i = (CATEGORIES as readonly string[]).indexOf(c); return i === -1 ? 99 : i; };
  return rows.map(toEntry).sort((a, b) => Number(a.checked) - Number(b.checked) || rank(a.category) - rank(b.category) || a.id - b.id);
}
const getEntry = (db: Db, id: number): Row | undefined => db.prepare('SELECT * FROM list_items WHERE id = ?').get(id) as Row | undefined;
export const countOpen = (db: Db) => (db.prepare('SELECT COUNT(*) AS n FROM list_items WHERE checked = 0').get() as { n: number }).n;

export interface AddInput { itemId?: number | null; name?: string; qty?: number | null; unit?: string | null; note?: string }

/**
 * Puts something on the list. For a pantry item the amount defaults to the item's own default; asking again for something already on the list
 * (not yet ticked) adds to that line, if the units can be added, instead of making a second one.
 */
export function addToList(db: Db, input: AddInput, user: string, recipeId: number | null = null): ListEntry {
  let item: Item | null = null;
  if (input.itemId) { item = getItem(db, input.itemId); if (!item) throw new ItemError(404, 'No such item.'); }
  else if (input.name) item = getItemByKey(db, itemKey(input.name)); // the same words as a pantry item: it IS that item
  const name = (item?.name ?? input.name ?? '').trim().slice(0, 100);
  if (!name) throw new ItemError(400, 'Say what to add.');
  const qty = input.qty === undefined ? (item ? item.defaultQty : null) : input.qty;
  const unit = input.unit === undefined ? (item ? item.unit : null) : input.unit;
  const note = (input.note ?? '').trim().slice(0, 200);

  const open = item
    ? db.prepare('SELECT * FROM list_items WHERE item_id = ? AND checked = 0').get(item.id) as Row | undefined
    : db.prepare('SELECT * FROM list_items WHERE item_id IS NULL AND checked = 0 AND lower(name) = lower(?)').get(name) as Row | undefined;
  if (open) {
    let merged: number | null = open.qty;
    if (qty !== null && open.qty !== null) { const c = convertAmount(qty, unit, open.unit, item ? gramsPerCupFor(item.name, item.gramsPerCup) : null); if (c !== null) merged = open.qty + c; }
    else if (qty !== null && open.qty === null) merged = qty;
    db.prepare('UPDATE list_items SET qty = ?, note = CASE WHEN ? != \'\' AND instr(note, ?) = 0 THEN trim(note || \' \' || ?) ELSE note END WHERE id = ?').run(merged, note, note, note, open.id);
    return toEntry(getEntry(db, open.id)!);
  }
  const res = db.prepare('INSERT INTO list_items (item_id, name, qty, unit, note, category, added_by, recipe_id) VALUES (?,?,?,?,?,?,?,?)')
    .run(item?.id ?? null, name, qty, unit, note, item?.category ?? guessCategory(name), user, recipeId);
  return toEntry(getEntry(db, Number(res.lastInsertRowid))!);
}

/** How much of a ticked entry goes into stock, in the item's own unit (null when the units cannot be compared: then the plain number is used). */
function stockAmount(entry: Row, item: Item): number {
  if (entry.qty === null) return item.defaultQty;
  return convertAmount(entry.qty, entry.unit, item.unit, gramsPerCupFor(item.name, item.gramsPerCup)) ?? entry.qty;
}

export interface EntryPatch { qty?: number | null; note?: string; checked?: boolean }

/**
 * Edits a line. Ticking it puts what was bought into stock right away (and says how much); unticking takes exactly that back out. So the
 * pantry is right even if someone ticks the wrong thing, and nothing needs a separate "I bought it" step.
 */
export function updateEntry(db: Db, id: number, patch: EntryPatch, user: string): { entry: ListEntry; stock: { itemId: number; delta: number } | null } | null {
  const cur = getEntry(db, id);
  if (!cur) return null;
  let stock: { itemId: number; delta: number } | null = null;
  atomically(db, () => {
    if (patch.qty !== undefined || patch.note !== undefined) {
      db.prepare('UPDATE list_items SET qty = ?, note = ? WHERE id = ?').run(patch.qty === undefined ? cur.qty : patch.qty, (patch.note ?? cur.note).slice(0, 200), id);
    }
    if (patch.checked !== undefined && patch.checked !== !!cur.checked) {
      const now = getEntry(db, id)!;
      if (patch.checked) {
        let applied = 0;
        const item = now.item_id ? getItem(db, now.item_id) : null;
        if (item) {
          const want = stockAmount(now, item);
          const r = adjustStock(db, [{ itemId: item.id, delta: want }], 'bought', user, now.recipe_id);
          applied = r.applied[0]!.delta; stock = { itemId: item.id, delta: applied };
        }
        db.prepare(`UPDATE list_items SET checked = 1, stock_applied = ?, checked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(applied, id);
      } else {
        if (now.item_id && now.stock_applied && getItem(db, now.item_id)) {
          const r = adjustStock(db, [{ itemId: now.item_id, delta: -now.stock_applied }], 'untick', user, now.recipe_id);
          stock = { itemId: now.item_id, delta: r.applied[0]!.delta };
        }
        db.prepare('UPDATE list_items SET checked = 0, stock_applied = 0, checked_at = NULL WHERE id = ?').run(id);
      }
    }
  });
  return { entry: toEntry(getEntry(db, id)!), stock };
}

/** Removes a line. An un-ticked line just goes; a ticked one keeps what it already put in stock. */
export const deleteEntry = (db: Db, id: number): boolean => db.prepare('DELETE FROM list_items WHERE id = ?').run(id).changes > 0;
export const clearChecked = (db: Db): number => Number(db.prepare("DELETE FROM list_items WHERE checked = 1").run().changes);

export interface FromRecipeResult { added: ListEntry[]; skipped: { name: string; reason: 'enough' | 'staple' }[]; checkStock: string[] }

/**
 * Adds what a recipe is missing: for each ingredient linked to a pantry item, the shortfall (what it needs minus what is in stock). Enough in
 * stock and staples are skipped. Ingredients that are not linked, or whose units cannot be compared with the stock, are added whole and noted
 * "check stock", never silently dropped.
 */
export function addRecipeShortfall(db: Db, recipe: Recipe, factor: number, user: string, only?: number[]): FromRecipeResult {
  const out: FromRecipeResult = { added: [], skipped: [], checkStock: [] };
  recipe.ingredients.forEach((ing, index) => {
    if (only && !only.includes(index)) return;
    const item = ing.itemId ? getItem(db, ing.itemId) : null;
    const st = stockStatus(ing, factor, item);
    if (st.state === 'enough' || st.state === 'staple') { out.skipped.push({ name: item?.name ?? ing.name, reason: st.state }); return; }
    if ((st.state === 'some' || st.state === 'none') && item) {
      out.added.push(addToList(db, { itemId: item.id, qty: st.missing ?? item.defaultQty, unit: item.unit }, user, recipe.id));
      return;
    }
    // unlinked, or the units cannot be compared: add the line as the recipe wrote it
    const qty = ing.quantity === null ? null : Math.round((ing.quantityMax ?? ing.quantity) * factor * 1000) / 1000;
    out.added.push(addToList(db, { itemId: item?.id ?? null, name: item?.name ?? ing.name, qty, unit: ing.unit, note: item ? '' : '' }, user, recipe.id));
    out.checkStock.push(item?.name ?? ing.name);
  });
  return out;
}
