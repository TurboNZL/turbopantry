import { convertAmount, dimensionOf, gramsPerCupFor } from './units.ts';
import { formatQuantity, parseIngredient, unitLabel } from './ingredient.ts';
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
  /** How it is counted: whole things (eggs), weight in packs of a set size (chicken in 500 g chunks), or plain weight/volume (flour). Drives the + and - and the defaults. */
  mode: CountMode;
  /** Shown in the pantry. Items made only by linking a recipe stay out of it until stocked. */
  tracked: boolean;
  /** Overrides the built-in weight of a cup for this item. */
  gramsPerCup: number | null;
  place: string | null;
}

export const COUNT_MODES = ['amount', 'chunks', 'weight'] as const;
export type CountMode = (typeof COUNT_MODES)[number];
export const COUNT_MODE_LABELS: Record<CountMode, string> = { amount: 'Amounts', chunks: 'Weight in chunks', weight: 'Weight' };

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
  /** From the linked pantry item: how much one tap on + or - changes this line. */
  step: number;
  /** Buying this does not change the pantry count ("not changing the count" when it was added). */
  addsStock: boolean;
}

/** A shop's layout: the order its groups are walked in. Groups it does not list come last in the default order. */
export interface Store { id: number; name: string; order: string[] }

/** Precise shopping groups, in a typical supermarket order, so a store layout can order them exactly. Sections are only a heading above related groups. */
export const GROUP_SECTIONS: { section: string; groups: string[] }[] = [
  { section: 'Fresh produce', groups: ['Fruit', 'Vegetables', 'Salad & greens', 'Herbs & aromatics'] },
  { section: 'Meat & seafood', groups: ['Beef & lamb', 'Chicken & turkey', 'Pork & bacon', 'Mince & sausages', 'Fish & seafood', 'Deli meats'] },
  { section: 'Dairy & eggs', groups: ['Milk & cream', 'Cheese', 'Yoghurt', 'Butter & spreads', 'Eggs'] },
  { section: 'Bakery', groups: ['Bread', 'Wraps, rolls & buns', 'Cakes & pastries'] },
  { section: 'Pantry', groups: ['Pasta & noodles', 'Rice & grains', 'Flour & baking', 'Sugar & sweeteners', 'Oils & vinegars', 'Sauces & condiments', 'Herbs & spices', 'Stock & soup', 'Canned veg & tomatoes', 'Canned fish & meat', 'Beans & lentils', 'Nuts & seeds', 'Jams & spreads', 'Cereal & breakfast'] },
  { section: 'Snacks', groups: ['Biscuits & crackers', 'Chips & snacks', 'Chocolate & sweets'] },
  { section: 'Frozen', groups: ['Frozen veg & fruit', 'Frozen meals', 'Ice cream & desserts'] },
  { section: 'Drinks', groups: ['Water & soft drinks', 'Juice', 'Tea & coffee', 'Beer & wine'] },
  { section: 'Household', groups: ['Cleaning', 'Laundry', 'Paper & foil', 'Toiletries', 'Pets', 'Baby'] },
  { section: 'Other', groups: ['Other'] },
];
export const GROUPS: string[] = GROUP_SECTIONS.flatMap((s) => s.groups);
export const sectionOf = (group: string): string => GROUP_SECTIONS.find((s) => s.groups.includes(group))?.section ?? 'Other';
export const isGroup = (g: string): boolean => GROUPS.includes(g);

/** The order to walk the groups in for a store (or the default order): the store's own order first, then any group it leaves out. */
export function groupOrder(store?: Pick<Store, 'order'> | null): string[] {
  const own = (store?.order ?? []).filter(isGroup);
  return [...own, ...GROUPS.filter((g) => !own.includes(g))];
}

export const PLACES = ['Fridge', 'Freezer', 'Pantry', 'Cupboard', 'Other'] as const;

// ---------------------------------------------------------------- display

