import type { Ingredient } from './recipe.ts';

const FRACTIONS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };

/** Spellings people use -> the canonical unit stored. Plurals are handled by stripping a trailing s first. */
const UNIT_ALIASES: Record<string, string> = {
  cup: 'cup', c: 'cup', tablespoon: 'tbsp', tbsp: 'tbsp', tbs: 'tbsp', tbl: 'tbsp', tb: 'tbsp', teaspoon: 'tsp', tsp: 'tsp',
  ounce: 'oz', oz: 'oz', pound: 'lb', lb: 'lb', gram: 'g', g: 'g', gm: 'g', kilogram: 'kg', kg: 'kg', milligram: 'mg', mg: 'mg',
  milliliter: 'ml', millilitre: 'ml', ml: 'ml', liter: 'l', litre: 'l', l: 'l', pint: 'pint', pt: 'pint', quart: 'quart', qt: 'quart', gallon: 'gallon', gal: 'gallon',
  fl: 'fl oz', can: 'can', tin: 'can', jar: 'jar', package: 'package', pkg: 'package', packet: 'packet', bag: 'bag', box: 'box', bottle: 'bottle',
  clove: 'clove', slice: 'slice', piece: 'piece', pinch: 'pinch', dash: 'dash', sprig: 'sprig', bunch: 'bunch', stick: 'stick', head: 'head', stalk: 'stalk', handful: 'handful',
  knob: 'knob', sheet: 'sheet', fillet: 'fillet', rasher: 'rasher',
};

const SECTION_ENDS = /^(.{1,60}?):\s*$/;

/** "1 1/2", "½", "1½", "2.5", "1/4" -> number; null when the text is not a quantity. */
export function parseQuantity(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  let total = 0, seen = false;
  for (const part of t.replace(/(\d)([¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, '$1 $2').split(/\s+/)) {
    if (part in FRACTIONS) { total += FRACTIONS[part]!; seen = true; continue; }
    const frac = /^(\d+)\/(\d+)$/.exec(part);
    if (frac) { const d = Number(frac[2]); if (!d) return null; total += Number(frac[1]) / d; seen = true; continue; }
    if (/^\d+([.,]\d+)?$/.test(part)) { total += Number(part.replace(',', '.')); seen = true; continue; }
    return null;
  }
  return seen ? total : null;
}

const QTY = String.raw`(?:\d+\s+\d+\/\d+|\d+\s*[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\d+\/\d+|\d+(?:[.,]\d+)?|[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])`;
const LEADING = new RegExp(String.raw`^\s*(${QTY})(?:\s*(?:-|–|—|to)\s*(${QTY}))?\s*`, 'i');

export function canonicalUnit(word: string): string | null {
  const w = word.toLowerCase().replace(/\.$/, '');
  if (w in UNIT_ALIASES) return UNIT_ALIASES[w]!;
  if (w.endsWith('es') && w.slice(0, -2) in UNIT_ALIASES) return UNIT_ALIASES[w.slice(0, -2)]!;
  if (w.endsWith('s') && w.slice(0, -1) in UNIT_ALIASES) return UNIT_ALIASES[w.slice(0, -1)]!;
  return null;
}

/**
 * Splits one ingredient line into quantity, unit, name and note. Never throws and never drops text: when it cannot find a
 * quantity the whole line becomes the name, and `raw` always holds the original.
 *   "1 1/2 cups all-purpose flour, sifted" -> 1.5 cup | all-purpose flour | sifted
 *   "1 (14 oz) can chopped tomatoes"       -> 1 can | chopped tomatoes | 14 oz
 *   "2-3 tbsp olive oil"                   -> 2..3 tbsp | olive oil
 */
export function parseIngredient(line: string, section: string | null = null): Ingredient {
  const raw = line.replace(/\s+/g, ' ').trim();
  const out: Ingredient = { raw, quantity: null, quantityMax: null, unit: null, name: raw, note: null, section };
  let rest = raw;

  const m = LEADING.exec(rest);
  if (m) {
    out.quantity = parseQuantity(m[1]!);
    out.quantityMax = m[2] ? parseQuantity(m[2]) : null;
    if (out.quantity !== null) rest = rest.slice(m[0].length);
  }

  const notes: string[] = [];
  // a size in brackets right after the quantity: "1 (14 oz) can tomatoes"
  const size = /^\(([^)]*)\)\s*/.exec(rest);
  if (out.quantity !== null && size) { notes.push(size[1]!.trim()); rest = rest.slice(size[0].length); }

  if (out.quantity !== null) {
    const w = /^([A-Za-z.]+)\b\.?\s*/.exec(rest);
    if (w) {
      let unit = canonicalUnit(w[1]!);
      let used = w[0];
      if (unit === 'fl oz' || (w[1]!.toLowerCase() === 'fl' && /^fl\.?\s*oz/i.test(rest))) { const f = /^fl\.?\s*(oz|ounces?)\b\.?\s*/i.exec(rest); if (f) { unit = 'fl oz'; used = f[0]; } }
      if (unit) { out.unit = unit; rest = rest.slice(used.length); }
    }
    rest = rest.replace(/^of\s+/i, '');
  }

  // trailing ", diced" and "(optional)" are notes, not part of the name
  const parens = [...rest.matchAll(/\(([^)]*)\)/g)].map((x) => x[1]!.trim()).filter(Boolean);
  if (parens.length) { notes.push(...parens); rest = rest.replace(/\s*\([^)]*\)/g, ''); }
  const comma = rest.indexOf(',');
  if (comma > 0) { notes.push(rest.slice(comma + 1).trim()); rest = rest.slice(0, comma); }

  out.name = rest.replace(/\s+/g, ' ').trim() || raw;
  out.note = notes.filter(Boolean).join('; ') || null;
  return out;
}

