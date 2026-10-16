import { cleanItemName, convertAmount, gramsPerCupFor, guessCategory, groupOrder, itemKey, stockStatus, type Item, type ListEntry, type Recipe } from '@turbopantry/shared';
import { atomically, type Db } from './db.ts';
import { adjustStock, createItem, getItem, getItemByKey, ItemError } from './items.ts';

interface Row { id: number; item_id: number | null; name: string; qty: number | null; unit: string | null; note: string; checked: number; stock_applied: number; category: string; added_by: string; recipe_id: number | null; created_at: string; adds_stock: number; step: number | null }
const SELECT = 'SELECT l.*, i.step AS step FROM list_items l LEFT JOIN items i ON i.id = l.item_id';
const toEntry = (r: Row): ListEntry => ({ step: r.step ?? 1, addsStock: !!r.adds_stock, id: r.id, itemId: r.item_id, name: r.name, qty: r.qty, unit: r.unit, note: r.note, checked: !!r.checked, category: r.category, addedBy: r.added_by, recipeId: r.recipe_id, createdAt: r.created_at });

/** What is still to buy. Bought lines are kept for a day so Undo works, and never shown: there is no "completed" list. */
export function listEntries(db: Db): ListEntry[] {
  db.prepare("DELETE FROM list_items WHERE checked = 1 AND checked_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')").run();
  const rows = db.prepare(`${SELECT} WHERE l.checked = 0 ORDER BY l.id`).all() as unknown as Row[];
  const order = groupOrder(null);
  const rank = (c: string) => { const i = order.indexOf(c); return i === -1 ? 999 : i; };
  return rows.map(toEntry).sort((a, b) => rank(a.category) - rank(b.category) || a.id - b.id);
}
const getEntry = (db: Db, id: number): Row | undefined => db.prepare(`${SELECT} WHERE l.id = ?`).get(id) as Row | undefined;
export const countOpen = (db: Db) => (db.prepare('SELECT COUNT(*) AS n FROM list_items WHERE checked = 0').get() as { n: number }).n;

/** How the pantry count reacts: 'more' (the default) is "I am getting more": buying adds to it; 'out' is "I am out": the count goes to zero now; 'keep' leaves the count alone when it is bought. */
export type StockMode = 'more' | 'out' | 'keep';
export interface AddInput { itemId?: number | null; name?: string; qty?: number | null; unit?: string | null; note?: string; stock?: StockMode }

/**
 * Puts something on the list. Every line IS a pantry item: a name nobody has used before makes one (counted in the unit typed with it), so the
 * list and the pantry never drift apart. The amount defaults to the item's own default; asking again for something already on the list adds to
 * that line, if the units can be added, instead of making a second one.
 */
export function addToList(db: Db, input: AddInput, user: string, recipeId: number | null = null): ListEntry {
  let item: Item | null = null;
  if (input.itemId) { item = getItem(db, input.itemId); if (!item) throw new ItemError(404, 'No such item.'); }
  else if (input.name) {
    const name = input.name.trim().slice(0, 100);
    if (!name) throw new ItemError(400, 'Say what to add.');
    item = createItem(db, { name, unit: input.unit ?? null, tracked: true }).item; // the same words as a pantry item: it IS that item
  }
  if (!item) throw new ItemError(400, 'Say what to add.');
  const name = item.name;
  const qty = input.qty === undefined ? item.defaultQty : input.qty;
  const unit = input.unit === undefined ? item.unit : input.unit; // no unit given with an amount ("750 chicken"): the item's own
  const note = (input.note ?? '').trim().slice(0, 200);
  const keep = input.stock === 'keep';

  if (input.stock === 'out' && item.qty > 0) adjustStock(db, [{ itemId: item.id, delta: -item.qty }], 'out', user, recipeId);
  if (!item.tracked) db.prepare('UPDATE items SET tracked = 1 WHERE id = ?').run(item.id);

  const open = db.prepare(`${SELECT} WHERE l.item_id = ? AND l.checked = 0`).get(item.id) as Row | undefined;
  if (open) {
    let merged: number | null = open.qty;
    if (qty !== null && open.qty !== null) { const c = convertAmount(qty, unit, open.unit, gramsPerCupFor(item.name, item.gramsPerCup)); if (c !== null) merged = open.qty + c; }
    else if (qty !== null && open.qty === null) merged = qty;
    db.prepare('UPDATE list_items SET qty = ?, adds_stock = ?, note = CASE WHEN ? != \'\' AND instr(note, ?) = 0 THEN trim(note || \' \' || ?) ELSE note END WHERE id = ?').run(merged, keep || !open.adds_stock ? 0 : 1, note, note, note, open.id);
    return toEntry(getEntry(db, open.id)!);
  }
  const res = db.prepare('INSERT INTO list_items (item_id, name, qty, unit, note, category, added_by, recipe_id, adds_stock) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(item.id, name, qty, unit, note, item.category, user, recipeId, keep ? 0 : 1);
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
        if (item && now.adds_stock) {
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

export interface FromRecipeResult { added: ListEntry[]; skipped: { name: string; reason: 'enough' }[]; checkStock: string[] }

/**
 * Adds what a recipe is missing: for each ingredient linked to a pantry item, the shortfall (what it needs minus what is in stock). Enough in
 * stock is skipped. Ingredients that are not linked, or whose units cannot be compared with the stock, are added whole and noted
 * "check stock", never silently dropped.
 */
export function addRecipeShortfall(db: Db, recipe: Recipe, factor: number, user: string, only?: number[]): FromRecipeResult {
  const out: FromRecipeResult = { added: [], skipped: [], checkStock: [] };
  recipe.ingredients.forEach((ing, index) => {
    if (only && !only.includes(index)) return;
    const item = ing.itemId ? getItem(db, ing.itemId) : null;
    const st = stockStatus(ing, factor, item);
    if (st.state === 'enough') { out.skipped.push({ name: item?.name ?? ing.name, reason: st.state }); return; }
    if ((st.state === 'some' || st.state === 'none') && item) {
      out.added.push(addToList(db, { itemId: item.id, qty: st.missing ?? item.defaultQty, unit: item.unit }, user, recipe.id));
      return;
    }
    // unlinked, or the units cannot be compared: add the line as the recipe wrote it
    const qty = ing.quantity === null ? null : Math.round((ing.quantityMax ?? ing.quantity) * factor * 1000) / 1000;
    out.added.push(addToList(db, { itemId: item?.id ?? null, name: item?.name ?? cleanItemName(ing.name), qty, unit: ing.unit }, user, recipe.id));
    out.checkStock.push(item?.name ?? cleanItemName(ing.name));
  });
  return out;
}
