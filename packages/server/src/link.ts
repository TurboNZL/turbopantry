import { cleanItemName, matchItems, type Ingredient, type IngredientSuggestion } from '@turbopantry/shared';
import type { Db } from './db.ts';
import { getItem, listItems } from './items.ts';

/**
 * Links a recipe's ingredients to pantry items when it is saved: a line that already has a link keeps it (if that item still exists), a line
 * whose words are exactly an item's name or alias gets linked, and anything else stays unlinked. Never a guess: similar items are only ever
 * offered in the import review, where the user confirms them.
 */
export function linkIngredients(db: Db, ingredients: Ingredient[]): Ingredient[] {
  const items = listItems(db);
  return ingredients.map((ing) => {
    if (ing.itemId && getItem(db, ing.itemId)) return ing;
    const exact = matchItems(ing.name, items).exact;
    return { ...ing, itemId: exact?.id ?? null };
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
