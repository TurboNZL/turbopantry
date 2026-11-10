import { canonicalUnit, formatQuantity, parseIngredient, parseQuantity, unitLabel } from './ingredient.ts';
import type { Ingredient } from './recipe.ts';

/** One piece of a method step. `bold` pieces are ingredient names the step mentions. */
export interface Segment { text: string; bold?: boolean }

/**
 * Cleans a list of method steps that were pasted or imported: lines that are only a step number ("1", "2.", "Step 3") and bare headings
 * ("Directions", "Method") are dropped, and a leading "1. " is removed. Nothing else is touched.
 */
export function cleanSteps(steps: string[]): string[] {
  return steps
    .map((s) => s.trim())
    .filter((s) => s && !/^(?:step\s*)?\d+\s*[.):]?$/i.test(s) && !/^(?:directions?|method|instructions?|steps?|preparation)\s*:?$/i.test(s))
    .map((s) => s.replace(/^\s*(?:step\s*)?\d+\s*[.)]\s+/i, ''));
}

/** What an ingredient line shows: the (scaled) amount, the name, and the note, separately, so the amount can be bold or hidden. */
export function ingredientParts(i: Ingredient, factor = 1): { amount: string; name: string; note: string } {
  if (i.quantity === null) return { amount: '', name: i.name === i.raw ? i.raw : i.name, note: i.note ?? '' };
  const q = formatQuantity(i.quantity * factor) + (i.quantityMax !== null ? `–${formatQuantity(i.quantityMax * factor)}` : '');
  return { amount: [q, unitLabel(i.unit, (i.quantityMax ?? i.quantity) * factor)].filter(Boolean).join(' '), name: i.name, note: i.note ?? '' };
}

// words that describe an ingredient but are not what a step would call it
const LEAD = new Set(['fresh', 'large', 'small', 'medium', 'big', 'ripe', 'dried', 'dry', 'ground', 'whole', 'raw', 'cooked', 'frozen', 'tinned', 'canned', 'finely', 'roughly', 'thinly', 'chopped', 'sliced', 'grated', 'crushed', 'minced', 'unsalted', 'salted', 'extra', 'light', 'thickened', 'plain', 'shortcut', 'free', 'range', 'australian', 'organic', 'and', 'or', 'of', 'the', 'a']);
const NEVER = new Set(['cup', 'cups', 'can', 'cans', 'pinch', 'taste', 'other', 'more', 'some', 'each', 'extra', 'optional', 'serve', 'about', 'plus', 'such', 'mix', 'one', 'two', 'large', 'small']);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The ways a step might name this ingredient, longest first: "fresh fettuccine pasta", "fettuccine pasta", "pasta". */
export function nameVariants(name: string): string[] {
  const tokens = name.toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9'’-]+/).filter(Boolean);
  const out = new Set<string>();
  const add = (t: string[]) => { const s = t.join(' '); if (s.length >= 3 && !(t.length === 1 && NEVER.has(t[0]!))) out.add(s); };
  add(tokens);
  let start = 0;
  while (start < tokens.length - 1 && LEAD.has(tokens[start]!)) start++;
  add(tokens.slice(start));
  if (tokens.length >= 2) add(tokens.slice(-2));
  const head = tokens[start]; // "shortcut bacon rashers" -> bacon
  if (head && head.length >= 3 && !LEAD.has(head)) add([head]);
  const last = tokens.at(-1);
  if (last && last.length >= 3 && !LEAD.has(last)) add([last]);
  return [...out].sort((a, b) => b.length - a.length);
}

