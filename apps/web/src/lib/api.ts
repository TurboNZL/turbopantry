import type { Health, ImportDraft, ImportError, Item, ListEntry, Store, Recipe, RecipeInput, RecipeSummary, ServerUpdate, Status } from '@turbopantry/shared';

export interface ApiConfig { serverUrl: string; token: string; cfAccessId?: string; cfAccessSecret?: string }

/** The two headers a server behind Cloudflare Access wants on every request (turboengine module cloudflare-access). */
export const accessHeaders = (s: { cfAccessId?: string; cfAccessSecret?: string }): Record<string, string> =>
  s.cfAccessId?.trim() && s.cfAccessSecret?.trim() ? { 'CF-Access-Client-Id': s.cfAccessId.trim(), 'CF-Access-Client-Secret': s.cfAccessSecret.trim() } : {};

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

/** Talks to the TurboPantry server: the one that served the page (serverUrl '') or another one (the Android app). */
export class Api {
  constructor(private cfg: ApiConfig) {}

  private async call<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const base = this.cfg.serverUrl.replace(/\/+$/, '');
    const headers: Record<string, string> = { ...accessHeaders(this.cfg) };
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
  updateInfo() { return this.call<ServerUpdate>('GET', '/api/admin/update'); }
  startUpdate() { return this.call<{ ok: true }>('POST', '/api/admin/update'); }
  // ---- pantry, stock and the shopping list
  listItems() { return this.call<Item[]>('GET', '/api/items'); }
  createItem(body: Partial<Item>) { return this.call<Item & { existed: boolean }>('POST', '/api/items', body); }
  updateItem(id: number, body: Partial<Item> & { addAlias?: string }) { return this.call<Item>('PUT', `/api/items/${id}`, body); }
  deleteItem(id: number) { return this.call<{ ok: true }>('DELETE', `/api/items/${id}`); }
  adjustStock(changes: { itemId: number; delta: number }[], reason = 'manual', recipeId?: number) { return this.call<{ items: Item[]; applied: { itemId: number; delta: number }[] }>('POST', '/api/stock/adjust', { changes, reason, recipeId }); }
  listEntries() { return this.call<ListEntry[]>('GET', '/api/list'); }
  addToList(body: { itemId?: number; name?: string; qty?: number | null; unit?: string | null; note?: string; stock?: 'more' | 'out' | 'keep' }) { return this.call<ListEntry>('POST', '/api/list', body); }
  updateEntry(id: number, patch: { qty?: number | null; note?: string; checked?: boolean }) { return this.call<{ entry: ListEntry; stock: { itemId: number; delta: number } | null }>('PUT', `/api/list/${id}`, patch); }
  deleteEntry(id: number) { return this.call<{ ok: true }>('DELETE', `/api/list/${id}`); }
  clearChecked() { return this.call<{ removed: number }>('POST', '/api/list/clear-checked'); }
  addFromRecipe(recipeId: number, servings?: number | null, only?: number[]) { return this.call<{ added: ListEntry[]; skipped: { name: string; reason: string }[]; checkStock: string[] }>('POST', '/api/list/from-recipe', { recipeId, servings, only }); }
  /** The address and headers of the live-update stream. */
  eventsRequest() { return { url: `${this.cfg.serverUrl.replace(/\/+$/, '')}/api/events`, headers: { ...(this.cfg.token ? { authorization: `Bearer ${this.cfg.token}` } : {}), ...accessHeaders(this.cfg) } as Record<string, string> }; }
  importUrl(url: string) { return this.call<ImportDraft>('POST', '/api/import', { url }); }
  /** A pasted caption (and comments) from a post, with its link if known. */
  importText(text: string, comments: string[] = [], url?: string) { return this.call<ImportDraft>('POST', '/api/import', { text, comments, url }); }
  // ---- shop layouts and paired devices
  listStores() { return this.call<Store[]>('GET', '/api/stores'); }
  createStore(name: string, order: string[] = []) { return this.call<Store>('POST', '/api/stores', { name, order }); }
  updateStore(id: number, patch: { name?: string; order?: string[] }) { return this.call<Store>('PUT', `/api/stores/${id}`, patch); }
  deleteStore(id: number) { return this.call<{ ok: true }>('DELETE', `/api/stores/${id}`); }
  listDevices() { return this.call<{ id: number; label: string; createdAt: string; lastUsed: string | null }[]>('GET', '/api/devices'); }
  /** A new token for another device of this account (shown once). */
  pairDevice(label: string) { return this.call<{ token: string }>('POST', '/api/devices', { label }); }
  revokeDevice(id: number) { return this.call<{ ok: true }>('DELETE', `/api/devices/${id}`); }
  /** Where a picture saved on the server lives (its path starts with /images/); other addresses are used as they are. */
  pictureUrl(u: string) { return u.startsWith('/images/') ? `${this.cfg.serverUrl.replace(/\/+$/, '')}${u}` : u; }
}
