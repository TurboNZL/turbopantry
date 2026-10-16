import { describe, expect, it } from 'vitest';
import { cleanSteps, highlightStep, ingredientParts, nameVariants, parseIngredient } from './index.ts';

const ing = (...lines: string[]) => lines.map((l) => parseIngredient(l));
const plain = (segs: { text: string }[]) => segs.map((s) => s.text).join('');
const bold = (segs: { text: string; bold?: boolean }[]) => segs.filter((s) => s.bold).map((s) => s.text);

describe('cleanSteps', () => {
  it('drops bare step numbers and headings pasted from another app', () => {
    expect(cleanSteps(['Directions', '1', 'Slice the onion.', '2', 'Heat the butter.', '3.', 'Step 4', 'Serve.'])).toEqual(['Slice the onion.', 'Heat the butter.', 'Serve.']);
  });
  it('removes a leading number but keeps numbers inside the text', () => {
    expect(cleanSteps(['1. Boil 2 eggs.', '2) Cool them.', 'Cook for 4 minutes.'])).toEqual(['Boil 2 eggs.', 'Cool them.', 'Cook for 4 minutes.']);
  });
  it('keeps an empty or all-junk list empty', () => { expect(cleanSteps([])).toEqual([]); expect(cleanSteps(['1', '2'])).toEqual([]); });
});

describe('ingredientParts', () => {
  it('splits the amount from the name and note, scaled', () => {
    expect(ingredientParts(parseIngredient('1 1/2 cups flour, sifted'), 2)).toEqual({ amount: '3 cups', name: 'flour', note: 'sifted' });
    expect(ingredientParts(parseIngredient('2 clove garlic'), 1).amount).toBe('2 cloves');
    expect(ingredientParts(parseIngredient('2-3 tbsp oil'), 2)).toEqual({ amount: '4–6 tbsp', name: 'oil', note: '' });
  });
  it('shows a line with no quantity as it was written', () => expect(ingredientParts(parseIngredient('Salt to taste'))).toEqual({ amount: '', name: 'Salt to taste', note: '' }));
});

describe('nameVariants', () => {
  it('offers the full name, the name without describing words, and the last words', () => {
    expect(nameVariants('fresh fettuccine pasta')).toEqual(['fresh fettuccine pasta', 'fettuccine pasta', 'fettuccine', 'pasta']);
    expect(nameVariants('garlic')).toEqual(['garlic']);
  });
  it('never offers a unit-like or tiny word on its own', () => { expect(nameVariants('cup')).toEqual([]); expect(nameVariants('of')).toEqual([]); });
});

describe('highlightStep', () => {
  const carbonara = ing('375 g fresh fettuccine pasta', '20 g butter', '175 g shortcut bacon rashers, chopped', '2 clove garlic, crushed', '2 tsp fresh rosemary, finely chopped', '2 egg yolks', '1/2 cup cooking cream', '1/3 cup parmesan, finely grated');
  const step = 'Meanwhile, melt butter in a frying pan over medium heat. Add bacon. Cook for 4 minutes or until golden. Add garlic and rosemary. Cook, stirring, for 1 minute.';

  it('bolds the ingredients a step mentions and nothing else', () => {
    const segs = highlightStep(step, carbonara);
    expect(plain(segs)).toBe(step);
    expect(bold(segs)).toEqual(['butter', 'bacon', 'garlic', 'rosemary']);
  });
  it('matches plurals and the short name of a longer ingredient', () => {
    expect(bold(highlightStep('Whisk eggs, yolks, cream and parmesan. Drain the pasta.', carbonara))).toEqual(['eggs', 'yolks', 'cream', 'parmesan', 'pasta']);
    expect(bold(highlightStep('Add the fettuccine pasta to the water.', carbonara))).toEqual(['fettuccine pasta']);
  });
  it('is case-insensitive and whole-word only', () => {
    expect(bold(highlightStep('Butter the dish. Buttery sauce.', ing('20 g butter')))).toEqual(['Butter']);
  });
  it('with quantities hidden, drops the amount right before a mentioned ingredient', () => {
    const t = (s: string) => plain(highlightStep(s, carbonara, { hideQuantities: true }));
    expect(t('Add 175g bacon and 2 cloves garlic, then 1/2 cup of cream.')).toBe('Add bacon and garlic, then cream.');
    expect(t('Melt 20g butter, add 2 tsp rosemary.')).toBe('Melt butter, add rosemary.');
  });
  it('with quantities hidden, never touches numbers that are not amounts of an ingredient', () => {
    const s = 'Cook for 4 minutes at 180°C, stirring every 30 seconds. Serves 4.';
    expect(plain(highlightStep(s, carbonara, { hideQuantities: true }))).toBe(s);
    expect(plain(highlightStep('Bake 2 trays for 10 minutes.', carbonara, { hideQuantities: true }))).toBe('Bake 2 trays for 10 minutes.');
  });
  it('leaves the text alone when the recipe has no usable ingredient names', () => {
    expect(highlightStep('Do the thing.', [])).toEqual([{ text: 'Do the thing.' }]);
    expect(highlightStep('Do the thing.', ing('1 cup'))).toEqual([{ text: 'Do the thing.' }]);
  });
  it('survives regex-looking names', () => {
    expect(() => highlightStep('Add 1 (big) c++ thing.', ing('2 tbsp c++ (spicy) [mix]'))).not.toThrow();
  });
});

describe('amounts in the method scale with the servings', () => {
  const rice = [parseIngredient('1/2 cup rice'), parseIngredient('200 g bacon'), parseIngredient('2 cloves garlic')];
  const text = (segs: { text: string }[]) => segs.map((s) => s.text).join('');
  it.each([
    ['Simmer the 1/2 cup rice gently.', 2, 'Simmer the 1 cup rice gently.'],
    ['Add 200g bacon and fry for 4 minutes.', 2, 'Add 400g bacon and fry for 4 minutes.'],
    ['Add 2 cloves garlic.', 3, 'Add 6 cloves garlic.'],
    ['Add 1/2 cup of rice.', 0.5, 'Add \u00bc cup of rice.'],
    ['Cook the rice for 20 minutes at 180\u00b0C.', 2, 'Cook the rice for 20 minutes at 180\u00b0C.'],
  ])('%s x%s', (step, factor, want) => expect(text(highlightStep(step, rice, { factor }))).toBe(want));
  it('leaves the text alone at 1x', () => expect(text(highlightStep('Simmer the 1/2 cup rice gently.', rice, { factor: 1 }))).toBe('Simmer the 1/2 cup rice gently.'));
});
