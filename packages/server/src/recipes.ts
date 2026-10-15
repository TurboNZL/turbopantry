import type { Ingredient, Recipe, RecipeInput, RecipeSummary } from '@turbopantry/shared';
import type { Db } from './db.ts';

interface Row {
  id: number; title: string; description: string; image_url: string | null; source_url: string | null; source_name: string | null;
  servings: number | null; prep_minutes: number | null; cook_minutes: number | null; total_minutes: number | null;
  ingredients: string; steps: string; tags: string; notes: string; created_by: string; created_at: string; updated_at: string;
}

const toRecipe = (r: Row): Recipe => ({
  id: r.id, title: r.title, description: r.description, imageUrl: r.image_url, sourceUrl: r.source_url, sourceName: r.source_name,
  servings: r.servings, prepMinutes: r.prep_minutes, cookMinutes: r.cook_minutes, totalMinutes: r.total_minutes,
  ingredients: JSON.parse(r.ingredients) as Ingredient[], steps: JSON.parse(r.steps) as string[], tags: JSON.parse(r.tags) as string[], notes: r.notes,
  createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});

const searchText = (r: RecipeInput) => [r.title, r.description, r.tags.join(' '), r.ingredients.map((i) => i.name).join(' ')].join('\n').toLowerCase();

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const optStr = (v: unknown, max: number): string | null => str(v, max) || null;
const optNum = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);
const optHttp = (v: unknown): string | null => { const s = optStr(v, 2000); if (!s) return null; try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null; } catch { return null; } };

/** Checks and cleans a request body. Returns the clean recipe, or a message saying what is wrong. Limits keep a bad client from filling the database. */
export function validateRecipe(body: unknown): RecipeInput | string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'Send a recipe as a JSON object.';
  const b = body as Record<string, unknown>;
  const title = str(b.title, 200);
  if (!title) return 'A recipe needs a title.';
  if (!Array.isArray(b.ingredients) || b.ingredients.length > 300) return 'Ingredients must be a list of at most 300.';
  if (!Array.isArray(b.steps) || b.steps.length > 200) return 'Steps must be a list of at most 200.';
  const ingredients: Ingredient[] = [];
  for (const raw of b.ingredients) {
    const i = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const line = str(i.raw, 500) || str(i.name, 500);
    if (!line) continue;
    ingredients.push({ raw: line, quantity: optNum(i.quantity, 1e6), quantityMax: optNum(i.quantityMax, 1e6), unit: optStr(i.unit, 30), name: str(i.name, 500) || line, note: optStr(i.note, 500), section: optStr(i.section, 100), itemId: typeof i.itemId === 'number' && Number.isInteger(i.itemId) && i.itemId > 0 ? i.itemId : null });
  }
  const steps = b.steps.map((s) => str(s, 4000)).filter(Boolean);
  const tags = Array.isArray(b.tags) ? [...new Set(b.tags.map((t) => str(t, 40).toLowerCase()).filter(Boolean))].slice(0, 30) : [];
  return {
    title, description: str(b.description, 5000), imageUrl: optHttp(b.imageUrl), sourceUrl: optHttp(b.sourceUrl), sourceName: optStr(b.sourceName, 100),
    servings: optNum(b.servings, 10000), prepMinutes: optNum(b.prepMinutes, 100000), cookMinutes: optNum(b.cookMinutes, 100000), totalMinutes: optNum(b.totalMinutes, 100000),
    ingredients, steps, tags, notes: str(b.notes, 10000),
  };
}

const COLS = `title, description, image_url, source_url, source_name, servings, prep_minutes, cook_minutes, total_minutes, ingredients, steps, tags, notes, search_text`;
const values = (r: RecipeInput) => [r.title, r.description, r.imageUrl, r.sourceUrl, r.sourceName, r.servings, r.prepMinutes, r.cookMinutes, r.totalMinutes, JSON.stringify(r.ingredients), JSON.stringify(r.steps), JSON.stringify(r.tags), r.notes, searchText(r)] as const;

export function createRecipe(db: Db, r: RecipeInput, userName: string): Recipe {
  const res = db.prepare(`INSERT INTO recipes (${COLS}, created_by) VALUES (${[...Array(14)].map(() => '?').join(',')}, ?)`).run(...values(r), userName);
  return getRecipe(db, Number(res.lastInsertRowid))!;
}

export function getRecipe(db: Db, id: number): Recipe | null {
  const row = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id) as Row | undefined;
  return row ? toRecipe(row) : null;
}

export function updateRecipe(db: Db, id: number, r: RecipeInput): Recipe | null {
  const v = values(r);
  const res = db.prepare(`UPDATE recipes SET title=?, description=?, image_url=?, source_url=?, source_name=?, servings=?, prep_minutes=?, cook_minutes=?, total_minutes=?, ingredients=?, steps=?, tags=?, notes=?, search_text=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).run(...v, id);
  return res.changes ? getRecipe(db, id) : null;
}

export const deleteRecipe = (db: Db, id: number) => db.prepare('DELETE FROM recipes WHERE id = ?').run(id).changes > 0;

export const countRecipes = (db: Db) => (db.prepare('SELECT COUNT(*) AS n FROM recipes').get() as { n: number }).n;

/** Newest first. `q` matches every word (any order) against the title, description, tags and ingredient names. */
export function listRecipes(db: Db, q = ''): RecipeSummary[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  const where = words.map(() => `search_text LIKE ? ESCAPE '\\'`).join(' AND ');
  const args = words.map((w) => `%${w.replace(/[\\%_]/g, '\\$&')}%`);
  const rows = db.prepare(`SELECT id, title, image_url, total_minutes, prep_minutes, cook_minutes, servings, tags, updated_at FROM recipes ${where ? `WHERE ${where}` : ''} ORDER BY updated_at DESC, id DESC LIMIT 500`).all(...args) as
    { id: number; title: string; image_url: string | null; total_minutes: number | null; prep_minutes: number | null; cook_minutes: number | null; servings: number | null; tags: string; updated_at: string }[];
  return rows.map((r) => ({ id: r.id, title: r.title, imageUrl: r.image_url, totalMinutes: r.total_minutes ?? (r.prep_minutes !== null || r.cook_minutes !== null ? (r.prep_minutes ?? 0) + (r.cook_minutes ?? 0) : null), servings: r.servings, tags: JSON.parse(r.tags) as string[], updatedAt: r.updated_at }));
}
