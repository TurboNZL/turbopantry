import type { ImportError, RecipeInput } from '@turbopantry/shared';
import { FetchError, safeFetchPage, type PageFetcher } from './safeFetch.ts';
import { extractFromJsonLd } from './jsonld.ts';

export type ImportResult = { recipe: RecipeInput } | ImportError;

const host = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };

/**
 * Turns a link into a recipe DRAFT (nothing is saved here; the user reviews it first). Sources are tried by address:
 *   websites          schema.org Recipe JSON-LD (most recipe sites)
 *   instagram.com     not built yet (needs the caption and comments; see CLAUDE.md)
 *   ostarecipes.com   not built yet (a JavaScript page that needs a headless browser; see CLAUDE.md)
 */
export async function importFromUrl(url: string, fetchPage: PageFetcher = safeFetchPage): Promise<ImportResult> {
  const h = host(url);
  if (h === 'instagram.com' || h.endsWith('.instagram.com')) return { code: 'unsupported', error: 'Instagram import is not built yet. For now, paste the caption into a new recipe.' };
  if (h === 'ostarecipes.com' || h.endsWith('.ostarecipes.com')) return { code: 'unsupported', error: 'Osta links are not supported yet.' };
  try {
    const page = await fetchPage(url);
    const recipe = extractFromJsonLd(page.html, page.url);
    if (!recipe || (!recipe.title && !recipe.ingredients.length)) {
      return { code: 'no-recipe', error: 'No recipe was found on that page. Some sites hide it from automated readers; you can paste the recipe into a new one instead.' };
    }
    return { recipe };
  } catch (e) {
    if (e instanceof FetchError) return { code: e.code, error: e.message };
    throw e;
  }
}