const SMALL = new Set(['and', 'or', 'of', 'with', 'in', 'on', 'the', 'a', 'an', 'to', 'for', 'de', 'la']);
/** "free range EGGS" -> "Free Range Eggs". Names are stored as typed (real capitalisation) and shown like this, except where the user asks for the real one. */
export function titleCase(name: string): string {
  return name.trim().replace(/\s+/g, ' ').split(' ').map((w, i) => {
    if (i > 0 && SMALL.has(w.toLowerCase())) return w.toLowerCase();
    if (w.length <= 3 && w.length > 1 && w === w.toUpperCase() && /[A-Z]{2}/.test(w)) return w; // UHT, BBQ
    return w.toLowerCase().replace(/(^|[-/(])([a-z\u00e0-\u024f])/g, (_m, p: string, c: string) => p + c.toUpperCase());
  }).join(' ');
}

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

const GROUP_WORDS: [string, string[]][] = [
  ['Fruit', ['apple', 'banana', 'orange', 'lemon', 'lime', 'mandarin', 'grape', 'berry', 'strawberry', 'blueberry', 'raspberry', 'pear', 'peach', 'plum', 'nectarine', 'kiwifruit', 'mango', 'pineapple', 'melon', 'watermelon', 'feijoa', 'avocado', 'cherry', 'grapefruit', 'passionfruit', 'fruit']],
  ['Vegetables', ['onion', 'potato', 'kumara', 'carrot', 'tomato', 'cucumber', 'capsicum', 'red pepper', 'green pepper', 'broccoli', 'cauliflower', 'cabbage', 'zucchini', 'celery', 'pumpkin', 'squash', 'beetroot', 'corn', 'pea', 'bean', 'asparagus', 'leek', 'spring onion', 'eggplant', 'radish', 'parsnip', 'swede', 'mushroom', 'brussels sprout', 'fennel', 'vegetable', 'veg', 'silverbeet', 'bok choy', 'kale']],
  ['Salad & greens', ['lettuce', 'spinach', 'rocket', 'salad', 'coleslaw', 'sprout', 'cress', 'mesclun']],
  ['Herbs & aromatics', ['garlic', 'ginger', 'chilli', 'parsley', 'coriander', 'basil', 'rosemary', 'thyme', 'mint', 'dill', 'chive', 'sage', 'lemongrass', 'herb', 'shallot', 'oregano']],
  ['Beef & lamb', ['beef', 'steak', 'lamb', 'brisket', 'roast', 'rump', 'sirloin', 'scotch fillet', 'veal', 'mutton']],
  ['Chicken & turkey', ['chicken', 'turkey', 'duck', 'drumstick', 'thigh', 'wing', 'breast']],
  ['Pork & bacon', ['pork', 'bacon', 'ham', 'rasher', 'pancetta', 'prosciutto', 'gammon']],
  ['Mince & sausages', ['mince', 'sausage', 'burger', 'patty', 'meatball', 'chorizo']],
  ['Fish & seafood', ['fish', 'salmon', 'snapper', 'hoki', 'prawn', 'shrimp', 'mussel', 'oyster', 'squid', 'crab', 'scallop', 'cod', 'trout', 'whitebait', 'seafood', 'tarakihi']],
  ['Deli meats', ['salami', 'deli', 'luncheon', 'pastrami', 'mortadella', 'pepperoni']],
  ['Milk & cream', ['milk', 'cream', 'custard', 'buttermilk', 'cream cheese', 'sour cream', 'creme fraiche']],
  ['Cheese', ['cheese', 'parmesan', 'cheddar', 'mozzarella', 'feta', 'ricotta', 'halloumi', 'brie', 'camembert', 'gouda', 'edam', 'mascarpone', 'haloumi']],
  ['Yoghurt', ['yoghurt', 'yogurt']],
  ['Butter & spreads', ['butter', 'margarine', 'dairy spread']],
  ['Eggs', ['egg']],
  ['Bread', ['bread', 'sourdough', 'loaf', 'toast', 'baguette', 'ciabatta', 'focaccia']],
  ['Wraps, rolls & buns', ['wrap', 'tortilla', 'pita', 'roll', 'bun', 'bagel', 'naan', 'muffin', 'crumpet', 'flatbread']],
  ['Cakes & pastries', ['cake', 'croissant', 'pastry', 'donut', 'danish', 'scone', 'pie']],
  ['Pasta & noodles', ['pasta', 'spaghetti', 'fettuccine', 'penne', 'macaroni', 'lasagne', 'noodle', 'linguine', 'tagliatelle', 'fusilli', 'rigatoni', 'gnocchi', 'orzo', 'vermicelli', 'ramen']],
  ['Rice & grains', ['rice', 'quinoa', 'couscous', 'oat', 'barley', 'polenta', 'cornmeal', 'bulgur', 'grain', 'semolina']],
  ['Flour & baking', ['flour', 'baking powder', 'baking soda', 'yeast', 'cornflour', 'cocoa', 'baking', 'vanilla', 'gelatine', 'breadcrumb', 'icing sugar', 'sprinkle']],
  ['Sugar & sweeteners', ['sugar', 'honey', 'maple syrup', 'syrup', 'sweetener', 'treacle', 'golden syrup', 'molasses']],
  ['Oils & vinegars', ['oil', 'olive oil', 'vinegar', 'balsamic', 'cooking spray']],
  ['Sauces & condiments', ['sauce', 'ketchup', 'mayo', 'mayonnaise', 'mustard', 'soy', 'dressing', 'paste', 'chutney', 'relish', 'pesto', 'salsa', 'sriracha', 'hoisin', 'worcestershire', 'tomato paste', 'curry paste', 'marinade', 'tahini', 'miso', 'gochujang']],
  ['Herbs & spices', ['salt', 'pepper', 'spice', 'cumin', 'paprika', 'cinnamon', 'turmeric', 'nutmeg', 'oregano', 'chilli flake', 'curry powder', 'garam masala', 'cardamom', 'clove', 'bay leaf', 'seasoning', 'mixed herb', 'cayenne', 'coriander seed', 'garlic powder', 'onion powder', 'italian seasoning']],
  ['Stock & soup', ['stock', 'broth', 'bouillon', 'soup', 'gravy']],
  ['Canned veg & tomatoes', ['tin', 'can', 'canned', 'chopped tomato', 'passata', 'tinned', 'sweetcorn', 'baked bean']],
  ['Canned fish & meat', ['tuna', 'sardine', 'anchovy', 'spam', 'corned beef', 'canned fish']],
  ['Beans & lentils', ['lentil', 'chickpea', 'kidney bean', 'black bean', 'cannellini', 'dried bean', 'split pea', 'hummus']],
  ['Nuts & seeds', ['nut', 'almond', 'cashew', 'walnut', 'pecan', 'peanut', 'pistachio', 'hazelnut', 'seed', 'sesame', 'sunflower', 'chia', 'flax', 'raisin', 'sultana', 'dried date', 'dried fruit', 'cranberry', 'coconut']],
  ['Jams & spreads', ['jam', 'marmalade', 'peanut butter', 'nutella', 'vegemite', 'marmite', 'spread', 'honey spread', 'lemon curd']],
  ['Cereal & breakfast', ['cereal', 'muesli', 'granola', 'weetbix', 'cornflake', 'porridge', 'bran']],
  ['Biscuits & crackers', ['biscuit', 'cracker', 'cookie', 'rice cracker', 'wafer', 'shortbread']],
  ['Chips & snacks', ['chip', 'crisp', 'popcorn', 'pretzel', 'snack']],
  ['Chocolate & sweets', ['chocolate', 'lolly', 'candy', 'sweet', 'gum', 'marshmallow', 'liquorice']],
  ['Frozen veg & fruit', ['frozen veg', 'frozen pea', 'frozen berry', 'frozen corn', 'frozen fruit', 'frozen spinach', 'frozen']],
  ['Frozen meals', ['frozen meal', 'pizza', 'fish finger', 'nugget', 'hash brown', 'fries', 'frozen pastry', 'puff pastry', 'filo', 'dumpling', 'spring roll']],
  ['Ice cream & desserts', ['ice cream', 'icecream', 'gelato', 'sorbet', 'ice block', 'dessert']],
  ['Water & soft drinks', ['water', 'soda', 'cola', 'lemonade', 'cordial', 'soft drink', 'sparkling', 'energy drink', 'ginger beer', 'kombucha']],
  ['Juice', ['juice', 'smoothie']],
  ['Tea & coffee', ['tea', 'coffee', 'espresso', 'hot chocolate', 'milo']],
  ['Beer & wine', ['beer', 'wine', 'cider', 'spirit', 'whisky', 'vodka', 'gin', 'rum', 'champagne', 'prosecco', 'lager']],
  ['Cleaning', ['detergent', 'dishwash', 'bleach', 'wipe', 'sponge', 'cleaner', 'bin bag', 'rubbish', 'disinfectant', 'mop', 'scourer']],
  ['Laundry', ['laundry', 'washing powder', 'fabric softener', 'washing liquid']],
  ['Paper & foil', ['toilet', 'paper towel', 'foil', 'cling', 'baking paper', 'napkin', 'tissue', 'zip bag', 'sandwich bag', 'greaseproof', 'kitchen roll']],
  ['Toiletries', ['shampoo', 'conditioner', 'toothpaste', 'soap', 'deodorant', 'razor', 'toothbrush', 'body wash', 'moisturiser', 'sunscreen', 'tampon']],
  ['Pets', ['dog', 'cat', 'pet', 'kibble', 'litter']],
  ['Baby', ['nappy', 'nappies', 'formula', 'baby', 'wipes']],
];
/** A best guess at the shopping group. Always editable; "Other" when nothing fits. */
export function guessCategory(name: string): string {
  const n = ` ${nameTokens(name).join(' ')} `;
  // the most specific phrase wins: "peanut butter" is a spread, not dairy; "tomato paste" is a sauce, not a vegetable
  let best: { cat: string; len: number } | null = null;
  for (const [cat, words] of GROUP_WORDS) for (const w of words) { const t = nameTokens(w).join(' '); if (t && n.includes(` ${t} `) && (!best || t.length > best.len)) best = { cat, len: t.length }; }
  return best?.cat ?? 'Other';
}

/** A sensible first step and default amount for a unit; the user tweaks both per item. */
export function defaultsForUnit(unit: string | null, mode?: CountMode): { step: number; defaultQty: number } {
  if (mode === 'chunks' && unit && ['g', 'kg', 'ml', 'l'].includes(unit)) return unit === 'g' || unit === 'ml' ? { step: 500, defaultQty: 500 } : { step: 0.5, defaultQty: 0.5 };
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

export type StockState = 'enough' | 'some' | 'none' | 'unknown' | 'unlinked';
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

// ---------------------------------------------------------------- finding and quick-adding

/** "750 grams ch" -> 750 g and the words "ch". A bare number has no unit: it is counted in the item's own unit ("750 ch" for chicken kept in grams). */
export function parseQuickAdd(text: string): { qty: number | null; unit: string | null; words: string } {
  const t = text.trim();
  if (!/^\d|^[\u00bc-\u00be\u2150-\u215e]/.test(t)) return { qty: null, unit: null, words: t };
  const p = parseIngredient(t);
  if (p.quantity === null || (p.unit === null && /^\d+[a-z]/i.test(t))) return { qty: null, unit: null, words: t }; // "7up" is a name
  return { qty: p.quantity, unit: p.unit, words: p.name.trim() };
}

/**
 * Finds items as you type: every word typed must start a word in the name or an alias ("ch" and "chick bre" both find "Chicken Breast"). Names that
 * start with what was typed come first, then the ones already in the pantry, then alphabetical.
 */
export function searchItems(items: Item[], query: string, limit = 8): Item[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (!words.length) return [];
  const score = (i: Item): number | null => {
    let best: number | null = null;
    for (const n of [i.name, ...i.aliases]) {
      const toks = n.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      if (!words.every((w) => toks.some((t) => t.startsWith(w)))) continue;
      const s = n.toLowerCase().startsWith(words.join(' ')) ? 0 : toks[0]?.startsWith(words[0]!) ? 1 : 2;
      if (best === null || s < best) best = s;
    }
    return best;
  };
  return items.map((i) => ({ i, s: score(i) })).filter((x): x is { i: Item; s: number } => x.s !== null)
    .sort((a, b) => a.s - b.s || Number(b.i.tracked) - Number(a.i.tracked) || a.i.name.localeCompare(b.i.name)).slice(0, limit).map((x) => x.i);
}

/** Adding something you already hold plenty of: worth asking whether you are getting more, are out, or the count should stay. */
export const plentyInStock = (item: Pick<Item, 'qty' | 'step' | 'tracked'>): boolean => item.tracked && item.qty > 2 * Math.max(item.step, 0.001);
