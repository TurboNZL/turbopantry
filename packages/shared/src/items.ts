import { convertAmount, dimensionOf, gramsPerCupFor } from './units.ts';
import { formatQuantity, unitLabel } from './ingredient.ts';
import type { Ingredient } from './recipe.ts';

/** A thing the household keeps or buys. Stock (`qty`) is in the item's own unit. */
export interface Item {
  id: number;
  name: string;
  /** Other ways recipes write it ("Coles Australian Free Range Eggs"). The original wording of a recipe is never changed; this is what links it here. */
  aliases: string[];
  category: string;
  /** g, kg, ml, l, cup... or null for "each" (eggs, apples). */
  unit: string | null;
  qty: number;
  /** How much one tap on + or - changes it (rough: tweak per item). */
  step: number;
  /** What gets added when you add it to the list or buy it without saying how much. */
  defaultQty: number;
  /** Keep at least this much: at or below it, the item counts as running low. 0 = not tracked. */
  minQty: number;
  /** Always have it (salt, oil): never added to the list. */
  staple: boolean;
  /** Shown in the pantry. Items made only by linking a recipe stay out of it until stocked. */
  tracked: boolean;
  /** Overrides the built-in weight of a cup for this item. */
  gramsPerCup: number | null;
  place: string | null;
}

export interface ListEntry {
  id: number;
  itemId: number | null;
  name: string;
  qty: number | null;
  unit: string | null;
  note: string;
  checked: boolean;
  category: string;
  addedBy: string;
  recipeId: number | null;
  createdAt: string;
}

export const CATEGORIES = ['Produce', 'Meat & fish', 'Dairy & eggs', 'Bakery', 'Pantry', 'Frozen', 'Drinks', 'Household', 'Other'] as const;
export const PLACES = ['Fridge', 'Freezer', 'Pantry', 'Cupboard', 'Other'] as const;

// ---------------------------------------------------------------- names

// words that say how something is cut or sold, not what it is. "fettuccine" is NOT one of them: the kind of pasta changes a dish.
const DROP = new Set(['fresh', 'large', 'small', 'medium', 'big', 'finely', 'roughly', 'thinly', 'thickly', 'chopped', 'sliced', 'grated', 'crushed', 'minced', 'diced', 'shredded', 'ripe', 'free', 'range', 'australian', 'organic', 'new', 'zealand', 'nz', 'pure', 'the', 'a', 'an', 'of', 'and', 'or', 'to', 'taste', 'optional', 'bunch', 'pinch']);

function singular(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(oes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 4 && /(ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

/** The words that identify a name: lower case, no brackets or punctuation, no preparation words, singular. "Coles Free Range Eggs" -> [coles, egg]. */
export function nameTokens(name: string): string[] {
  return name.toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9]+/).filter(Boolean).map(singular).filter((w) => !DROP.has(w));
}

/** Order-independent identity of a name. */
export const itemKey = (name: string): string => [...new Set(nameTokens(name))].sort().join(' ');

/** What a new pantry item made from a recipe line should be called: the line's name without cutting words, with its specifics kept. */
export function cleanItemName(name: string): string {
  const words = name.replace(/\([^)]*\)/g, ' ').split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !DROP.has(w.toLowerCase().replace(/[^a-z]/g, '')));
  const out = (kept.length ? kept : words).join(' ').replace(/[,;.]+$/, '').trim().toLowerCase();
  return out ? out[0]!.toUpperCase() + out.slice(1) : name;
}

export type MatchKind = 'broader' | 'narrower' | 'related';
export interface ItemMatch { exact: Item | null; candidates: { item: Item; kind: MatchKind }[] }

/**
 * Finds the pantry items a recipe ingredient could be. `exact` is the same words (name or alias, any order, plural or not): safe to link.
 * Candidates are NEVER linked without a confirmation, because "pasta" is not "fettuccine pasta", and the kind of pasta changes a dish:
 *   broader   the item is less specific than the ingredient (item "egg" for "coles egg")
 *   narrower  the item is more specific than the ingredient (item "fettuccine pasta" for "pasta")
 *   related   they share a word ("penne pasta" for "fettuccine pasta")
 */
