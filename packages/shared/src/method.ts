import { canonicalUnit, formatQuantity, unitLabel } from './ingredient.ts';
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

/**
 * Splits a method step into plain and bold pieces, bolding the ingredients it mentions (matched against the recipe's own ingredient names,
 * singular or plural, longest name first). With `hideQuantities`, an amount written right before a mentioned ingredient ("add 175g bacon",
 * "2 cloves garlic") is dropped; numbers anywhere else ("cook for 4 minutes", "180°C") are never touched.
 */
export function highlightStep(step: string, ingredients: Ingredient[], opts: { hideQuantities?: boolean } = {}): Segment[] {
  const variants = [...new Set(ingredients.flatMap((i) => nameVariants(i.name)))].sort((a, b) => b.length - a.length);
  if (!variants.length) return [{ text: step }];
  const re = new RegExp(String.raw`\b(?:${variants.map((v) => v.split(/\s+/).map(esc).join(String.raw`\s+`)).join('|')})(?:es|s)?\b`, 'gi');
  const out: Segment[] = [];
  let at = 0;
  for (const m of step.matchAll(re)) {
    let before = step.slice(at, m.index);
    if (opts.hideQuantities) { const q = QTY_BEFORE.exec(before); if (q) before = before.slice(0, q.index); }
    if (before) out.push({ text: before });
    out.push({ text: m[0], bold: true });
    at = m.index + m[0].length;
  }
  if (at < step.length) out.push({ text: step.slice(at) });
  return out.length ? out : [{ text: step }];
}

export { canonicalUnit };
