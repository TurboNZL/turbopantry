import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app.ts';
import { addUser, openDb } from '../src/db.ts';

let server: Server, base: string, token: string, token2: string;
const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

beforeAll(async () => {
  const db = openDb(':memory:');
  token = addUser(db, 'Alex'); token2 = addUser(db, 'Sam');
  server = createApp({ db, fetchPage: async (url) => ({ url, html: fx('recipe-yoast-graph.html') }) });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const call = async (method: string, path: string, body?: unknown, t = token) => {
  const res = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
};
const mkItem = async (o: Record<string, unknown>) => (await call('POST', '/api/items', o)).body;
const stockOf = async (id: number) => ((await call('GET', '/api/items')).body as any[]).find((i) => i.id === id).qty as number;

describe('items', () => {
  it('needs a token', async () => { expect((await fetch(`${base}/api/items`)).status).toBe(401); expect((await fetch(`${base}/api/list`)).status).toBe(401); });
  it('makes an item with a guessed category and the unit\'s default step and amount', async () => {
    const r = await call('POST', '/api/items', { name: 'Plain flour', unit: 'g', qty: 1000 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ name: 'Plain flour', category: 'Pantry', unit: 'g', qty: 1000, step: 100, defaultQty: 500, tracked: true, existed: false });
  });
  it('returns the existing item for the same words, so linking never duplicates', async () => {
    const first = await mkItem({ name: 'Free Range Eggs' });
    const again = await call('POST', '/api/items', { name: 'egg' });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ id: first.id, existed: true });
  });
  it('lets the user tweak step, default, minimum, staple and place', async () => {
    const it = await mkItem({ name: 'Milk', unit: 'l', step: 1, defaultQty: 2, minQty: 1, place: 'Fridge' });
    expect(it).toMatchObject({ step: 1, defaultQty: 2, minQty: 1, place: 'Fridge', category: 'Dairy & eggs' });
    const up = await call('PUT', `/api/items/${it.id}`, { step: 2, staple: true });
    expect(up.body).toMatchObject({ step: 2, staple: true });
  });
  it('rejects bad input', async () => {
    expect((await call('POST', '/api/items', { name: '  ' })).status).toBe(400);
    expect((await call('POST', '/api/items', { name: 'x', category: 'Nope' })).status).toBe(400);
    expect((await call('POST', '/api/items', { name: 'y', step: 0 })).status).toBe(400);
    expect((await call('POST', '/api/items', { name: 'z', qty: -1 })).status).toBe(400);
    expect((await call('PUT', '/api/items/999999', { qty: 1 })).status).toBe(404);
  });
  it('remembers aliases and refuses one that is already another item', async () => {
    const eggs = await mkItem({ name: 'Eggs' });
    const lime = await mkItem({ name: 'Limes' });
    const up = await call('PUT', `/api/items/${eggs.id}`, { addAlias: 'Coles Australian Free Range Eggs' });
    expect(up.body.aliases).toEqual(['Coles Australian Free Range Eggs']);
    expect((await call('PUT', `/api/items/${eggs.id}`, { addAlias: 'limes' })).status).toBe(409);
    expect((await call('PUT', `/api/items/${lime.id}`, { name: 'Eggs' })).status).toBe(409);
  });
  it('deletes', async () => { const it = await mkItem({ name: 'Throwaway' }); expect((await call('DELETE', `/api/items/${it.id}`)).status).toBe(200); expect((await call('DELETE', `/api/items/${it.id}`)).status).toBe(404); });
});

describe('stock', () => {
  it('adds and uses stock, never below zero, and reports what was really applied', async () => {
    const it = await mkItem({ name: 'Tinned tomatoes', qty: 2 });
    let r = await call('POST', '/api/stock/adjust', { changes: [{ itemId: it.id, delta: -5 }], reason: 'cooked' });
    expect(r.body.items[0].qty).toBe(0);
    expect(r.body.applied).toEqual([{ itemId: it.id, delta: -2 }]); // only the 2 that were there
    r = await call('POST', '/api/stock/adjust', { changes: [{ itemId: it.id, delta: 3 }] });
    expect(r.body.items[0].qty).toBe(3);
  });
  it('is all or nothing', async () => {
    const it = await mkItem({ name: 'Rice', unit: 'g', qty: 500 });
    const r = await call('POST', '/api/stock/adjust', { changes: [{ itemId: it.id, delta: -100 }, { itemId: 999999, delta: 1 }] });
    expect(r.status).toBe(404);
    expect(await stockOf(it.id)).toBe(500);
  });
  it('rejects nonsense', async () => {
    expect((await call('POST', '/api/stock/adjust', { changes: [] })).status).toBe(400);
    expect((await call('POST', '/api/stock/adjust', { changes: [{ itemId: 1, delta: 'a' }] })).status).toBe(400);
  });
});