export function matchItems(name: string, items: Item[]): ItemMatch {
  const key = itemKey(name), toks = new Set(nameTokens(name));
  if (!toks.size) return { exact: null, candidates: [] };
  let exact: Item | null = null;
  const candidates: { item: Item; kind: MatchKind; score: number }[] = [];
  for (const item of items) {
    const keys = [item.name, ...item.aliases].map((n) => ({ key: itemKey(n), toks: new Set(nameTokens(n)) })).filter((k) => k.toks.size);
    if (keys.some((k) => k.key === key)) { exact ??= item; continue; }
    let best: { kind: MatchKind; score: number } | null = null;
    for (const k of keys) {
      const shared = [...k.toks].filter((t) => toks.has(t)).length;
      if (!shared) continue;
      const kind: MatchKind = shared === k.toks.size ? 'broader' : shared === toks.size ? 'narrower' : 'related';
      const score = (kind === 'related' ? 0 : 10) + shared / Math.max(k.toks.size, toks.size);
      if (!best || score > best.score) best = { kind, score };
    }
    if (best) candidates.push({ item, ...best });
  }
  candidates.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  return { exact, candidates: candidates.slice(0, 4).map(({ item, kind }) => ({ item, kind })) };
}

// ---------------------------------------------------------------- categories

const CATEGORY_WORDS: [string, string[]][] = [
  ['Produce', ['apple', 'banana', 'orange', 'lemon', 'lime', 'onion', 'garlic', 'potato', 'kumara', 'carrot', 'tomato', 'lettuce', 'spinach', 'cucumber', 'capsicum', 'pepper', 'broccoli', 'cauliflower', 'cabbage', 'mushroom', 'zucchini', 'celery', 'avocado', 'ginger', 'chilli', 'parsley', 'coriander', 'basil', 'rosemary', 'thyme', 'mint', 'herb', 'berry', 'strawberry', 'blueberry', 'grape', 'pumpkin', 'leek', 'spring onion', 'shallot', 'pear', 'peach', 'mango', 'pineapple', 'corn', 'bean', 'pea', 'salad', 'rocket', 'kale', 'beetroot', 'asparagus']],
  ['Meat & fish', ['chicken', 'beef', 'pork', 'lamb', 'mince', 'bacon', 'ham', 'sausage', 'steak', 'fish', 'salmon', 'tuna', 'prawn', 'shrimp', 'turkey', 'salami', 'chorizo', 'rasher', 'fillet', 'snapper', 'hoki']],
  ['Dairy & eggs', ['milk', 'cream', 'butter', 'cheese', 'parmesan', 'cheddar', 'mozzarella', 'feta', 'yoghurt', 'yogurt', 'egg', 'sour cream', 'cream cheese', 'ricotta', 'halloumi']],
  ['Bakery', ['bread', 'bun', 'roll', 'wrap', 'tortilla', 'pita', 'bagel', 'croissant', 'naan', 'muffin', 'toast']],
  ['Frozen', ['frozen', 'ice cream', 'icecream']],
  ['Drinks', ['juice', 'water', 'wine', 'beer', 'coffee', 'tea', 'soda', 'cola', 'cordial', 'kombucha']],
  ['Household', ['toilet', 'paper towel', 'detergent', 'soap', 'bin bag', 'foil', 'cling', 'baking paper', 'sponge', 'shampoo', 'toothpaste', 'napkin']],
  ['Pantry', ['flour', 'sugar', 'salt', 'oil', 'vinegar', 'pasta', 'spaghetti', 'fettuccine', 'penne', 'rice', 'noodle', 'oat', 'cereal', 'sauce', 'stock', 'tin', 'can', 'beans', 'lentil', 'chickpea', 'spice', 'cumin', 'paprika', 'cinnamon', 'honey', 'jam', 'peanut butter', 'nut', 'almond', 'cocoa', 'chocolate', 'baking', 'yeast', 'mustard', 'mayo', 'ketchup', 'soy', 'coconut', 'cracker', 'biscuit', 'chip', 'tomato paste', 'passata']],
];
/** A best guess at the shop aisle. Always editable; "Other" when nothing fits. */
export function guessCategory(name: string): string {
  const n = ` ${nameTokens(name).join(' ')} `;
  // the most specific phrase wins: "peanut butter" is pantry, not dairy; "tomato paste" is pantry, not produce
  let best: { cat: string; len: number } | null = null;
  for (const [cat, words] of CATEGORY_WORDS) for (const w of words) if (n.includes(` ${w} `) && (!best || w.length > best.len)) best = { cat, len: w.length };
  return best?.cat ?? 'Other';
}

