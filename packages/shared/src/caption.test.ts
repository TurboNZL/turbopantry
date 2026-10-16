import { describe, expect, it } from 'vitest';
import { parseRecipeText } from './index.ts';

const CAPTION = `Creamy garlic chicken pasta 🍝🔥 SO easy and ready in 25 mins!

Serves 4

🛒 Ingredients:
• 500g chicken breast, sliced
• 2 tbsp olive oil
• 4 cloves garlic, minced
• 1 cup heavy cream
• 300g fettuccine
• Salt and pepper
• Fresh parsley

👩‍🍳 Method:
1️⃣ Boil the fettuccine until al dente and drain.
2️⃣ Sear the chicken in olive oil until golden, then add the garlic.
3️⃣ Pour in the cream, simmer 3 minutes, toss with the pasta and parsley.

Follow @someone for more! #pasta #dinner #easyrecipes`;

describe('recipes from a post', () => {
  it('reads a caption with headings and emoji', () => {
    const d = parseRecipeText([CAPTION], { sourceUrl: 'https://www.instagram.com/reel/abc/' })!;
    expect(d.recipe.title).toBe('Creamy garlic chicken pasta');
    expect(d.recipe.servings).toBe(4);
    expect(d.recipe.ingredients.map((i) => i.name)).toEqual(expect.arrayContaining(['chicken breast', 'olive oil', 'fettuccine']));
    expect(d.recipe.ingredients).toHaveLength(7);
    expect(d.recipe.ingredients[0]).toMatchObject({ quantity: 500, unit: 'g' });
    expect(d.recipe.steps).toHaveLength(3);
    expect(d.recipe.steps[0]).toBe('Boil the fettuccine until al dente and drain.');
    expect(d.warnings).toEqual([]);
    expect(d.recipe.sourceUrl).toBe('https://www.instagram.com/reel/abc/');
  });
  it('takes the recipe from a comment when the caption has none', () => {
    const d = parseRecipeText(['Dinner tonight 😍 recipe in the comments!', 'Ingredients\n2 cups flour\n1 cup milk\n2 eggs\n\nMethod\n1. Whisk everything.\n2. Fry in a hot pan.'])!;
    expect(d.recipe.title).toBe('Dinner tonight');
    expect(d.recipe.ingredients).toHaveLength(3);
    expect(d.recipe.steps).toEqual(['Whisk everything.', 'Fry in a hot pan.']);
  });
  it('combines ingredients from the caption with a method from a comment', () => {
    const d = parseRecipeText(['Pancakes\nIngredients:\n1 cup flour\n1 egg\n1 cup milk', 'Method: mix it all together, then cook spoonfuls in a buttered pan for two minutes each side until golden brown and puffed.'])!;
    expect(d.recipe.ingredients).toHaveLength(3);
    expect(d.recipe.steps.length).toBeGreaterThan(0);
  });
  it('works without headings: amounts are ingredients, numbered or long lines are steps', () => {
    const d = parseRecipeText(['Quick tomato soup\n2 tins chopped tomatoes\n1 onion\n500ml stock\n1. Soften the onion in a pot with a splash of oil.\n2. Add everything else and simmer for 20 minutes, then blend until smooth.'])!;
    expect(d.recipe.ingredients.map((i) => i.raw)).toEqual(['2 tins chopped tomatoes', '1 onion', '500ml stock']);
    expect(d.recipe.steps).toHaveLength(2);
  });
  it('keeps ingredient sections', () => {
    const d = parseRecipeText(['Cake\nIngredients\nFor the cake:\n200g flour\n100g sugar\nFor the icing:\n50g butter\n100g icing sugar'])!;
    expect(d.recipe.ingredients.map((i) => i.section)).toEqual(['For the cake', 'For the cake', 'For the icing', 'For the icing']);
  });
  it('says so when nothing looks like a recipe, and warns about a missing method', () => {
    expect(parseRecipeText(['Look at my new puppy 🐶 #dogsofinstagram'])).toBeNull();
    expect(parseRecipeText([])).toBeNull();
    expect(parseRecipeText(['Toast\nIngredients\n2 slices bread\n1 tbsp butter'])!.warnings.join(' ')).toMatch(/No method/);
  });
});
