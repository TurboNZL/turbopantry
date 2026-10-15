import { describe, expect, it } from 'vitest';
import { CATEGORIES, cleanItemName, fineStep, prettyStock, suggestItemUnit, convertAmount, defaultsForUnit, displayAmount, formatStock, guessCategory, gramsPerCupFor, itemKey, matchItems, parseIngredient, stockStatus, type Item } from './index.ts';

const item = (o: Partial<Item> & { name: string }): Item => ({ id: 1, aliases: [], category: 'Pantry', unit: null, qty: 0, step: 1, defaultQty: 1, minQty: 0, staple: false, tracked: true, gramsPerCup: null, place: null, ...o });

describe('convertAmount', () => {
  it('converts inside a kind exactly', () => {
    expect(convertAmount(1, 'lb', 'g')).toBeCloseTo(453.592);
    expect(convertAmount(2, 'kg', 'g')).toBe(2000);
    expect(convertAmount(1, 'cup', 'ml')).toBe(250);
    expect(convertAmount(3, 'tsp', 'tbsp')).toBe(1);
    expect(convertAmount(500, 'ml', 'l')).toBe(0.5);
  });
  it('crosses weight and volume only when the weight of a cup is known', () => {
    expect(convertAmount(1, 'cup', 'g')).toBeNull();
    expect(convertAmount(1, 'cup', 'g', 125)).toBe(125);
    expect(convertAmount(250, 'g', 'cup', 125)).toBe(2);
  });
  it('matches counts only to the same word or none', () => {
    expect(convertAmount(2, 'clove', 'clove')).toBe(2);
    expect(convertAmount(2, null, null)).toBe(2);
    expect(convertAmount(2, 'clove', null)).toBeNull();
    expect(convertAmount(2, 'clove', 'g')).toBeNull();
  });
});

describe('gramsPerCupFor', () => {
  it('knows only foods with agreed figures', () => {
    expect(gramsPerCupFor('plain flour')).toBe(125);
    expect(gramsPerCupFor('caster sugar')).toBe(220);
    expect(gramsPerCupFor('butter')).toBe(250);
    expect(gramsPerCupFor('rolled oats')).toBe(90);
    expect(gramsPerCupFor('milk')).toBeNull();
    expect(gramsPerCupFor('cocoa')).toBeNull();
  });
  it('lets an item set its own', () => expect(gramsPerCupFor('cocoa', 100)).toBe(100));
});

describe('displayAmount', () => {
  const d = (line: string, mode: 'original' | 'metric-cups' | 'metric-grams', factor = 1) => displayAmount(parseIngredient(line), factor, mode).amount;
  it('original is as written', () => { expect(d('8 oz butter', 'original')).toBe('8 oz'); expect(d('1 cup flour', 'original')).toBe('1 cup'); });
  it('metric + cups converts imperial and keeps cups and spoons', () => {
    expect(d('8 oz butter', 'metric-cups')).toBe('225 g');
    expect(d('1 lb mince', 'metric-cups')).toBe('455 g');
    expect(d('3 lb potatoes', 'metric-cups')).toBe('1.36 kg');
    expect(d('1 pint milk', 'metric-cups')).toBe('475 ml');
    expect(d('1 cup flour', 'metric-cups')).toBe('1 cup');
    expect(d('2 tbsp oil', 'metric-cups')).toBe('2 tbsp');
    expect(d('500 g pasta', 'metric-cups')).toBe('500 g');
  });
  it('metric + grams also weighs cups of foods people weigh', () => {
    expect(d('1 cup flour', 'metric-grams')).toBe('125 g');
    expect(d('2 cups plain flour', 'metric-grams')).toBe('250 g');
    expect(d('1/2 cup caster sugar', 'metric-grams')).toBe('110 g');
    expect(d('1 cup butter', 'metric-grams')).toBe('250 g');
  });
  it('metric + grams leaves small amounts and unknown foods in cups and spoons', () => {
    expect(d('2 tbsp butter', 'metric-grams')).toBe('2 tbsp');
    expect(d('1 tsp flour', 'metric-grams')).toBe('1 tsp');
    expect(d('1/8 cup flour', 'metric-grams')).toBe('⅛ cup');
    expect(d('1 cup milk', 'metric-grams')).toBe('1 cup');
  });
  it('scales, handles ranges and lines with no amount', () => {
    expect(d('1 cup flour', 'metric-grams', 2)).toBe('250 g');
    expect(d('1-2 cups flour', 'metric-grams')).toBe('125–250 g');
    expect(d('Salt to taste', 'metric-grams')).toBe('');
    expect(d('2 eggs', 'metric-grams')).toBe('2');
  });
  it('uses an item\'s own cup weight', () => expect(displayAmount(parseIngredient('1 cup cocoa'), 1, 'metric-grams', 100).amount).toBe('100 g'));
});