/** A sensible first step and default amount for a unit; the user tweaks both per item. */
export function defaultsForUnit(unit: string | null): { step: number; defaultQty: number } {
  switch (unit) {
    case 'g': return { step: 100, defaultQty: 500 };
    case 'kg': return { step: 0.5, defaultQty: 1 };
    case 'ml': return { step: 100, defaultQty: 500 };
    case 'l': return { step: 0.5, defaultQty: 1 };
    case 'cup': return { step: 0.5, defaultQty: 2 };
    default: return { step: 1, defaultQty: 1 };
  }
}

/** A readable amount: under a kilo or a litre is shown in grams or millilitres ("¼ kg" is "250 g"), and 1000 g or more in kilos. */
export function prettyStock(qty: number, unit: string | null): string {
  if (unit === 'kg' && qty > 0 && qty < 1) return formatStock(Math.round(qty * 1000), 'g');
  if (unit === 'l' && qty > 0 && qty < 1) return formatStock(Math.round(qty * 1000), 'ml');
  if (unit === 'g' && qty >= 1000) return formatStock(Math.round(qty) / 1000, 'kg');
  if (unit === 'ml' && qty >= 1000) return formatStock(Math.round(qty) / 1000, 'l');
  return formatStock(qty, unit);
}

/** A finer step than the shopping one, for taking an exact amount out after cooking. */
export function fineStep(unit: string | null): number {
  switch (unit) { case 'g': case 'ml': return 25; case 'kg': case 'l': return 0.05; case 'cup': return 0.25; default: return 1; }
}

/** "2 kg", "6", "1½ cups". */
export function formatStock(qty: number, unit: string | null): string {
  return [formatQuantity(qty), unitLabel(unit, qty)].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- recipe vs stock

export type StockState = 'enough' | 'some' | 'none' | 'staple' | 'unknown' | 'unlinked';
export interface StockStatus {
  state: StockState;
  /** What the recipe needs, in the item's unit (null when it cannot be worked out or has no amount). */
  need: number | null;
  have: number | null;
  /** The shortfall in the item's unit: what "add what is missing" adds. */
  missing: number | null;
  unit: string | null;
}

/** Is there enough of this ingredient at home? `factor` is the servings scale. Never guesses across units it cannot convert: that is "unknown". */
export function stockStatus(ing: Ingredient, factor: number, item: Item | null | undefined): StockStatus {
  if (!item) return { state: 'unlinked', need: null, have: null, missing: null, unit: null };
  const base = { have: item.qty, unit: item.unit };
  if (item.staple) return { state: 'staple', need: null, missing: null, ...base };
  const wanted = ing.quantity === null ? null : (ing.quantityMax ?? ing.quantity) * factor;
  if (wanted === null) return item.qty > 0 ? { state: 'enough', need: null, missing: null, ...base } : { state: 'none', need: null, missing: null, ...base };
  const need = convertAmount(wanted, ing.unit, item.unit, gramsPerCupFor(item.name, item.gramsPerCup));
  if (need === null) return { state: item.qty > 0 ? 'unknown' : 'none', need: null, missing: null, ...base }; // cannot compare units: with nothing in stock it is still "none"
  if (item.qty >= need - 1e-9) return { state: 'enough', need, missing: null, ...base };
  return { state: item.qty > 0 ? 'some' : 'none', need, missing: need - item.qty, ...base };
}

/** The unit a new pantry item should be counted in, from the recipe line it was made from: weights in grams, liquids in ml, foods people weigh in grams even when the recipe says cups. */
export function suggestItemUnit(ing: Ingredient): string | null {
  const dim = dimensionOf(ing.unit);
  if (dim === 'mass') return ing.unit === 'kg' ? 'kg' : 'g';
  if (dim === 'volume') {
    if (ing.unit && ['cup', 'tbsp', 'tsp'].includes(ing.unit) && gramsPerCupFor(ing.name)) return 'g';
    if (ing.unit === 'tsp' || ing.unit === 'tbsp') return null; // spices and sauces: a jar or bottle, counted as one
    return 'ml';
  }
  return ing.unit; // eggs: null; garlic: clove; tomatoes: can
}