const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+(?:[.,]\d+)?\s*[¼½¾⅓⅔⅛]|\d+\/\d+|\d+(?:[.,]\d+)?|[¼½¾⅓⅔⅛])`;
const UNIT_WORDS = String.raw`(?:cups?|tbsps?|tablespoons?|tsps?|teaspoons?|kgs?|mgs?|g|ml|l|oz|ozs|lbs?|pounds?|cloves?|cans?|tins?|slices?|pieces?|sprigs?|bunch(?:es)?|sticks?|heads?|stalks?|pinch(?:es)?|handfuls?|packets?)`;
// "2 cloves ", "175g ", "1/2 cup ", "2 x ", "1 1/2 tsp of " directly in front of an ingredient name
const QTY_BEFORE = new RegExp(String.raw`(?:^|(?<=[\s(]))(?:about\s+|around\s+)?${NUM}\s*(?:x\s*)?(?:${UNIT_WORDS}\b\.?\s*)?(?:of\s+)?$`, 'i');

/** "1/2 cup " doubled is "1 cup ": the amount in front of an ingredient in a step, scaled and written the way recipes write it. Unreadable ("2 x ") stays as it is. */
export function scaleAmountText(text: string, factor: number): string {
  if (/x\s*$/i.test(text.trim())) return text;
  const trail = /\s*$/.exec(text)![0] || ' ';
  const hasOf = /\bof$/i.test(text.trim());
  const p = parseIngredient(text.trim().replace(/\s*\bof$/i, '') + ' x');
  if (p.quantity === null || p.name.trim() !== 'x') return text;
  const q = formatQuantity(p.quantity * factor) + (p.quantityMax !== null ? '\u2013' + formatQuantity(p.quantityMax * factor) : '');
  const glued = !p.unit ? '' : /^\d+(?:[.,]\d+)?(?:g|kg|ml|l|mg|oz|lb)\b/i.test(text.trim()) ? String(p.unit) : ' ' + unitLabel(p.unit, (p.quantityMax ?? p.quantity) * factor);
  return q + glued + (hasOf ? ' of' : '') + trail;
}

/**
 * Splits a method step into plain and bold pieces, bolding the ingredients it mentions (matched against the recipe's own ingredient names,
 * singular or plural, longest name first). With `hideQuantities`, an amount written right before a mentioned ingredient ("add 175g bacon",
 * "2 cloves garlic") is dropped; numbers anywhere else ("cook for 4 minutes", "180°C") are never touched.
 */
export function highlightStep(step: string, ingredients: Ingredient[], opts: { hideQuantities?: boolean; factor?: number } = {}): Segment[] {
  const variants = [...new Set(ingredients.flatMap((i) => nameVariants(i.name)))].sort((a, b) => b.length - a.length);
  if (!variants.length) return [{ text: step }];
  const re = new RegExp(String.raw`\b(?:${variants.map((v) => v.split(/\s+/).map(esc).join(String.raw`\s+`)).join('|')})(?:es|s)?\b`, 'gi');
  const out: Segment[] = [];
  let at = 0;
  for (const m of step.matchAll(re)) {
    let before = step.slice(at, m.index);
    if (opts.hideQuantities) { const q = QTY_BEFORE.exec(before); if (q) before = before.slice(0, q.index); }
    else if (opts.factor && opts.factor !== 1) { const q = QTY_BEFORE.exec(before); if (q) before = before.slice(0, q.index) + scaleAmountText(q[0], opts.factor); }
    if (before) out.push({ text: before });
    out.push({ text: m[0], bold: true });
    at = m.index + m[0].length;
  }
  if (at < step.length) out.push({ text: step.slice(at) });
  return out.length ? out : [{ text: step }];
}

export { canonicalUnit };

export interface TimeSpan { start: number; end: number; seconds: number }

const T_NUM = String.raw`\d+(?:[.,]\d+)?|\d+\s*[¼½¾⅓⅔⅛]|[¼½¾⅓⅔⅛]|\d+\s+\d+\/\d+|\d+\/\d+`;
const T_UNIT_H = String.raw`hours?|hrs?`, T_UNIT_M = String.raw`minutes?|mins?`, T_UNIT_S = String.raw`seconds?|secs?`;
const TIME_RE = new RegExp(String.raw`\b(?:(${T_NUM})\s*(${T_UNIT_H})\s*(?:and\s*)?(${T_NUM})\s*(${T_UNIT_M})|(${T_NUM})(?:\s*(?:-|–|—|to)\s*(${T_NUM}))?\s*(${T_UNIT_H}|${T_UNIT_M}|${T_UNIT_S}))\b`, 'gi');
const num = (t: string): number => { const v = parseQuantity(t.replace(',', '.')); return v ?? 0; };
const unitSeconds = (u: string): number => (/^h/i.test(u) ? 3600 : /^m/i.test(u) ? 60 : 1);

/**
 * Time periods written in a method step ("20 minutes", "1 hour 30 minutes", "10-15 min", "1½ hours", "45 seconds"), with where they sit in the text and how many
 * seconds they are. A range counts as its upper end. Only whole words with a time unit match, so "5 g" or "2 tablespoons" never do.
 */
export function findTimes(text: string): TimeSpan[] {
  const out: TimeSpan[] = [];
  for (const m of text.matchAll(TIME_RE)) {
    const seconds = m[1] !== undefined ? num(m[1]) * 3600 + num(m[3]!) * 60 : Math.max(num(m[5]!), m[6] ? num(m[6]) : 0) * unitSeconds(m[7]!);
    if (seconds >= 1 && seconds <= 48 * 3600) out.push({ start: m.index, end: m.index + m[0].length, seconds: Math.round(seconds) });
  }
  return out;
}
