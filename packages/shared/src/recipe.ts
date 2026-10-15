/** A recipe as the app stores and shows it. Ingredients are structured so they can be scaled and added to a shopping list. */
export interface Ingredient {
  /** The line as the source wrote it, kept so nothing is ever lost when parsing is unsure. */
  raw: string;
  quantity: number | null;
  /** Upper end of a range ("2-3 tbsp"). */
  quantityMax: number | null;
  /** Canonical unit ("cup", "tbsp", "oz", "g"...) or null. */
  unit: string | null;
  name: string;
  note: string | null;
  /** Group heading such as "Cheese sauce". */
  section: string | null;
  /** The pantry item this line is, chosen in the import review (the original wording above is never changed). */
  itemId?: number | null;
}

export interface RecipeInput {
  title: string;
  description: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
  notes: string;
}

export interface Recipe extends RecipeInput {
  id: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeSummary {
  id: number;
  title: string;
  imageUrl: string | null;
  totalMinutes: number | null;
  servings: number | null;
  tags: string[];
  updatedAt: string;
}

export type ImportErrorCode = 'bad-url' | 'blocked' | 'fetch-failed' | 'not-html' | 'no-recipe' | 'unsupported' | 'no-browser';
export interface ImportError { error: string; code: ImportErrorCode }

/** A successful import: a draft to review, plus things the user should know about it ("this source has no method"). */
/** For one ingredient of an import draft: what the pantry already has that it could be, so the user can confirm or change it. */
export interface IngredientSuggestion {
  index: number;
  /** A pantry item whose name or alias is the same words: linked already. */
  exact: { id: number; name: string } | null;
  /** Similar items that must be confirmed, never guessed. */
  candidates: { id: number; name: string; kind: 'broader' | 'narrower' | 'related' }[];
  /** The name a new pantry item would get. */
  newName: string;
}

export interface ImportDraft {
  recipe: RecipeInput;
  suggestions?: IngredientSuggestion[];
  warnings: string[];
  /** Another address the same recipe can be imported from, probably with cleaner data (an Osta recipe that links to the site it came from). */
  alternative?: { url: string; label: string };
}
