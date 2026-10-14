import { describe, expect, it } from 'vitest';
import { formatQuantity, ingredientsToBlock, parseIngredient, parseIngredientBlock, parseMinutes, parseQuantity, parseServings, scaleIngredient } from './index.ts';

describe('parseQuantity', () => {
  it.each([['1', 1], ['1/2', 0.5], ['1 1/2', 1.5], ['½', 0.5], ['1½', 1.5], ['2.5', 2.5], ['1,5', 1.5]])('%s', (s, n) => expect(parseQuantity(s)).toBeCloseTo(n));
  it('rejects words', () => expect(parseQuantity('some')).toBeNull());
});

describe('parseIngredient', () => {
  const p = (s: string) => { const i = parseIngredient(s); return [i.quantity, i.quantityMax, i.unit, i.name, i.note]; };
  it('basic', () => expect(p('1 1/2 cups all-purpose flour, sifted')).toEqual([1.5, null, 'cup', 'all-purpose flour', 'sifted']));
  it('size in brackets', () => expect(p('1 (14 oz) can chopped tomatoes')).toEqual([1, null, 'can', 'chopped tomatoes', '14 oz']));
  it('range', () => expect(p('2-3 tbsp olive oil')).toEqual([2, 3, 'tbsp', 'olive oil', null]));
  it('Osta style plurals', () => { expect(p('24 ozs pasta')).toEqual([24, null, 'oz', 'pasta', null]); expect(p('1/4 tbsps honey')).toEqual([0.25, null, 'tbsp', 'honey', null]); });
  it('no quantity keeps the whole line', () => expect(p('Salt to taste')).toEqual([null, null, null, 'Salt to taste', null]));
  it('count without a unit', () => expect(p('2 large eggs')).toEqual([2, null, null, 'large eggs', null]));
  it('unit with "of"', () => expect(p('1 cup of milk')).toEqual([1, null, 'cup', 'milk', null]));
  it('fl oz', () => expect(p('8 fl oz cream')).toEqual([8, null, 'fl oz', 'cream', null]));
  it('keeps the raw line', () => expect(parseIngredient('  2   eggs ').raw).toBe('2 eggs'));
  it('a word that only starts like a unit is not a unit', () => expect(p('3 cabbages')).toEqual([3, null, null, 'cabbages', null]));
  it('never throws on junk', () => { for (const s of ['', '   ', '(', ')))', '1/0 cups x', '½', '1 -']) expect(() => parseIngredient(s)).not.toThrow(); });
});

describe('ingredient blocks', () => {
  it('sections by "Name:" or "# Name"', () => {
    const items = parseIngredientBlock('Cheese sauce:\n4 oz butter\n# Chicken\n2 lbs chicken thighs');
    expect(items.map((i) => [i.section, i.name])).toEqual([['Cheese sauce', 'butter'], ['Chicken', 'chicken thighs']]);
  });
  it('round-trips through the edit form text', () => {
    const items = parseIngredientBlock('# Sauce\n1 cup milk\n# Chicken\n2 eggs');
    expect(parseIngredientBlock(ingredientsToBlock(items))).toEqual(items);
  });
});

describe('quantities', () => {
  it.each([[1.5, '1½'], [1 / 3, '⅓'], [2, '2'], [0.25, '¼'], [2.43, '2.4'], [2.37, '2⅜'], [2.999, '3']])('format %s', (n, s) => expect(formatQuantity(n)).toBe(s));
  it('puts counted units in the plural, and leaves measures alone', () => {
    expect(scaleIngredient(parseIngredient('2 clove garlic, crushed'), 1)).toBe('2 cloves garlic, crushed');
    expect(scaleIngredient(parseIngredient('1 clove garlic'), 1)).toBe('1 clove garlic');
    expect(scaleIngredient(parseIngredient('1 cup milk'), 2)).toBe('2 cups milk');
    expect(scaleIngredient(parseIngredient('1/2 cup milk'), 1)).toBe('½ cup milk');
    expect(scaleIngredient(parseIngredient('2 tsp salt'), 1)).toBe('2 tsp salt');
    expect(scaleIngredient(parseIngredient('1 bunch parsley'), 3)).toBe('3 bunches parsley');
  });
  it('scales', () => { expect(scaleIngredient(parseIngredient('1 cup milk, warm'), 2)).toBe('2 cups milk, warm'); expect(scaleIngredient(parseIngredient('Salt'), 3)).toBe('Salt'); expect(scaleIngredient(parseIngredient('2-3 tbsp oil'), 2)).toBe('4–6 tbsp oil'); });
});

describe('durations and servings', () => {
  it.each([['PT1H30M', 90], ['PT45M', 45], ['P0DT1H', 60], ['P1DT2H', 1560], ['45 mins', 45], ['1 hr 15 min', 75], [30, 30], ['bad', null], ['P', null]])('%s', (v, n) => expect(parseMinutes(v)).toBe(n));
  it.each([['8 servings', 8], [4, 4], [['4', '4 servings'], 4], ['Serves 6', 6], ['12 cookies', 12], ['lots', null]])('%s', (v, n) => expect(parseServings(v)).toBe(n));
});
