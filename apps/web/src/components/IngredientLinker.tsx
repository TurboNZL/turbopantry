import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { cleanItemName, itemKey, matchItems, suggestItemUnit, titleCase, type Ingredient, type Item, type MatchKind } from '@turbopantry/shared';
import type { Api } from '../lib/api.ts';

/** What to do with one recipe line. Keyed by its ORIGINAL wording, which is never changed. */
export type Choice = { kind: 'item'; id: number; /** also remember the recipe's wording as another name of the item */ alias?: boolean } | { kind: 'new'; name: string } | { kind: 'none' };
export type Choices = Record<string, Choice>;

const KIND: Record<MatchKind, string> = { broader: 'less specific', narrower: 'more specific', related: 'similar' };

const newName = (ing: Ingredient) => titleCase(cleanItemName(ing.name));

/**
 * First choices, the best guess for each line (all of them can be changed in the review): the same words as an item (or an alias you taught it) is
 * linked; otherwise the closest item that is a clear relative (less or more specific: "Eggs" for "Coles free range eggs") is linked AND its
 * wording is added as an alias; a line that merely shares a word ("penne pasta" / "fettuccine pasta") becomes a NEW item with its specifics kept.
 */
export function defaultChoices(ings: Ingredient[], items: Item[]): Choices {
  const out: Choices = {};
  for (const ing of ings) {
    const have = ing.itemId ? items.find((i) => i.id === ing.itemId) : undefined;
    const m = matchItems(ing.name, items);
    const best = m.candidates.find((c) => c.kind !== 'related');
    out[ing.raw] = have ? { kind: 'item', id: have.id } : m.exact ? { kind: 'item', id: m.exact.id } : best ? { kind: 'item', id: best.item.id, alias: true } : { kind: 'new', name: newName(ing) };
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
      const made = await api.createItem({ name: c.name.trim() || newName(ing), unit: suggestItemUnit(ing), fromRecipe: true });
      out.push({ ...ing, itemId: made.id });
      continue;
    }
    const item = items.find((i) => i.id === c.id);
    if (item && c.alias && itemKey(item.name) !== itemKey(ing.name) && !item.aliases.some((a) => itemKey(a) === itemKey(ing.name)) && !learned.has(`${item.id}:${itemKey(ing.name)}`)) {
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
  const chosen = choice.kind === 'item' ? items.find((i) => i.id === choice.id) : undefined;
  const isExact = !!chosen && (m.exact?.id === chosen.id || chosen.aliases.some((a) => itemKey(a) === itemKey(ing.name)));
  return (
    <div className="space-y-2 py-3">
      <div className="text-sm"><span className="text-muted">Recipe says </span><strong className="font-semibold">{ing.raw}</strong></div>
      <select className="input h-11" aria-label={`What is ${ing.raw}`} value={value} onChange={(e) => {
        const v = e.target.value;
        if (v === 'none') return onPick({ kind: 'none' });
        if (v === 'new') return onPick({ kind: 'new', name: newName(ing) });
        const id = Number(v.slice(1)), it = items.find((i) => i.id === id);
        onPick({ kind: 'item', id, alias: !!it && !(m.exact?.id === id || it.aliases.some((a) => itemKey(a) === itemKey(ing.name))) }); // a pick that is not already the same words offers to remember them
      }}>
        {m.exact && <option value={`i${m.exact.id}`}>In your list: {titleCase(m.exact.name)}</option>}
        {m.candidates.map((c) => <option key={c.item.id} value={`i${c.item.id}`}>{titleCase(c.item.name)} ({KIND[c.kind]})</option>)}
        {!m.exact && choice.kind === 'item' && !m.candidates.some((c) => c.item.id === choice.id) && <option value={`i${choice.id}`}>{titleCase(chosen?.name ?? 'Linked item')}</option>}
        <option value="new">A new item</option>
        <option value="none">Don't link</option>
      </select>
      {choice.kind === 'item' && chosen && !isExact && (
        <label className="flex min-h-[2.75rem] items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 shrink-0" checked={!!choice.alias} onChange={(e) => onPick({ ...choice, alias: e.target.checked })} />
          <span>Add “{ing.name}” as another name for <strong>{titleCase(chosen.name)}</strong> <span className="text-muted">(next time it links by itself)</span></span></label>
      )}
      {choice.kind === 'new' && <input className="input h-11" aria-label="Name of the new item" value={choice.name} onChange={(e) => onPick({ kind: 'new', name: e.target.value })} />}
    </div>
  );
}

/** One unsure line, asked as a question: "Is X the same as Y?" Yes links it (and remembers the wording), No makes it its own item. Anything else is one tap away. */
function Question({ ing, items, choice, onPick }: { ing: Ingredient; items: Item[]; choice: Choice; onPick(c: Choice): void }) {
  const [other, setOther] = useState(false);
  const m = matchItems(ing.name, items);
  const guess = m.candidates[0];
  if (!guess) return null;
  const yes = choice.kind === 'item' && choice.id === guess.item.id, no = choice.kind === 'new';
  return (
    <div className="space-y-2 py-3">
      <div className="text-sm"><span className="text-muted">Recipe says </span><strong className="font-semibold">{ing.raw}</strong></div>
      <div className="text-base">Is that the same as <strong>{titleCase(guess.item.name)}</strong>? <span className="text-xs text-muted">({KIND[guess.kind]})</span></div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" aria-pressed={yes} className={`btn h-11 ${yes ? 'btn-accent' : ''}`} onClick={() => onPick({ kind: 'item', id: guess.item.id, alias: true })}>Yes, the same</button>
        <button type="button" aria-pressed={no} className={`btn h-11 ${no ? 'btn-accent' : ''}`} onClick={() => onPick({ kind: 'new', name: newName(ing) })}>No, a different item</button>
      </div>
      {yes && <p className="text-xs text-muted">“{ing.name}” will link to {titleCase(guess.item.name)} by itself next time.</p>}
      {no && <input className="input h-11" aria-label="Name of the new item" value={choice.kind === 'new' ? choice.name : ''} onChange={(e) => onPick({ kind: 'new', name: e.target.value })} />}
      <button type="button" className="text-sm text-muted underline" onClick={() => setOther(!other)}>{other ? 'Hide other choices' : 'Something else…'}</button>
      {other && <Row ing={ing} items={items} choice={choice} onPick={onPick} />}
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
      <p className="text-sm text-muted">Everything is linked for you: {linked} to items you already have, {fresh} as new items. {attention.length ? `${attention.length} ${attention.length === 1 ? 'was' : 'were'} not sure, so ${attention.length === 1 ? 'it asks' : 'they ask'} below.` : 'Nothing needs checking.'} The recipe keeps its own wording.</p>
      <div className="divide-y divide-line">{rows.map((ing, i) => {
        const asks = attention.includes(ing), Comp = asks ? Question : Row;
        return <Comp key={`${ing.raw}-${i}`} ing={ing} items={items} choice={choices[ing.raw] ?? { kind: 'none' }} onPick={(c) => onChange({ ...choices, [ing.raw]: c })} />;
      })}</div>
      {ingredients.length > attention.length && <button type="button" className="btn btn-ghost h-11" onClick={() => setAll(!all)}>{all ? 'Show only the ones to check' : `Show all ${ingredients.length}`}</button>}
    </section>
  );
}
