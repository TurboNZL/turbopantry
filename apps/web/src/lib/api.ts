import type { Health, ImportError, Recipe, RecipeInput, RecipeSummary, Status } from '@turbopantry/shared';

export interface ApiConfig { serverUrl: string; token: string }

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

/** Talks to the TurboPantry server: the one that served the page (serverUrl '') or another one (the Android app). */
export class Api {
  constructor(private cfg: ApiConfig) {}

  private async call<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const base = this.cfg.serverUrl.replace(/\/+$/, '');
    const headers: Record<string, string> = {};
    if (auth && this.cfg.token) headers.authorization = `Bearer ${this.cfg.token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = (await res.json().catch(() => null)) as (T & Partial<ImportError>) | null;
    if (!res.ok) throw new ApiError(res.status, res.status === 401 ? 'Wrong token' : data?.error ?? `Server said ${res.status}`, data?.code);
    return data as T;
  }

  health() { return this.call<Health>('GET', '/api/health', undefined, false); }
  status() { return this.call<Status>('GET', '/api/status'); }
  listRecipes(q = '') { return this.call<RecipeSummary[]>('GET', `/api/recipes${q ? `?q=${encodeURIComponent(q)}` : ''}`); }
  getRecipe(id: number) { return this.call<Recipe>('GET', `/api/recipes/${id}`); }
  createRecipe(r: RecipeInput) { return this.call<Recipe>('POST', '/api/recipes', r); }
  updateRecipe(id: number, r: RecipeInput) { return this.call<Recipe>('PUT', `/api/recipes/${id}`, r); }
  deleteRecipe(id: number) { return this.call<{ ok: true }>('DELETE', `/api/recipes/${id}`); }
  importUrl(url: string) { return this.call<{ recipe: RecipeInput }>('POST', '/api/import', { url }); }
}