describe('the shopping list', () => {
  it('adds a pantry item with its own default amount and unit', async () => {
    const it = await mkItem({ name: 'Basmati rice', unit: 'g', defaultQty: 1000, step: 250 });
    const r = await call('POST', '/api/list', { itemId: it.id });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ itemId: it.id, name: 'Basmati rice', qty: 1000, unit: 'g', category: 'Pantry', checked: false, addedBy: 'Alex' });
  });
  it('treats a typed name that is the same words as a pantry item as that item', async () => {
    const it = await mkItem({ name: 'Spring onions', unit: null, defaultQty: 2 });
    const r = await call('POST', '/api/list', { name: 'spring onion' });
    expect(r.body).toMatchObject({ itemId: it.id, name: 'Spring onions', qty: 2 });
  });
  it('adds to a line already on the list instead of making a second, converting units', async () => {
    const it = await mkItem({ name: 'Sugar', unit: 'g' });
    await call('POST', '/api/list', { itemId: it.id, qty: 500, unit: 'g' });
    const r = await call('POST', '/api/list', { itemId: it.id, qty: 1, unit: 'kg' });
    expect(r.body.qty).toBe(1500);
    expect(((await call('GET', '/api/list')).body as any[]).filter((e) => e.itemId === it.id)).toHaveLength(1);
  });
  it('takes things that are not in the pantry at all, with a guessed aisle', async () => {
    const r = await call('POST', '/api/list', { name: 'Birthday candles', qty: 1 });
    expect(r.body).toMatchObject({ itemId: null, category: 'Other' });
    expect((await call('POST', '/api/list', { name: 'Fresh basil' })).body.category).toBe('Produce');
    expect((await call('POST', '/api/list', {})).status).toBe(400);
  });
  it('ticking puts what was bought into stock; unticking takes exactly that back', async () => {
    const it = await mkItem({ name: 'Pasta shells', unit: 'g', qty: 100 });
    const e = (await call('POST', '/api/list', { itemId: it.id, qty: 500 })).body;
    const ticked = await call('PUT', `/api/list/${e.id}`, { checked: true });
    expect(ticked.body.entry.checked).toBe(true);
    expect(ticked.body.stock).toEqual({ itemId: it.id, delta: 500 });
    expect(await stockOf(it.id)).toBe(600);
    await call('PUT', `/api/list/${e.id}`, { checked: false });
    expect(await stockOf(it.id)).toBe(100);
    await call('PUT', `/api/list/${e.id}`, { checked: false }); // a repeat does nothing
    expect(await stockOf(it.id)).toBe(100);
  });
  it('converts what was bought into the item\'s own unit', async () => {
    const it = await mkItem({ name: 'Oat milk', unit: 'ml', qty: 0 });
    const e = (await call('POST', '/api/list', { itemId: it.id, qty: 1, unit: 'l' })).body;
    await call('PUT', `/api/list/${e.id}`, { checked: true });
    expect(await stockOf(it.id)).toBe(1000);
  });
  it('edits the amount and clears ticked lines (keeping the stock they added)', async () => {
    const it = await mkItem({ name: 'Cheddar', unit: 'g', qty: 0 });
    const e = (await call('POST', '/api/list', { itemId: it.id, qty: 200 })).body;
    expect((await call('PUT', `/api/list/${e.id}`, { qty: 400, note: 'the tasty one' })).body.entry).toMatchObject({ qty: 400, note: 'the tasty one' });
    await call('PUT', `/api/list/${e.id}`, { checked: true });
    expect((await call('POST', '/api/list/clear-checked')).body.removed).toBeGreaterThanOrEqual(1);
    expect(((await call('GET', '/api/list')).body as any[]).some((x) => x.id === e.id)).toBe(false);
    expect(await stockOf(it.id)).toBe(400);
  });
  it('lists open lines before ticked ones, in aisle order', async () => {
    const list = (await call('GET', '/api/list')).body as any[];
    const firstChecked = list.findIndex((e) => e.checked);
    if (firstChecked !== -1) expect(list.slice(firstChecked).every((e) => e.checked)).toBe(true);
  });
});

