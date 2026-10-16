import { parseIngredient, parseIngredientBlock } from './ingredient.ts';
import { parseMinutes, parseServings } from './duration.ts';
import type { Ingredient, RecipeInput } from './recipe.ts';

/**
 * Turns the text of a social post (the caption, and the comments where creators often put the full recipe) into a recipe DRAFT. Free and offline:
 * headings like "Ingredients" and "Method" are looked for first (with or without emoji), and when there are none the lines themselves decide
 * (a line that starts with an amount is an ingredient, a numbered or long sentence is a step). It is a heuristic: the user always reviews the draft.
 */
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu;
const strip = (s: string) => s.replace(EMOJI, ' ').replace(/\s+/g, ' ').trim();

const ING_HEAD = /^(?:ingredients?|you(?:'|’)?ll need|you will need|what you(?:'|’)?ll need|what you need|shopping list|grocery)\s*[:：\-–]?\s*$/i;
const METHOD_HEAD = /^(?:method|methods?|directions?|instructions?|steps?|how to make(?: it)?|how to|to make|preparation|procedure|recipe)\s*[:：\-–]?\s*$/i;
const NOISE = /(?:^#|#\w+\s*$|follow|link in bio|dm me|comment ["“]?\w+|save this|share this|tag (?:a|your|me)|subscribe|giveaway|sponsored|collab|@\w+|www\.|https?:\/\/|like and|turn on post)/i;
const AMOUNT_START = /^(?:[\d¼½¾⅓⅔⅛]|an? |one |two |three |half |a (?:pinch|dash|handful|splash)|pinch|dash|handful|splash|salt|pepper)/i;
const UNIT_WORD = /\b(?:g|kg|ml|l|cups?|tbsps?|tsps?|tablespoons?|teaspoons?|oz|lbs?|pounds?|grams?|litres?|liters?|cloves?|cans?|tins?|pinch|dash|handful|slices?|sticks?)\b/i;
const NUM_STEP = /^\s*(?:\(?\d{1,2}[.):]|[\d]️?⃣|step\s*\d+\s*[:.\-)]?)\s*/i;

function bullets(line: string): string { return line.replace(/^[\s•·▪▫◦●○■□▶►➤➡✔✅☑✓✔️\-–—*+⭐🔸🔹🔺🔻]+/u, '').replace(EMOJI, ' ').replace(/\s+/g, ' ').trim(); }

const isIngredientLike = (l: string) => { const t = bullets(l); return t.length > 1 && t.length < 90 && AMOUNT_START.test(t) && (UNIT_WORD.test(t) || /^[\d¼½¾⅓⅔⅛]/.test(t)) && !/[.!?]\s+\S/.test(t); };

interface Split { title: string; ingredients: string[]; steps: string[]; rest: string[] }

function split(text: string): Split {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim());
  const out: Split = { title: '', ingredients: [], steps: [], rest: [] };
  let mode: 'rest' | 'ing' | 'method' = 'rest';
  let sawHeading = false;
  const headText = (l: string) => strip(l).replace(/[:：]\s*$/, '');
  for (const raw of lines) {
    if (!raw) { continue; }
    const h = strip(raw);
    if (ING_HEAD.test(h) || (/^(?:ingredients?)\b/i.test(h) && h.length < 40)) { mode = 'ing'; sawHeading = true; const after = h.replace(/^ingredients?\s*[:：\-–]?\s*/i, ''); if (after && isIngredientLike(after)) out.ingredients.push(after); continue; }
    if (METHOD_HEAD.test(h)) { mode = 'method'; sawHeading = true; continue; }
    if (NOISE.test(raw) && !isIngredientLike(raw) && !NUM_STEP.test(raw)) { if (mode === 'rest') out.rest.push(raw); continue; }
    if (mode === 'ing') {
      const t = bullets(raw);
      if (!t) continue;
      if (/[:：]$/.test(t) && t.length < 40 && !isIngredientLike(t)) { out.ingredients.push(`# ${headText(t)}`); continue; }
      if (NUM_STEP.test(raw) && t.length > 60) { mode = 'method'; out.steps.push(raw); continue; } // a numbered paragraph: the method started without a heading
      out.ingredients.push(t); continue;
    }
    if (mode === 'method') { out.steps.push(raw); continue; }
    out.rest.push(raw);
  }
  if (!sawHeading) {
    // no headings: decide line by line
    const ing: string[] = [], steps: string[] = [], rest: string[] = [];
    for (const l of out.rest) {
      if (isIngredientLike(l)) ing.push(bullets(l));
      else if (NUM_STEP.test(l) || strip(l).length > 70) steps.push(l);
      else rest.push(l);
    }
    out.ingredients = ing; out.steps = steps; out.rest = rest;
  }
  const first = out.rest.find((l) => !NOISE.test(l) && strip(l).length > 2);
  // the title is the first line up to the first emoji or sentence end ("Creamy garlic pasta 🍝 SO easy!" -> "Creamy garlic pasta")
  const lead = first ? (first.split(EMOJI)[0] ?? '') : '';
  const base = strip(lead).length >= 4 ? lead : (first ?? '');
  out.title = strip(base).replace(/\s*(?:[!?:：]|\.\s).*$/, '').replace(/[:：!?.\s]+$/, '').slice(0, 120);
  return out;
}

