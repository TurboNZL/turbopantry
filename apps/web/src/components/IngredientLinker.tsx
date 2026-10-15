import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { cleanItemName, itemKey, matchItems, suggestItemUnit, type Ingredient, type Item, type MatchKind } from '@turbopantry/shared';
import type { Api } from '../lib/api.ts';

/** What to do with one recipe line. Keyed by its ORIGINAL wording, which is never changed. */
export type Choice = { kind: 'item'; id: number } | { kind: 'new'; name: string } | { kind: 'none' };
export type Choices = Record<string, Choice>;

const KIND: Record<MatchKind, string> = { broader: 'less specific', narrower: 'more specific', related: 'similar' };

/**
 * First choices: a line that is exactly an item (same words, or an alias you taught it) is linked; anything else is a NEW item with the line's
 * specifics kept ("Fettuccine pasta", not "Pasta"). Similar items are shown for you to pick, never chosen for you.
 */
export function defaultChoices(ings: Ingredient[], items: Item[]): Choices {
  const out: Choices = {};
  for (const ing of ings) {
    const have = ing.itemId ? items.find((i) => i.id === ing.itemId) : undefined;
    const m = matchItems(ing.name, items);
    out[ing.raw] = have ? { kind: 'item', id: have.id } : m.exact ? { kind: 'item', id: m.exact.id } : { kind: 'new', name: cleanItemName(ing.name) };
  }
  return out;
}

/** Makes the new items and remembers the new wordings, then returns the ingredients with their links. Original wording is untouched. */
export async function resolveLinks(api: Api, ings: Ingredient[], choices: Choices, items: Item[]): Promise<Ingredient[]> {
  const base = defaultChoices(ings, items);
  const learned = new Set<string>();
  const out: Ingredient[] = [];
  for (const ing of ings) {
    const c = choices[ing.raw] ?? base[ing.raw] ?? { kind: 'none' as const };
    if (c.kind === 'none') { out.push({ ...ing, itemId: null }); continue; }
    if (c.kind === 'new') {
      const made = await api.createItem({ name: c.name.trim() || cleanItemName(ing.name), unit: suggestItemUnit(ing), tracked: false });
      out.push({ ...ing, itemId: made.id });
      continue;
    }
    const item = items.find((i) => i.id === c.id);
    if (item && itemKey(item.name) !== itemKey(ing.name) && !item.aliases.some((a) => itemKey(a) === itemKey(ing.name)) && !learned.has(`${item.id}:${itemKey(ing.name)}`)) {
      learned.add(`${item.id}:${itemKey(ing.name)}`);
      await api.updateItem(item.id, { addAlias: ing.name }).catch(() => undefined); // remembered: the same wording links by itself next time
    }
    out.push({ ...ing, itemId: c.id });
  }
  return out;
}

function Row({ ing, items, choice, onPick }: { ing: Ingredient; items: Item[]; choice: Choice; onPick(c: Choice): void }) {
  const m = matchItems(ing.name, items);
  const value = choice.kind === 'item' ? `i${choice.id}` : choice.kind === 'new' ? 'new' : 'none';
  const newName = choice.kind === 'new' ? choice.name : cleanItemName(ing.name);
  return (
    <div className="space-y-2 py-3">
      <div className="text-sm"><span className="text-muted">Recipe says </span><strong className="font-semibold">{ing.raw}</strong></div>
      <select className="input h-11" aria-label={`What is ${ing.raw}`} value={value} onChange={(e) => { const v = e.target.value; onPick(v === 'none' ? { kind: 'none' } : v === 'new' ? { kind: 'new', name: newName } : { kind: 'item', id: Number(v.slice(1)) }); }}>
        {m.exact && <option value={`i${m.exact.id}`}>In your list: {m.exact.name}</option>}
        {m.candidates.map((c) => <option key={c.item.id} value={`i${c.item.id}`}>{c.item.name} ({KIND[c.kind]})</option>)}
        {!m.exact && choice.kind === 'item' && !m.candidates.some((c) => c.item.id === choice.id) && <option value={`i${choice.id}`}>{items.find((i) => i.id === choice.id)?.name ?? 'Linked item'}</option>}
        <option value="new">A new item</option>
        <option value="none">Don't link</option>
      </select>
      {choice.kind === 'new' && <input className="input h-11" aria-label="Name of the new item" value={choice.name} onChange={(e) => onPick({ kind: 'new', name: e.target.value })} />}
    </div>
  );
}

/**
 * Links a recipe's lines to the household's items. Only the lines that could be something you already have are shown; the rest quietly become
 * new items (so "do I have it?" works and the shopping list sorts them into aisles). The kind of ingredient matters: a recipe's "fettuccine" is
 * offered the item "Pasta" as "less specific", and stays its own item unless you say otherwise.
 */
export function IngredientLinker({ ingredients, items, choices, onChange }: { ingredients: Ingredient[]; items: Item[]; choices: Choices; onChange(c: Choices): void }) {
  const [all, setAll] = useState(false);
  const attention = ingredients.filter((i) => !matchItems(i.name, items).exact && matchItems(i.name, items).candidates.length > 0);
  const linked = ingredients.filter((i) => choices[i.raw]?.kind === 'item').length;
  const fresh = ingredients.filter((i) => choices[i.raw]?.kind === 'new').length;
  const rows = all ? ingredients : attention;
  return (
    <section className="card space-y-2 p-4" aria-label="Link to your items">
      <h2 className="flex items-center gap-2 font-semibold"><Link2 size={16} />Link to your items</h2>
      <p className="text-sm text-muted">{linked} linked to items you already have, {fresh} new. {attention.length ? `${attention.length} could be something you already have: check ${attention.length === 1 ? 'it' : 'them'}.` : 'Nothing needs checking.'} The recipe keeps its own wording.</p>
      <div className="divide-y divide-line">{rows.map((ing, i) => <Row key={`${ing.raw}-${i}`} ing={ing} items={items} choice={choices[ing.raw] ?? { kind: 'none' }} onPick={(c) => onChange({ ...choices, [ing.raw]: c })} />)}</div>
      {ingredients.length > attention.length && <button type="button" className="btn btn-ghost h-11" onClick={() => setAll(!all)}>{all ? 'Show only the ones to check' : `Show all ${ingredients.length}`}</button>}
    </section>
  );
}
