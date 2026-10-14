import { useState } from 'react';
import { cleanSteps, ingredientsToBlock, parseIngredientBlock, parseMinutes, parseServings, type RecipeInput } from '@turbopantry/shared';

export const EMPTY_RECIPE: RecipeInput = {
  title: '', description: '', imageUrl: null, sourceUrl: null, sourceName: null, servings: null, prepMinutes: null, cookMinutes: null, totalMinutes: null,
  ingredients: [], steps: [], tags: [], notes: '',
};

const num = (s: string) => (s.trim() === '' ? null : parseMinutes(s));

/**
 * Edits a recipe as plain text: one ingredient per line (a line starting with # is a section heading), one step per line.
 * Ingredient lines are parsed on save, and the original wording is always kept, so nothing is lost if the parser guesses wrong.
 */
export function RecipeForm({ initial, submitLabel, busy, onSubmit }: { initial: RecipeInput; submitLabel: string; busy?: boolean; onSubmit(r: RecipeInput): void }) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [imageUrl, setImageUrl] = useState(initial.imageUrl ?? '');
  const [servings, setServings] = useState(initial.servings?.toString() ?? '');
  const [prep, setPrep] = useState(initial.prepMinutes?.toString() ?? '');
  const [cook, setCook] = useState(initial.cookMinutes?.toString() ?? '');
  const [ingredients, setIngredients] = useState(ingredientsToBlock(initial.ingredients));
  const [steps, setSteps] = useState(initial.steps.join('\n\n'));
  const [tags, setTags] = useState(initial.tags.join(', '));
  const [notes, setNotes] = useState(initial.notes);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const prepMinutes = num(prep), cookMinutes = num(cook);
    onSubmit({
      ...initial, title: title.trim(), description: description.trim(), imageUrl: imageUrl.trim() || null,
      servings: servings.trim() ? parseServings(servings) : null, prepMinutes, cookMinutes,
      totalMinutes: initial.totalMinutes !== null && prepMinutes === initial.prepMinutes && cookMinutes === initial.cookMinutes ? initial.totalMinutes : null,
      ingredients: parseIngredientBlock(ingredients), steps: cleanSteps(steps.split(/\n\s*\n|\r?\n/)), // pasted step numbers and headings ("1", "Directions") are dropped
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean), notes: notes.trim(),
    });
  }

  const label = 'mb-1 block text-sm font-medium';
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block"><span className={label}>Title</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} /></label>
      <label className="block"><span className={label}>Description</span><textarea className="input min-h-[4rem]" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <div className="grid grid-cols-3 gap-3">
        <label className="block"><span className={label}>Servings</span><input className="input" inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} /></label>
        <label className="block"><span className={label}>Prep (min)</span><input className="input" inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value)} /></label>
        <label className="block"><span className={label}>Cook (min)</span><input className="input" inputMode="numeric" value={cook} onChange={(e) => setCook(e.target.value)} /></label>
      </div>
      <label className="block"><span className={label}>Photo address <span className="font-normal text-muted">(optional)</span></span><input className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" /></label>
      <label className="block"><span className={label}>Ingredients</span>
        <textarea className="input min-h-[10rem] font-mono text-sm" value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder={'1 1/2 cups flour\n2 eggs\n# Sauce\n1 can tomatoes'} />
        <span className="text-xs text-muted">One per line. A line starting with # begins a group, such as “# Sauce”.</span></label>
      <label className="block"><span className={label}>Method</span><textarea className="input min-h-[10rem]" value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="One step per line or paragraph. Pasted step numbers are cleaned up for you." /></label>
      <label className="block"><span className={label}>Tags <span className="font-normal text-muted">(comma separated)</span></span><input className="input" value={tags} onChange={(e) => setTags(e.target.value)} /></label>
      <label className="block"><span className={label}>Notes</span><textarea className="input min-h-[4rem]" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <button className="btn btn-accent" disabled={busy || !title.trim()}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}
