import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app.ts';
import { addUser, openDb } from '../src/db.ts';

let server: Server, base: string, token: string;
beforeAll(async () => {
  const db = openDb(':memory:'); token = addUser(db, 'Alex');
  server = createApp({ db });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
const call = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
};
const recipe = (title: string, servings: number | null, lines: string[] = []) => ({ title, description: '', imageUrl: null, sourceUrl: null, sourceName: null, servings, prepMinutes: null, cookMinutes: null, totalMinutes: null, steps: [], tags: [], notes: '',
  ingredients: lines.map((raw) => ({ raw, quantity: Number(raw.split(' ')[0]) || null, quantityMax: null, unit: null, name: raw.split(' ').slice(1).join(' '), note: null, section: null })) });

describe('recipe groups', () => {
  it('makes groups, puts recipes in several, filters by group, renames and deletes', async () => {
    const a = (await call('POST', '/api/recipes', recipe('Pancakes', 4))).body, b = (await call('POST', '/api/recipes', recipe('Stew', 6))).body;
    const g1 = (await call('POST', '/api/recipe-groups', { name: 'Weeknight' })).body, g2 = (await call('POST', '/api/recipe-groups', { name: 'Kids' })).body;
    expect((await call('POST', '/api/recipe-groups', { name: 'weeknight' })).status).toBe(409);
    expect((await call('POST', '/api/recipe-groups', { name: ' ' })).status).toBe(400);
    expect((await call('PUT', `/api/recipes/${a.id}/groups`, { groupIds: [g1.id, g2.id, 999] })).body.groupIds).toEqual([g1.id, g2.id]); // unknown ids are ignored
    await call('PUT', `/api/recipes/${b.id}/groups`, { groupIds: [g1.id] });
    expect(((await call('GET', `/api/recipes?group=${g2.id}`)).body as any[]).map((r) => r.title)).toEqual(['Pancakes']);
    expect(((await call('GET', `/api/recipes?group=${g1.id}`)).body as any[]).map((r) => r.title).sort()).toEqual(['Pancakes', 'Stew']);
    expect(((await call('GET', '/api/recipes')).body as any[]).find((r) => r.title === 'Stew').groupIds).toEqual([g1.id]);
    expect((await call('GET', `/api/recipes/${a.id}`)).body.groupIds).toEqual([g1.id, g2.id]);
    expect(((await call('GET', '/api/recipe-groups')).body as any[]).find((g) => g.id === g1.id).count).toBe(2);
    expect((await call('PUT', `/api/recipe-groups/${g2.id}`, { name: 'Lunchbox' })).body.name).toBe('Lunchbox');
    await call('DELETE', `/api/recipe-groups/${g2.id}`);
    expect((await call('GET', `/api/recipes/${a.id}`)).body.groupIds).toEqual([g1.id]);
    await call('DELETE', `/api/recipes/${b.id}`);
    expect(((await call('GET', '/api/recipe-groups')).body as any[]).find((g) => g.id === g1.id).count).toBe(1);
  });
});

describe('items from recipes', () => {
  it('linked new items are in the pantry at none and count as "only in a recipe" until stocked', async () => {
    const it = (await call('POST', '/api/items', { name: 'Fettuccine pasta', fromRecipe: true, unit: 'g' })).body;
    expect(it).toMatchObject({ tracked: true, qty: 0, recipeOnly: true });
    await call('POST', '/api/stock/adjust', { changes: [{ itemId: it.id, delta: 500 }] });
    expect(((await call('GET', '/api/items')).body as any[]).find((i) => i.id === it.id)).toMatchObject({ qty: 500, recipeOnly: false });
    await call('POST', '/api/stock/adjust', { changes: [{ itemId: it.id, delta: -500 }], reason: 'out' });
    expect(((await call('GET', '/api/items')).body as any[]).find((i) => i.id === it.id)).toMatchObject({ qty: 0, recipeOnly: false }); // it has been stocked: out, not recipe-only
  });
  it('a recipe without servings scales by a factor when adding to the list', async () => {
    await call('POST', '/api/items', { name: 'Plain flour', unit: 'g', qty: 0 });
    const r = (await call('POST', '/api/recipes', { ...recipe('Bread', null), ingredients: [{ raw: '100 g plain flour', quantity: 100, quantityMax: null, unit: 'g', name: 'plain flour', note: null, section: null }] })).body;
    const res = await call('POST', '/api/list/from-recipe', { recipeId: r.id, factor: 3 });
    expect(res.body.added[0]).toMatchObject({ qty: 300, unit: 'g' });
  });
});
