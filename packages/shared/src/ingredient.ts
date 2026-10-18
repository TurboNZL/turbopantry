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

const WORD_NUMBERS: Record<string, string> = { a: '1', an: '1', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', dozen: '12' };

/**
 * Writes the ways people spell a leading amount in the one form the parser reads: "1⁄2" (fraction slash) and "1 / 2" become "1/2", ".5" becomes
 * "0.5", "1/2-cup" becomes "1/2 cup", and "half a cup", "one cup", "two eggs", "a quarter cup" become digits. Only the start of the line is touched.
 */
export function normaliseQuantityText(text: string): string {
  let t = text.replace(/[\u2044\u2215]/g, '/').replace(/^(\s*\d+)\s*\/\s*(\d+)/, '$1/$2').replace(/^\s*\.(\d)/, '0.$1');
  t = t.replace(/^(\s*(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?))-(?=[A-Za-z])/, '$1 ');
  const half = /^\s*(?:(?:a|one)\s+half|half(?:\s+an?)?)\s+(?=\S)/i.exec(t);
  if (half) return `0.5 ${t.slice(half[0].length)}`;
  const quarter = /^\s*(?:a|one)\s+(quarter|third)\s+(?:of\s+an?\s+|of\s+|an?\s+)?/i.exec(t);
  if (quarter) return `${quarter[1]!.toLowerCase() === 'third' ? '1/3' : '1/4'} ${t.slice(quarter[0].length)}`;
  const word = /^\s*(an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen)\s+(?!of\b)(?=\S)/i.exec(t);
  // "a pinch of salt" stays words (no amount), but "one cup milk" and "two eggs" are amounts; a bare "a"/"an" is left alone
  if (word && !/^an?$/i.test(word[1]!)) return `${WORD_NUMBERS[word[1]!.toLowerCase()]} ${t.slice(word[0].length)}`;
  return t;
}

const ADJECTIVES = new Set(['large', 'small', 'medium', 'big', 'fresh', 'ripe', 'frozen', 'dried', 'dry', 'raw', 'cooked', 'whole', 'lean', 'thick', 'thin', 'hot', 'cold', 'warm', 'soft', 'firm', 'organic', 'free-range', 'extra', 'good', 'quality', 'plain', 'light', 'heavy', 'mild', 'sweet']);
/** A comma-separated piece that only describes ("boneless", "finely chopped", "large"), so it cannot be the ingredient itself. */
function describesOnly(seg: string): boolean {
  const words = seg.toLowerCase().split(/[\s-]+/).filter(Boolean);
  return words.length > 0 && words.length <= 3 && words.every((w) => ADJECTIVES.has(w) || /^(?:.{3,}less|.{2,}ly|.{4,}ed)$/.test(w));
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
  let rest = normaliseQuantityText(raw);

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
  // "boneless, skinless, chicken breast": words that only describe come before the comma, so they are notes and the name is what follows
  const lead: string[] = [];
  for (let c = rest.indexOf(','); c > 0; c = rest.indexOf(',')) {
    const seg = rest.slice(0, c).trim(), after = rest.slice(c + 1).trim();
    if (!after || !describesOnly(seg)) break;
    lead.push(seg); rest = after;
  }
  if (lead.length) { // the description may carry on without a comma: "boneless, skinless chicken breast"
    for (let w = rest.split(' '); w.length > 2 || (w.length === 2 && !rest.includes(',')); w = rest.split(' ')) {
      if (!describesOnly(w[0]!) || rest.slice(w[0]!.length).trimStart().startsWith(',')) break;
      lead.push(w[0]!); rest = w.slice(1).join(' ');
    }
    notes.push(lead.join(', '));
  }
  const comma = rest.indexOf(',');
  if (comma > 0) { notes.push(rest.slice(comma + 1).trim()); rest = rest.slice(0, comma); }

  const choice = /\s+of (?:your|their) choice\b/i.exec(rest) ?? /\s+of choice\b/i.exec(rest); // "pasta of your choice" is pasta
  if (choice) { rest = rest.replace(choice[0], ''); notes.push(choice[0].trim()); }
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

/**
 * One line that lists several things with one shared amount becomes one line each: "Seasonings (1 tsp each): paprika, garlic powder, salt"
 * is "1 tsp paprika", "1 tsp garlic powder", "1 tsp salt". Any other line is returned as it is.
 */
export function expandEachLine(line: string): string[] {
  const m = new RegExp(String.raw`^[^:]*?\(?\s*(${QTY}\s*[A-Za-z.]*)\s+each\s*\)?\s*(?:of\s+)?[:：-]\s*(.+)$`, 'i').exec(line.trim());
  if (!m) return [line];
  const parts = m[2]!.split(/\s*(?:,|;|\band\b|&)\s*/i).map((p) => p.trim().replace(/[.]+$/, '')).filter(Boolean);
  return parts.length > 1 ? parts.map((p) => `${m[1]!.trim()} ${p}`) : [line];
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
    for (const one of expandEachLine(t)) out.push(parseIngredient(one, section));
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

const COUNTED: Record<string, string> = { cup: 'cups', clove: 'cloves', can: 'cans', jar: 'jars', package: 'packages', packet: 'packets', bag: 'bags', box: 'boxes', bottle: 'bottles', slice: 'slices', piece: 'pieces', sprig: 'sprigs', bunch: 'bunches', stick: 'sticks', head: 'heads', stalk: 'stalks', handful: 'handfuls', pinch: 'pinches', dash: 'dashes', pint: 'pints', quart: 'quarts', gallon: 'gallons', sheet: 'sheets', fillet: 'fillets', rasher: 'rashers', knob: 'knobs' };
/** "clove" -> "cloves" when there is more than one; measures such as tsp, g and oz never change. */
export function unitLabel(unit: string | null, quantity: number | null): string | null {
  if (!unit || quantity === null || quantity <= 1) return unit;
  return COUNTED[unit] ?? unit;
}

/** Lines that start like an amount but whose amount could not be read, so they will NOT scale when the servings change (shown to the user, never silently ignored). */
export function unscalableLines(items: Ingredient[]): string[] {
  return items.filter((i) => i.quantity === null && /^\s*(?:\d|[¼½¾⅓⅔⅛]|(?:an?|one|two|three|four|five|six|half)\s+(?:cups?|tbsps?|tsps?|tablespoons?|teaspoons?|oz|lbs?|g|kg|ml|l)\b)/i.test(i.raw)).map((i) => i.raw);
}

export function scaleIngredient(i: Ingredient, factor: number): string {
  if (i.quantity === null) return i.raw;
  const q = formatQuantity(i.quantity * factor) + (i.quantityMax !== null ? `–${formatQuantity(i.quantityMax * factor)}` : '');
  return [q, unitLabel(i.unit, (i.quantityMax ?? i.quantity) * factor), i.name].filter(Boolean).join(' ') + (i.note ? `, ${i.note}` : '');
}
