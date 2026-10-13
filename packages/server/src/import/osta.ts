import { parse, type HTMLElement } from 'node-html-parser';
import { parseIngredient, parseMinutes, parseServings, type Ingredient, type RecipeInput } from '@turbopantry/shared';

/**
 * Osta share pages (ostarecipes.com/recipes/<id>, also seen as /s/recipes/<id>) are a React single-page app: a plain fetch returns an empty shell, so
 * the page is rendered in a headless browser first (browser.ts) and the rendered HTML is read here. There is no JSON-LD and the class names are
 * generated (css-1abc2d), so this reads the stable MUI typography classes the app puts on its text (MuiTypography-h1 = title, -h3 = headings,
 * -subtitle3 = an ingredient line with the quantity in a span, -body2 = its note). If Osta changes its markup this is the one file to fix:
 * the fixture test/fixtures/osta-share-page.html is a real saved page.
 */
export const OSTA_READY_TEXT = 'Ingredients';

export const isOstaUrl = (u: string): boolean => { try { const h = new URL(u).hostname.toLowerCase(); return h === 'ostarecipes.com' || h.endsWith('.ostarecipes.com'); } catch { return false; } };
export const isOstaRecipeUrl = (u: string): boolean => { try { return isOstaUrl(u) && /^\/(s\/)?recipes\/[A-Za-z0-9_-]+\/?$/.test(new URL(u).pathname); } catch { return false; } };

const has = (n: HTMLElement, cls: string) => (n.getAttribute('class') ?? '').split(/\s+/).includes(cls);
const ps = (root: HTMLElement, cls: string) => root.querySelectorAll('p').filter((p) => has(p, cls));
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export interface OstaDraft { recipe: RecipeInput; warnings: string[] }

/** Reads a rendered Osta recipe page. Returns null when the page does not look like a recipe (private, deleted, still loading, markup changed). */
export function parseOstaPage(html: string, pageUrl: string): OstaDraft | null {
  const root = parse(html);
  const title = clean(ps(root, 'MuiTypography-h1')[0]?.text ?? '');
  const h3s = ps(root, 'MuiTypography-h3');
  const start = h3s.find((p) => clean(p.text).toLowerCase() === 'ingredients');
  if (!title || !start) return null;

  // everything between the "Ingredients" heading and the end of the list, in document order
  const items: Ingredient[] = [];
  let section: string | null = null;
  const all = root.querySelectorAll('p');
  for (let i = all.indexOf(start) + 1; i < all.length; i++) {
    const p = all[i]!;
    if (has(p, 'MuiTypography-h3')) { section = clean(p.text) || null; continue; }
    if (!has(p, 'MuiTypography-subtitle3')) continue;
    // a real ingredient line has a tick box beside it; "View in the Osta app" and similar do not
    const row = p.parentNode as HTMLElement | null;
    const box = row?.parentNode as HTMLElement | null;
    if (!box?.querySelector('input[type="checkbox"]')) continue;
    const qty = clean(p.querySelector('span')?.text ?? '');
    const name = clean(p.text).slice(qty.length).trim();
    if (!name && !qty) continue;
    const note = clean(row?.querySelectorAll('p').find((n) => has(n, 'MuiTypography-body2'))?.text ?? '').replace(/^\((.*)\)$/, '$1').trim();
    const line = [qty, name].filter(Boolean).join(' ') + (note ? ` (${note})` : '');
    items.push(parseIngredient(line, section));
  }
  if (!items.length) return null;

  const body1 = ps(root, 'MuiTypography-body1').map((p) => clean(p.text));
  const timeOf = (label: string) => { const t = body1.find((b) => new RegExp(`^${label}\\s*:`, 'i').test(b)); return t ? parseMinutes(t.replace(/^[^:]*:\s*/, '')) : null; };
  const prep = timeOf('prep'), cook = timeOf('cook');
  const description = body1.find((b) => b && !/^(prep|cook)\s*:/i.test(b)) ?? '';
  const servings = parseServings(ps(root, 'MuiTypography-h5').map((p) => clean(p.text)).find((t) => /^\d+(\.\d+)?\s*servings?$/i.test(t)));
  const imgs = root.querySelectorAll('img');
  const photo = imgs.find((i) => /\/o\/recipes(%2F|\/)/.test(i.getAttribute('src') ?? ''))?.getAttribute('src') ?? null;
  const creatorImg = imgs.find((i) => /\/o\/creators(%2F|\/)/.test(i.getAttribute('src') ?? ''));
  const creator = clean(((creatorImg?.parentNode?.parentNode as HTMLElement | undefined)?.querySelectorAll('p') ?? []).find((p) => has(p, 'MuiTypography-h5'))?.text ?? '');

  return {
    recipe: {
      title, description, imageUrl: photo, sourceUrl: pageUrl, sourceName: creator ? `Osta (${creator})` : 'Osta',
      servings, prepMinutes: prep, cookMinutes: cook, totalMinutes: prep !== null && cook !== null ? prep + cook : null,
      ingredients: items, steps: [], tags: [], notes: '',
    },
    warnings: ['Osta share pages show the ingredients but not the method. Add the method yourself (the original video or post is the best source).'],
  };
}
