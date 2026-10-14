import { cleanSteps, parseIngredient, parseMinutes, parseServings, sectionHeading, type Ingredient, type RecipeInput } from '@turbopantry/shared';
import { decodeEntities, htmlToText, ldJsonBlocks, metaTags } from './html.ts';

type Json = unknown;
const isObj = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** JSON.parse that survives the usual real-world damage: raw newlines/tabs inside strings, BOMs, stray trailing commas, HTML comments. */
export function lenientParse(src: string): Json | undefined {
  const clean = src.replace(/^﻿/, '').replace(/^\s*<!--/, '').replace(/-->\s*$/, '').trim();
  try { return JSON.parse(clean); } catch { /* try repairing */ }
  let out = '', inStr = false, esc = false;
  for (const ch of clean) {
    if (inStr) {
      if (esc) { out += ch; esc = false; }
      else if (ch === '\\') { out += ch; esc = true; }
      else if (ch === '"') { out += ch; inStr = false; }
      else if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '';
      else if (ch === '\t') out += '\\t';
      else out += ch;
    } else { if (ch === '"') inStr = true; out += ch; }
  }
  try { return JSON.parse(out.replace(/,\s*([}\]])/g, '$1')); } catch { return undefined; }
}

const types = (n: Record<string, Json>): string[] => [n['@type']].flat().filter((t): t is string => typeof t === 'string').map((t) => t.replace(/^.*[/#:]/, '').toLowerCase());

/** Every node in a JSON-LD document, flattening @graph and arrays. */
function* nodes(v: Json, depth = 0): Generator<Record<string, Json>> {
  if (depth > 6) return;
  if (Array.isArray(v)) { for (const x of v) yield* nodes(x, depth + 1); return; }
  if (!isObj(v)) return;
  yield v;
  if (v['@graph']) yield* nodes(v['@graph'], depth + 1);
  if (v['mainEntity']) yield* nodes(v['mainEntity'], depth + 1);
}

const text = (v: Json): string => (typeof v === 'string' ? htmlToText(v) : typeof v === 'number' ? String(v) : isObj(v) ? text(v['text'] ?? v['name'] ?? '') : Array.isArray(v) ? v.map(text).filter(Boolean).join(' ') : '');

function image(v: Json): string | null {
  if (typeof v === 'string') return v || null;
  if (Array.isArray(v)) { for (const x of v) { const i = image(x); if (i) return i; } return null; }
  if (isObj(v)) return image(v['url'] ?? v['contentUrl'] ?? null);
  return null;
}

/** recipeInstructions comes as one string, a list of strings, HowToStep objects, or HowToSection objects holding steps. */
function steps(v: Json): string[] {
  if (typeof v === 'string') {
    const t = decodeEntities(v);
    const lines = (/<(li|p|br)\b/i.test(t) ? htmlToText(t, true) : t).split(/\r?\n+/).map((l) => l.replace(/^\s*(?:step\s*)?\d+[.)]\s+/i, '').trim()).filter(Boolean);
    return lines;
  }
  if (Array.isArray(v)) return v.flatMap(steps);
  if (isObj(v)) {
    const t = types(v);
    if (t.includes('howtosection') || (v['itemListElement'] && !v['text'])) return steps(v['itemListElement']);
    return steps(v['text'] ?? v['name'] ?? '');
  }
  return [];
}

const list = (v: Json): string[] => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map((x) => text(x).trim()).filter(Boolean);

/** Looks for a schema.org Recipe in the page's JSON-LD and maps it to a RecipeInput. Returns null when the page has none. */
export function extractFromJsonLd(html: string, pageUrl: string): RecipeInput | null {
  let recipe: Record<string, Json> | null = null;
  for (const block of ldJsonBlocks(html)) {
    const doc = lenientParse(block);
    if (doc === undefined) continue;
    for (const n of nodes(doc)) if (types(n).includes('recipe') && (n['recipeIngredient'] || n['ingredients'] || n['recipeInstructions'])) { recipe = n; break; }
    if (recipe) break;
  }
  if (!recipe) return null;

  const meta = metaTags(html);
  const rawIngredients = list(recipe['recipeIngredient'] ?? recipe['ingredients']).map((l) => decodeEntities(l));
  const ingredients: Ingredient[] = [];
  let section: string | null = null;
  for (const line of rawIngredients) {
    const head = sectionHeading(line);
    if (head) { section = head; continue; }
    ingredients.push(parseIngredient(line, section));
  }

  const title = text(recipe['name']) || meta.get('og:title') || '';
  const yieldText = recipe['recipeYield'];
  const tags = [...new Set([...list(recipe['recipeCategory']), ...list(recipe['recipeCuisine']), ...list(recipe['keywords'])].map((t) => t.toLowerCase()))].slice(0, 12);

  return {
    title: title.trim(),
    description: text(recipe['description']) || meta.get('og:description') || '',
    imageUrl: absolute(image(recipe['image']) ?? meta.get('og:image') ?? null, pageUrl),
    sourceUrl: pageUrl,
    sourceName: meta.get('og:site_name') || (isObj(recipe['publisher']) ? text(recipe['publisher']['name']) : '') || hostOf(pageUrl),
    servings: parseServings(yieldText),
    prepMinutes: parseMinutes(recipe['prepTime']),
    cookMinutes: parseMinutes(recipe['cookTime']),
    totalMinutes: parseMinutes(recipe['totalTime']),
    ingredients,
    steps: cleanSteps(steps(recipe['recipeInstructions'])),
    tags,
    notes: '',
  };
}

function hostOf(u: string): string | null { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } }
function absolute(u: string | null, base: string): string | null { if (!u) return null; try { return new URL(u, base).toString(); } catch { return null; } }
