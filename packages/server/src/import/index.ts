import type { ImportDraft, ImportError } from '@turbopantry/shared';
import { FetchError, safeFetchPage, type PageFetcher } from './safeFetch.ts';
import { extractFromJsonLd } from './jsonld.ts';
import type { PageRenderer } from './browser.ts';
import { isOstaRecipeUrl, isOstaUrl, OSTA_READY_TEXT, parseOstaPage } from './osta.ts';

export type ImportResult = ImportDraft | ImportError;

export interface Importers { fetchPage?: PageFetcher; /** renders JavaScript-only pages (Osta); absent = those links say they are unsupported */ render?: PageRenderer }

const host = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };

/**
 * Turns a link into a recipe DRAFT (nothing is saved here; the user reviews it first). Sources are tried by address:
 *   ostarecipes.com   rendered in a headless browser, then read by osta.ts (ingredients only: the page has no method)
 *   instagram.com     not built yet (needs the caption and comments; see CLAUDE.md)
 *   websites          schema.org Recipe JSON-LD (most recipe sites)
 */
export async function importFromUrl(url: string, { fetchPage = safeFetchPage, render }: Importers = {}): Promise<ImportResult> {
  const h = host(url);
  if (h === 'instagram.com' || h.endsWith('.instagram.com')) return { code: 'unsupported', error: 'Instagram import is not built yet. For now, paste the caption into a new recipe.' };
  try {
    if (isOstaUrl(url)) {
      if (!isOstaRecipeUrl(url)) return { code: 'unsupported', error: 'That Osta link is not a recipe page. Open the recipe and copy its share link.' };
      if (!render) return { code: 'no-browser', error: 'This server cannot open Osta links.' };
      // the share link may be /s/recipes/<id> or /recipes/<id>: try what was pasted, then the other form
      const alt = url.includes('/s/recipes/') ? url.replace('/s/recipes/', '/recipes/') : url.replace('/recipes/', '/s/recipes/');
      let lastError: ImportError | null = null;
      for (const candidate of [url, alt]) {
        try {
          const page = await render(candidate, { readyText: OSTA_READY_TEXT });
          const draft = parseOstaPage(page.html, url);
          if (draft) return draft;
          lastError = { code: 'no-recipe', error: 'Osta did not show a recipe at that link. It may be private or deleted.' };
        } catch (e) {
          if (e instanceof FetchError && e.code !== 'no-browser') { lastError = { code: e.code, error: e.message }; continue; }
          throw e;
        }
      }
      return lastError ?? { code: 'no-recipe', error: 'Osta did not show a recipe at that link.' };
    }
    const page = await fetchPage(url);
    const recipe = extractFromJsonLd(page.html, page.url);
    if (!recipe || (!recipe.title && !recipe.ingredients.length)) {
      return { code: 'no-recipe', error: 'No recipe was found on that page. Some sites hide it from automated readers; you can paste the recipe into a new one instead.' };
    }
    return { recipe, warnings: recipe.steps.length ? [] : ['No method was found on that page; add the steps yourself.'] };
  } catch (e) {
    if (e instanceof FetchError) return { code: e.code, error: e.message };
    throw e;
  }
}
