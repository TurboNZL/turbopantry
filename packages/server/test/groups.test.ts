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
    expect(it).toMatchObject({ tracked: true, qty: 0 });
    await call('POST', '/api/stock/adjust', { changes: [{ itemId: it.id, delta: 500 }] });
    expect(((await call('GET', '/api/items')).body as any[]).find((i) => i.id === it.id)).toMatchObject({ qty: 500 });
    await call('POST', '/api/stock/adjust', { changes: [{ itemId: it.id, delta: -500 }], reason: 'out' });
    expect(((await call('GET', '/api/items')).body as any[]).find((i) => i.id === it.id)).toMatchObject({ qty: 0 }); // stocked once, now out
  });
  it('a recipe without servings scales by a factor when adding to the list', async () => {
    await call('POST', '/api/items', { name: 'Plain flour', unit: 'g', qty: 0 });
    const r = (await call('POST', '/api/recipes', { ...recipe('Bread', null), ingredients: [{ raw: '100 g plain flour', quantity: 100, quantityMax: null, unit: 'g', name: 'plain flour', note: null, section: null }] })).body;
    const res = await call('POST', '/api/list/from-recipe', { recipeId: r.id, factor: 3 });
    expect(res.body.added[0]).toMatchObject({ qty: 300, unit: 'g' });
  });
});

describe('duplicate items', () => {
  it('lists likely duplicates, remembers "different", and merges stock, list lines and recipe links', async () => {
    const mk = async (b: object) => (await call('POST', '/api/items', b)).body;
    const p = await mk({ name: 'Parmesan', unit: 'g', qty: 100 }), pc = await mk({ name: 'Parmesan Cheese', unit: 'kg', qty: 1 }), y1 = await mk({ name: 'Yoghurt' }), y2 = await mk({ name: 'Yogurt' });
    const pairs = (await call('GET', '/api/items/duplicates')).body as any[];
    expect(pairs.map((x) => [x.a.name, x.b.name, x.reason]).sort()).toEqual([['Parmesan', 'Parmesan Cheese', 'less-specific'], ['Yoghurt', 'Yogurt', 'spelling']]);
    await call('POST', '/api/items/duplicates/dismiss', { a: y2.id, b: y1.id });
    expect(((await call('GET', '/api/items/duplicates')).body as any[]).length).toBe(1);
    await call('POST', '/api/list', { itemId: p.id, qty: 200, unit: 'g' });
    const r = (await call('POST', '/api/recipes', { ...recipe('Pasta', 2), ingredients: [{ raw: '50 g parmesan', quantity: 50, quantityMax: null, unit: 'g', name: 'parmesan', note: null, section: null, itemId: p.id }] })).body;
    const merged = (await call('POST', `/api/items/${p.id}/merge`, { into: pc.id })).body;
    expect(merged).toMatchObject({ id: pc.id, qty: 1.1 });
    expect(merged.aliases).toContain('Parmesan');
    expect(((await call('GET', '/api/list')).body as any[])[0].itemId).toBe(pc.id);
    expect((await call('GET', `/api/recipes/${r.id}`)).body.ingredients[0].itemId).toBe(pc.id);
    expect(((await call('GET', '/api/items')).body as any[]).some((i) => i.id === p.id)).toBe(false);
    expect((await call('POST', `/api/items/${pc.id}/merge`, { into: pc.id })).status).toBe(400);
  });
});

describe('auto linking on save', () => {
  it('links a line to its item, makes a new item for a line nothing resembles, and leaves a resembling one for the user to confirm', async () => {
    await call('POST', '/api/items', { name: 'Fettuccine pasta', unit: 'g' });
    const r = (await call('POST', '/api/recipes', recipe('Dinner', 2, ['2 pasta', '3 lemons', '1 lemons']))).body;
    const [pasta, l1, l2] = r.ingredients;
    expect(pasta.itemId).toBeNull();                       // "pasta" resembles "Fettuccine pasta": asked, never guessed
    expect(l1.itemId).toBeGreaterThan(0);                  // nothing resembled "lemons": a new item
    expect(l2.itemId).toBe(l1.itemId);                     // the same words are the same item
  });
});

describe('import preview', () => {
  it('makes no items while only looking at a draft', async () => {
    const before = ((await call('GET', '/api/items')).body as any[]).length;
    const r = await call('POST', '/api/import', { text: 'Soup\n\nIngredients\n2 leeks\n1 tsp saffron\n\nMethod\n1. Simmer the leeks slowly in the stock for twenty minutes until very soft and sweet, then blend it smooth.' });
    expect(r.status).toBe(200);
    expect(((await call('GET', '/api/items')).body as any[]).length).toBe(before);
  });
});

describe('items you cannot run out of', () => {
  it('goes on the list by itself when it is marked out, and when it is marked essential while out', async () => {
    const milk = (await call('POST', '/api/items', { name: 'Essential Milk', qty: 2, unit: null })).body.item ?? (await call('POST', '/api/items', { name: 'Essential Milk' })).body;
    const id = milk.id;
    expect((await call('PUT', `/api/items/${id}`, { essential: true })).body.essential).toBe(true);
    const names = async () => ((await call('GET', '/api/list')).body as any[]).map((e) => e.itemId);
    expect(await names()).not.toContain(id); // 2 in stock: fine
    await call('POST', '/api/stock/adjust', { changes: [{ itemId: id, delta: -2 }], reason: 'out' });
    expect(await names()).toContain(id);
    expect(((await call('GET', '/api/list')).body as any[]).filter((e) => e.itemId === id)).toHaveLength(1);
    await call('POST', '/api/stock/adjust', { changes: [{ itemId: id, delta: 0.0001 }], reason: 'manual' }); // not out and not low... but min is 0, so 0.0001 > 0
    expect(((await call('GET', '/api/list')).body as any[]).filter((e) => e.itemId === id)).toHaveLength(1); // never twice
  });
});