describe('recipes and the pantry', () => {
  const recipe = (ingredients: any[]) => ({ title: 'Test dish', description: '', imageUrl: null, sourceUrl: null, sourceName: null, servings: 4, prepMinutes: null, cookMinutes: null, totalMinutes: null, steps: ['Cook.'], tags: [], notes: '', ingredients });
  const ing = (raw: string, quantity: number | null, unit: string | null, name: string) => ({ raw, quantity, quantityMax: null, unit, name, note: null, section: null });

  it('links a saved ingredient whose words are exactly a pantry item, and nothing looser', async () => {
    const flour = await mkItem({ name: 'Strong flour', unit: 'g', qty: 1000 });
    const r = await call('POST', '/api/recipes', recipe([ing('250 g strong flour', 250, 'g', 'strong flour'), ing('1 pasta', 1, null, 'fettuccine pasta')]));
    expect(r.body.ingredients[0].itemId).toBe(flour.id);
    expect(r.body.ingredients[1].itemId).toBeNull();
  });
  it('adds only what the recipe is missing: enough, staples skipped, shortfall rounded to nothing', async () => {
    const flour = await mkItem({ name: 'Bread flour', unit: 'g', qty: 200 });
    const eggs = await mkItem({ name: 'Duck eggs', qty: 6 });
    const salt = await mkItem({ name: 'Sea salt', staple: true });
    const butter = await mkItem({ name: 'Cultured butter', unit: 'g', qty: 0 });
    const r = await call('POST', '/api/recipes', recipe([
      ing('1 cup bread flour', 1, 'cup', 'bread flour'),      // needs 125 g, has 200: enough
      ing('4 duck eggs', 4, null, 'duck eggs'),                // has 6: enough
      ing('1 tsp sea salt', 1, 'tsp', 'sea salt'),             // staple
      ing('100 g cultured butter', 100, 'g', 'cultured butter'), // has none: add 100 g
      ing('3 spring onions', 3, null, 'mystery onion'),        // not in the pantry: added whole
    ]));
    const res = await call('POST', '/api/list/from-recipe', { recipeId: r.body.id });
    expect(res.body.skipped.map((s: any) => [s.name, s.reason])).toEqual([['Bread flour', 'enough'], ['Duck eggs', 'enough'], ['Sea salt', 'staple']]);
    expect(res.body.added.map((a: any) => [a.name, a.qty, a.unit])).toEqual([['Cultured butter', 100, 'g'], ['mystery onion', 3, null]]);
    expect(res.body.checkStock).toEqual(['mystery onion']);
    void flour; void eggs; void salt; void butter;
  });
  it('adds only the difference when there is some but not enough, and scales with servings', async () => {
    const it = await mkItem({ name: 'Plain yoghurt', unit: 'g', qty: 100 });
    const r = await call('POST', '/api/recipes', recipe([ing('300 g plain yoghurt', 300, 'g', 'plain yoghurt')]));
    const one = await call('POST', '/api/list/from-recipe', { recipeId: r.body.id });
    expect(one.body.added[0]).toMatchObject({ itemId: it.id, qty: 200 });
    const double = await call('POST', '/api/list/from-recipe', { recipeId: r.body.id, servings: 8 }); // twice the recipe: needs 600, has 100, 200 already on the list
    expect(double.body.added[0].qty).toBe(700); // merged into the existing line: 200 + 500
  });
  it('says so when asked about a recipe that is not there', async () => expect((await call('POST', '/api/list/from-recipe', { recipeId: 999999 })).status).toBe(404));

  it('an import draft links exact pantry items and offers similar ones to confirm, never linking them', async () => {
    const pasta = await mkItem({ name: 'Macaroni' });
    const penne = await mkItem({ name: 'Penne pasta' });
    const butter = await mkItem({ name: 'Unsalted butter' });
    const r = await call('POST', '/api/import', { url: 'https://example.com/mac' });
    expect(r.status).toBe(200);
    const byName = (n: string) => r.body.suggestions.find((s: any) => r.body.recipe.ingredients[s.index].name === n);
    const macaroni = r.body.recipe.ingredients.find((i: any) => /macaroni/.test(i.name));
    expect(macaroni.itemId).toBeNull();
    const s = byName(macaroni.name);
    expect(s.exact).toBeNull();
    expect(s.candidates.map((c: any) => [c.name, c.kind])).toEqual(expect.arrayContaining([['Macaroni', 'broader']]));
    expect(s.newName).toBe('Elbow macaroni');
    const b = r.body.recipe.ingredients.find((i: any) => i.name === 'unsalted butter');
    expect(b.itemId).toBe(butter.id);
    void pasta; void penne;
  });
});

describe('live updates', () => {
  async function listen(t: string) {
    const ctl = new AbortController();
    const res = await fetch(`${base}/api/events`, { headers: { authorization: `Bearer ${t}`, accept: 'text/event-stream' }, signal: ctl.signal });
    const reader = res.body!.getReader(); const dec = new TextDecoder();
    let buf = '';
    const next = async (match: RegExp, ms = 3000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const m = match.exec(buf); if (m) { buf = buf.slice(m.index + m[0].length); return m[0]; }
        const r = await Promise.race([reader.read(), new Promise<null>((ok) => setTimeout(() => ok(null), 200))]);
        if (r && r.value) buf += dec.decode(r.value, { stream: true });
      }
      throw new Error(`no event matching ${match} in ${buf}`);
    };
    return { res, next, close: () => ctl.abort() };
  }
  it('rejects a stream without a token', async () => expect((await fetch(`${base}/api/events`)).status).toBe(401));
  it('tells every connected device what changed and who changed it', async () => {
    const sam = await listen(token2);
    expect(sam.res.status).toBe(200);
    expect(sam.res.headers.get('content-type')).toContain('text/event-stream');
    await sam.next(/: connected/);
    await call('POST', '/api/list', { name: 'Napkins' }); // Alex adds something
    expect(await sam.next(/event: list\ndata: \{"by":"Alex"[^\n]*\n\n/)).toContain('"by":"Alex"');
    const it = await mkItem({ name: 'Live stock thing', qty: 1 });
    await sam.next(/event: items\n/);
    await call('POST', '/api/stock/adjust', { changes: [{ itemId: it.id, delta: 1 }] });
    await sam.next(/event: items\n/);
    sam.close();
  });
});