/** True for a line that names a group ("For the sauce:", "Cheese sauce:") rather than an ingredient. */
export function sectionHeading(line: string): string | null {
  const m = SECTION_ENDS.exec(line.trim());
  if (!m || /\d/.test(m[1]!)) return null;
  return m[1]!.replace(/^for (the )?/i, '').trim() || null;
}

/** Parses a block of text, one ingredient per line. A line ending in ":" or starting with "#" starts a new section. */
export function parseIngredientBlock(text: string): Ingredient[] {
  const out: Ingredient[] = [];
  let section: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#')) { section = t.replace(/^#+\s*/, '').replace(/:$/, '').trim() || null; continue; }
    const head = sectionHeading(t);
    if (head) { section = head; continue; }
    out.push(parseIngredient(t, section));
  }
  return out;
}

/** The inverse of parseIngredientBlock, for the edit form. */
export function ingredientsToBlock(items: Ingredient[]): string {
  const lines: string[] = [];
  let section: string | null = null;
  for (const i of items) {
    if (i.section !== section) { section = i.section; if (section) lines.push(`# ${section}`); }
    lines.push(i.raw);
  }
  return lines.join('\n');
}

const NICE: [number, string][] = [[0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.375, '⅜'], [0.5, '½'], [0.625, '⅝'], [2 / 3, '⅔'], [0.75, '¾'], [0.875, '⅞']];

/** 1.5 -> "1½", 0.333 -> "⅓", 2 -> "2", 2.37 -> "2.4". Falls back to a rounded decimal when no common fraction is close. */
export function formatQuantity(n: number): string {
  if (!Number.isFinite(n)) return '';
  const whole = Math.floor(n + 1e-9), frac = n - whole;
  if (frac < 0.02) return String(whole);
  if (frac > 0.98) return String(whole + 1);
  for (const [v, s] of NICE) if (Math.abs(frac - v) < 0.02) return whole ? `${whole}${s}` : s;
  return String(Math.round(n * 10) / 10);
}

export function scaleIngredient(i: Ingredient, factor: number): string {
  if (i.quantity === null) return i.raw;
  const q = formatQuantity(i.quantity * factor) + (i.quantityMax !== null ? `–${formatQuantity(i.quantityMax * factor)}` : '');
  return [q, i.unit, i.name].filter(Boolean).join(' ') + (i.note ? `, ${i.note}` : '');
}
