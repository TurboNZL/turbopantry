import type { DuplicateReason, RecipeGroup, Health, ImportDraft, ImportError, Item, ListEntry, Store, Recipe, RecipeInput, RecipeSummary, ServerUpdate, Status } from '@turbopantry/shared';

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
    // a 200 that is not JSON is not our server (a Cloudflare Access sign-in page, a captive portal, an old proxy): never hand a null to the screens
    if (data === null) throw new ApiError(res.status, 'That address did not answer like a TurboPantry server. If it sits behind Cloudflare Access, add the service token in Settings → Server.', 'not-json');
    return data as T;
  }

  health() { return this.call<Health>('GET', '/api/health', undefined, false); }
  status() { return this.call<Status>('GET', '/api/status'); }
  listRecipes(q = '', group?: number | null) { const p = new URLSearchParams(); if (q) p.set('q', q); if (group) p.set('group', String(group)); return this.call<RecipeSummary[]>('GET', `/api/recipes${p.size ? `?${p}` : ''}`); }
  listRecipeGroups() { return this.call<RecipeGroup[]>('GET', '/api/recipe-groups'); }
  createRecipeGroup(name: string) { return this.call<RecipeGroup>('POST', '/api/recipe-groups', { name }); }
  renameRecipeGroup(id: number, name: string) { return this.call<RecipeGroup>('PUT', `/api/recipe-groups/${id}`, { name }); }
  deleteRecipeGroup(id: number) { return this.call<{ ok: true }>('DELETE', `/api/recipe-groups/${id}`); }
  setRecipeGroups(recipeId: number, groupIds: number[]) { return this.call<{ groupIds: number[] }>('PUT', `/api/recipes/${recipeId}/groups`, { groupIds }); }
  getRecipe(id: number) { return this.call<Recipe>('GET', `/api/recipes/${id}`); }
  createRecipe(r: RecipeInput) { return this.call<Recipe>('POST', '/api/recipes', r); }
  updateRecipe(id: number, r: RecipeInput) { return this.call<Recipe>('PUT', `/api/recipes/${id}`, r); }
  deleteRecipe(id: number) { return this.call<{ ok: true }>('DELETE', `/api/recipes/${id}`); }
  updateInfo() { return this.call<ServerUpdate>('GET', '/api/admin/update'); }
  startUpdate() { return this.call<{ ok: true }>('POST', '/api/admin/update'); }
  // ---- pantry, stock and the shopping list
  listItems() { return this.call<Item[]>('GET', '/api/items'); }
  createItem(body: Partial<Item> & { fromRecipe?: boolean }) { return this.call<Item & { existed: boolean }>('POST', '/api/items', body); }
  updateItem(id: number, body: Partial<Item> & { addAlias?: string }) { return this.call<Item>('PUT', `/api/items/${id}`, body); }
  duplicateItems() { return this.call<{ a: Item; b: Item; reason: DuplicateReason }[]>('GET', '/api/items/duplicates'); }
  dismissDuplicate(a: number, b: number) { return this.call<{ ok: true }>('POST', '/api/items/duplicates/dismiss', { a, b }); }
  mergeItems(from: number, into: number) { return this.call<Item>('POST', `/api/items/${from}/merge`, { into }); }
  deleteItem(id: number) { return this.call<{ ok: true }>('DELETE', `/api/items/${id}`); }
  adjustStock(changes: { itemId: number; delta: number }[], reason = 'manual', recipeId?: number) { return this.call<{ items: Item[]; applied: { itemId: number; delta: number }[] }>('POST', '/api/stock/adjust', { changes, reason, recipeId }); }
  listEntries() { return this.call<ListEntry[]>('GET', '/api/list'); }
  addToList(body: { itemId?: number; name?: string; qty?: number | null; unit?: string | null; note?: string; stock?: 'more' | 'out' | 'keep' }) { return this.call<ListEntry>('POST', '/api/list', body); }
  updateEntry(id: number, patch: { qty?: number | null; note?: string; checked?: boolean }) { return this.call<{ entry: ListEntry; stock: { itemId: number; delta: number } | null }>('PUT', `/api/list/${id}`, patch); }
  deleteEntry(id: number) { return this.call<{ ok: true }>('DELETE', `/api/list/${id}`); }
  clearChecked() { return this.call<{ removed: number }>('POST', '/api/list/clear-checked'); }
  addFromRecipe(recipeId: number, servings?: number | null, only?: number[], factor?: number) { return this.call<{ added: ListEntry[]; skipped: { name: string; reason: string }[]; checkStock: string[] }>('POST', '/api/list/from-recipe', { recipeId, servings, only, factor }); }
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
  // ---- floor plans for the faux-3D views (kitchen, or one per shop)
  getLayout(kind: 'pantry' | 'store', storeId?: number | null) { return this.call<import('@turbopantry/shared').Layout>('GET', kind === 'pantry' ? '/api/layouts/pantry' : `/api/layouts/store/${storeId}`); }
  putLayout(kind: 'pantry' | 'store', storeId: number | null | undefined, layout: import('@turbopantry/shared').Layout) { return this.call<import('@turbopantry/shared').Layout>('PUT', kind === 'pantry' ? '/api/layouts/pantry' : `/api/layouts/store/${storeId}`, layout); }
  // ---- the owner's dummy Instagram login (errors arrive as ApiError with a code such as 'bad-password')
  instagramStatus() { return this.call<{ loggedIn: boolean; username?: string; since?: string }>('GET', '/api/admin/instagram'); }
  instagramLogin(username: string, password: string) { return this.call<{ ok: true; username: string } | { needsCode: true; kind: 'sms' | 'app' }>('POST', '/api/admin/instagram/login', { username, password }); }
  instagramCode(code: string) { return this.call<{ ok: true; username: string }>('POST', '/api/admin/instagram/login/code', { code }); }
  instagramLogout() { return this.call<{ ok: true }>('POST', '/api/admin/instagram/logout', {}); }
  // ---- the live login window (Instagram's own page, shown as JPEG frames; plain requests only, no WebSocket)
  instagramLiveStart(view: { width: number; height: number; dpr: number }) { return this.call<{ id: string; w: number; h: number }>('POST', '/api/admin/instagram/live', view); }
  instagramLiveStatus(id: string) { return this.call<InstagramLiveStatus>('GET', `/api/admin/instagram/live/status?id=${encodeURIComponent(id)}`); }
  instagramLiveInput(id: string, events: InstagramLiveEvent[]) { return this.call<{ ok: true }>('POST', '/api/admin/instagram/live/input', { id, events }); }
  instagramLiveCancel(id: string) { return this.call<InstagramLiveStatus>('POST', '/api/admin/instagram/live/cancel', { id }); }
  /** The newest frame when it differs from `since` (waits on the server up to waitMs for a change). image: null = nothing new; closed = the window ended (ask the status). */
  async instagramLiveFrame(id: string, since: number, waitMs: number, signal?: AbortSignal): Promise<{ seq: number; image: Blob | null; closed: boolean }> {
    const headers: Record<string, string> = { ...accessHeaders(this.cfg) };
    if (this.cfg.token) headers.authorization = `Bearer ${this.cfg.token}`;
    const res = await fetch(`${this.cfg.serverUrl.replace(/\/+$/, '')}/api/admin/instagram/live/frame?id=${encodeURIComponent(id)}&since=${since}&wait=${waitMs}`, { headers, signal, cache: 'no-store' });
    if (res.status === 410) return { seq: since, image: null, closed: true };
    if (res.status === 204) return { seq: Number(res.headers.get('x-frame-seq') ?? since), image: null, closed: false };
    if (!res.ok) { const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null; throw new ApiError(res.status, data?.error ?? `Server said ${res.status}`, data?.code); }
    return { seq: Number(res.headers.get('x-frame-seq') ?? since), image: await res.blob(), closed: false };
  }
}

export type InstagramLiveEvent = { type: 'tap'; x: number; y: number } | { type: 'wheel'; x: number; y: number; dx?: number; dy: number } | { type: 'key'; key: string } | { type: 'text'; text: string };
export interface InstagramLiveStatus { id: string; state: 'open' | 'logged-in' | 'closed'; w: number; h: number; seq: number; reason?: string; username?: string; message: string; secondsLeft: number; seen?: string; notice?: string }