const cleanStep = (s: string) => strip(s.replace(NUM_STEP, '')).replace(/^[-–—•]\s*/, '');

function stepsFrom(lines: string[]): string[] {
  // one numbered line is one step; an unnumbered line that follows a step and does not look like a new one belongs to the same step only if it is short
  const out: string[] = [];
  for (const l of lines) {
    const t = cleanStep(l);
    if (!t) continue;
    if (NUM_STEP.test(l) || !out.length || t.length > 25) out.push(t); else out[out.length - 1] += ` ${t}`;
  }
  // a single blob with sentences: split it into steps of a few sentences each
  if (out.length === 1 && out[0]!.length > 220) return out[0]!.split(/(?<=[.!?])\s+(?=[A-Z])/).reduce<string[]>((acc, s) => { if (acc.length && acc[acc.length - 1]!.length < 60) acc[acc.length - 1] += ` ${s}`; else acc.push(s); return acc; }, []);
  return out;
}

export interface TextDraft { recipe: RecipeInput; warnings: string[] }

/** How recipe-like a piece of text is: ingredient lines count most, then the words that name a method. */
function score(s: Split): number { return s.ingredients.filter((l) => !l.startsWith('#')).length * 3 + s.steps.length * 2; }

/**
 * `sources` is the caption first, then the comments. The best one wins; if the caption has the method but a comment has the ingredients (or the
 * other way round) the missing half is taken from the comment. `sourceUrl` is kept as the recipe's source.
 */
export function parseRecipeText(sources: string[], opts: { sourceUrl?: string | null; sourceName?: string | null; imageUrl?: string | null } = {}): TextDraft | null {
  const parts = sources.map((t) => t.trim()).filter(Boolean).map((t) => ({ t, s: split(t) }));
  if (!parts.length) return null;
  const best = [...parts].sort((a, b) => score(b.s) - score(a.s))[0]!;
  let ingredients = best.s.ingredients, steps = best.s.steps;
  const warnings: string[] = [];
  if (!ingredients.length) { const other = parts.find((p) => p.s.ingredients.length); if (other) ingredients = other.s.ingredients; }
  if (!steps.length) { const other = parts.find((p) => p.s.steps.length); if (other) steps = other.s.steps; }
  if (!ingredients.length && !steps.length) return null;
  const title = (parts[0]!.s.title || best.s.title || 'Recipe from a post').replace(/\s*[|–—-]\s*(?:recipe|full recipe).*$/i, '');
  const all = parts.map((p) => p.t).join('\n');
  const serves = /(?:serves|servings?|makes|yield)\s*[:：]?\s*(\d+)/i.exec(all)?.[1];
  const time = (label: RegExp) => { const m = label.exec(all); return m ? parseMinutes(m[1]) : null; };
  const prep = time(/prep(?:aration)?(?: time)?\s*[:：]?\s*([\d\w ]{1,20}?)(?:\n|$|,|\|)/i), cook = time(/cook(?:ing)?(?: time)?\s*[:：]?\s*([\d\w ]{1,20}?)(?:\n|$|,|\|)/i);
  const items: Ingredient[] = parseIngredientBlock(ingredients.join('\n'));
  if (!items.length) warnings.push('No ingredient list was found in the post. Check the comments for it, or add the ingredients yourself.');
  if (!steps.length) warnings.push('No method was found in the post. Creators often put it in a comment: paste that comment too, or add the steps yourself.');
  const desc = best.s.rest.filter((l) => !NOISE.test(l) && strip(l) !== title).map(strip).filter((l) => l.length > 15).slice(0, 3).join(' ').slice(0, 600);
  return {
    recipe: {
      title, description: desc, imageUrl: opts.imageUrl ?? null, sourceUrl: opts.sourceUrl ?? null, sourceName: opts.sourceName ?? 'Instagram',
      servings: serves ? parseServings(serves) : null, prepMinutes: prep || null, cookMinutes: cook || null, totalMinutes: prep && cook ? prep + cook : null,
      ingredients: items, steps: stepsFrom(steps), tags: [], notes: '',
    },
    warnings,
  };
}