describe('names and matching', () => {
  it('keys ignore case, order, plurals and cutting words, but not the kind of pasta', () => {
    expect(itemKey('Free Range Eggs')).toBe(itemKey('egg'));
    expect(itemKey('chopped fresh tomatoes')).toBe(itemKey('Tomato'));
    expect(itemKey('fettuccine pasta')).not.toBe(itemKey('pasta'));
    expect(itemKey('pasta, fettuccine')).toBe(itemKey('fettuccine pasta'));
  });
  it('names a new item from a recipe line, keeping its specifics', () => {
    expect(cleanItemName('fresh fettuccine pasta')).toBe('Fettuccine pasta');
    expect(cleanItemName('Coles Australian Free Range Eggs')).toBe('Coles eggs');
    expect(cleanItemName('2 (big) onions')).toBeTruthy();
  });
  const pantry = [item({ id: 1, name: 'Eggs' }), item({ id: 2, name: 'Pasta' }), item({ id: 3, name: 'Penne pasta' }), item({ id: 4, name: 'Butter', aliases: ['unsalted butter'] })];
  it('links the same words, and a remembered alias, exactly', () => {
    expect(matchItems('2 large eggs'.replace('2 ', ''), pantry).exact?.id).toBe(1);
    expect(matchItems('Unsalted Butter', pantry).exact?.id).toBe(4);
  });
  it('never links fettuccine to plain pasta without a confirmation', () => {
    const m = matchItems('fresh fettuccine pasta', pantry);
    expect(m.exact).toBeNull();
    expect(m.candidates.map((c) => [c.item.name, c.kind])).toEqual([['Pasta', 'broader'], ['Penne pasta', 'related']]);
  });
  it('offers a more specific item for a generic ingredient, as a candidate only', () => {
    const m = matchItems('pasta', [item({ id: 9, name: 'Fettuccine pasta' })]);
    expect(m.exact).toBeNull();
    expect(m.candidates).toEqual([{ item: expect.objectContaining({ id: 9 }), kind: 'narrower' }]);
  });
  it('a brand name makes it a candidate until the alias is confirmed', () => {
    expect(matchItems('Coles Australian Free Range Eggs', pantry).candidates[0]).toMatchObject({ kind: 'broader', item: { name: 'Eggs' } });
    const learned = [item({ id: 1, name: 'Eggs', aliases: ['Coles Australian Free Range Eggs'] })];
    expect(matchItems('Coles Australian Free Range Eggs', learned).exact?.id).toBe(1);
  });
  it('matches nothing for empty or unrelated names', () => { expect(matchItems('', pantry)).toEqual({ exact: null, candidates: [] }); expect(matchItems('saffron', pantry).candidates).toEqual([]); });
});

describe('guessCategory', () => {
  it.each([['tomatoes', 'Produce'], ['fresh tomato paste', 'Pantry'], ['butter', 'Dairy & eggs'], ['peanut butter', 'Pantry'], ['shortcut bacon rashers', 'Meat & fish'], ['frozen peas', 'Frozen'], ['unicorn dust', 'Other'], ['wholemeal bread', 'Bakery'], ['fettuccine pasta', 'Pantry']])('%s -> %s', (n, c) => expect(guessCategory(n)).toBe(c));
  it('only ever returns a known category', () => expect(CATEGORIES).toContain(guessCategory('anything at all') as never));
});

