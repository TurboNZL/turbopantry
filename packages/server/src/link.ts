import { cleanItemName, matchItems, suggestItemUnit, type Ingredient, type IngredientSuggestion } from '@turbopantry/shared';
import type { Db } from './db.ts';
import { createItem, getItem, listItems } from './items.ts';

/**
 * Links a recipe's ingredients to pantry items when it is saved, so every line is linked: a line that already has a link keeps it (if that item
 * still exists), a line whose words are exactly an item's name or alias gets linked, and a line nothing resembles becomes a NEW item (at none,
 * so it shows as out). Never a guess between similar items: a line that resembles an item ("pasta" / "fettuccine pasta") stays unlinked here and
 * is asked about in the import review (a preview passes `create = false`: looking at a draft never makes items) and the recipe's "Link items" sheet, where the user confirms it.
 */
export function linkIngredients(db: Db, ingredients: Ingredient[], create = true): Ingredient[] {
  const items = listItems(db);
  return ingredients.map((ing) => {
    if (ing.itemId && getItem(db, ing.itemId)) return ing;
    const m = matchItems(ing.name, items);
    if (m.exact) return { ...ing, itemId: m.exact.id };
    const name = cleanItemName(ing.name);
    if (!create || m.candidates.length || !ing.name.trim() || !name.trim()) return { ...ing, itemId: null };
    try {
      const made = createItem(db, { name, unit: suggestItemUnit(ing), fromRecipe: true }).item;
      items.push(made); // the next line of the same recipe finds it
      return { ...ing, itemId: made.id };
    } catch { return { ...ing, itemId: null }; }
  });
}

/** What the pantry already has for each ingredient of an import draft: the exact item (linked already), or candidates to confirm, plus the name a new item would get. */
export function suggestionsFor(db: Db, ingredients: Ingredient[]): IngredientSuggestion[] {
  const items = listItems(db);
  return ingredients.map((ing, index) => {
    const m = matchItems(ing.name, items);
    return {
      index,
      exact: m.exact ? { id: m.exact.id, name: m.exact.name } : null,
      candidates: m.candidates.map((c) => ({ id: c.item.id, name: c.item.name, kind: c.kind })),
      newName: cleanItemName(ing.name),
    };
  });
}