describe('defaults and formatting', () => {
  it('steps by 100 g, half a kilo, one each', () => { expect(defaultsForUnit('g').step).toBe(100); expect(defaultsForUnit('kg').step).toBe(0.5); expect(defaultsForUnit(null)).toEqual({ step: 1, defaultQty: 1 }); });
  it('formats stock', () => { expect(formatStock(2, 'kg')).toBe('2 kg'); expect(formatStock(6, null)).toBe('6'); expect(formatStock(1.5, 'cup')).toBe('1½ cups'); });
});

describe('stockStatus', () => {
  const ing = (l: string) => parseIngredient(l);
  it('unlinked', () => expect(stockStatus(ing('1 cup milk'), 1, null).state).toBe('unlinked'));
  it('enough, some, none in the item\'s unit, with the shortfall', () => {
    const flour = item({ name: 'Flour', unit: 'g', qty: 1000 });
    expect(stockStatus(ing('1 cup flour'), 1, flour)).toMatchObject({ state: 'enough', need: 125 });
    expect(stockStatus(ing('1 cup flour'), 4, flour)).toMatchObject({ state: 'enough', need: 500 });
    expect(stockStatus(ing('1 cup flour'), 10, flour)).toMatchObject({ state: 'some', need: 1250, missing: 250 });
    expect(stockStatus(ing('1 cup flour'), 1, { ...flour, qty: 0 })).toMatchObject({ state: 'none', missing: 125 });
  });
  it('compares eggs as a count, and unknown when the units cannot be compared', () => {
    expect(stockStatus(ing('2 eggs'), 1, item({ name: 'Eggs', qty: 6 })).state).toBe('enough');
    expect(stockStatus(ing('8 eggs'), 1, item({ name: 'Eggs', qty: 6 }))).toMatchObject({ state: 'some', missing: 2 });
    expect(stockStatus(ing('1 cup milk'), 1, item({ name: 'Milk', unit: null, qty: 3 })).state).toBe('unknown');
    expect(stockStatus(ing('1 cup milk'), 1, item({ name: 'Milk', unit: null, qty: 0 })).state).toBe('none'); // nothing in stock is none whatever the units
    expect(stockStatus(ing('2 clove garlic'), 1, item({ name: 'Garlic', unit: 'g', qty: 100 })).state).toBe('unknown');
  });
  it('staples are always fine; a line with no amount needs any stock', () => {
    expect(stockStatus(ing('1 tsp salt'), 1, item({ name: 'Salt', staple: true })).state).toBe('staple');
    expect(stockStatus(ing('Pepper to taste'), 1, item({ name: 'Pepper', qty: 1 })).state).toBe('enough');
    expect(stockStatus(ing('Pepper to taste'), 1, item({ name: 'Pepper', qty: 0 })).state).toBe('none');
  });
  it('a range needs the top of it', () => expect(stockStatus(ing('2-3 eggs'), 1, item({ name: 'Eggs', qty: 2 }))).toMatchObject({ state: 'some', need: 3, missing: 1 }));
});

describe('prettyStock, fineStep, suggestItemUnit', () => {
  it('shows small kilos and litres as grams and millilitres', () => {
    expect(prettyStock(0.25, 'kg')).toBe('250 g'); expect(prettyStock(2.5, 'kg')).toBe('2½ kg'); expect(prettyStock(0.5, 'l')).toBe('500 ml');
    expect(prettyStock(1500, 'g')).toBe('1½ kg'); expect(prettyStock(0, 'kg')).toBe('0 kg'); expect(prettyStock(6, null)).toBe('6');
  });
  it('steps finely when taking an exact amount', () => { expect(fineStep('g')).toBe(25); expect(fineStep('kg')).toBe(0.05); expect(fineStep(null)).toBe(1); });
  it('counts weights in grams, liquids in ml, foods people weigh in grams, spices as one', () => {
    const u = (l: string) => suggestItemUnit(parseIngredient(l));
    expect(u('375 g pasta')).toBe('g'); expect(u('2 kg flour')).toBe('kg'); expect(u('1 cup milk')).toBe('ml'); expect(u('1 cup plain flour')).toBe('g');
    expect(u('1 tsp salt')).toBeNull(); expect(u('2 clove garlic')).toBe('clove'); expect(u('4 eggs')).toBeNull();
  });
});
