import { useState } from 'react';
import { Check, HelpCircle, Link2, Plus } from 'lucide-react';
import { Select } from './Select.tsx';
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

/** What a choice means, in words a person would say. */
function describe(choice: Choice, items: Item[]): string {
  if (choice.kind === 'item') return titleCase(items.find((i) => i.id === choice.id)?.name ?? 'Linked item');
  if (choice.kind === 'new') return `New: ${choice.name || 'item'}`;
  return 'Not linked';
}

/** One line with every way to answer it, as a single menu. Used for the lines that were matched for you, and under "Something else…". */
function Row({ ing, items, choice, onPick, compact }: { ing: Ingredient; items: Item[]; choice: Choice; onPick(c: Choice): void; compact?: boolean }) {
  const m = matchItems(ing.name, items);
  const value = choice.kind === 'item' ? `i${choice.id}` : choice.kind === 'new' ? 'new' : 'none';
  const chosen = choice.kind === 'item' ? items.find((i) => i.id === choice.id) : undefined;
  const isExact = !!chosen && (m.exact?.id === chosen.id || chosen.aliases.some((a) => itemKey(a) === itemKey(ing.name)));
  const options = [
    ...(m.exact ? [{ value: `i${m.exact.id}`, label: `${titleCase(m.exact.name)} (same words)` }] : []),
    ...m.candidates.map((c) => ({ value: `i${c.item.id}`, label: `${titleCase(c.item.name)} (${KIND[c.kind]})` })),
    ...(!m.exact && choice.kind === 'item' && !m.candidates.some((c) => c.item.id === choice.id) ? [{ value: `i${choice.id}`, label: titleCase(chosen?.name ?? 'Linked item') }] : []),
    { value: 'new', label: 'Make a new item' },
    { value: 'none', label: "Don't link" },
  ];
  const pick = (v: string) => {
    if (v === 'none') return onPick({ kind: 'none' });
    if (v === 'new') return onPick({ kind: 'new', name: newName(ing) });
    const id = Number(v.slice(1)), it = items.find((i) => i.id === id);
    onPick({ kind: 'item', id, alias: !!it && !(m.exact?.id === id || it.aliases.some((a) => itemKey(a) === itemKey(ing.name))) }); // a pick that is not already the same words offers to remember them
  };
  return (
    <div className={compact ? 'space-y-2 py-2.5' : 'space-y-2 pt-2'}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-sm">{ing.raw}</span>
        <Select className="h-10 w-44 shrink-0 !py-0 text-sm" aria-label={`What is ${ing.raw}`} value={value} placeholder={describe(choice, items)} onChange={pick} options={options} />
      </div>
      {choice.kind === 'item' && chosen && !isExact && (
        <label className="flex min-h-[2.75rem] items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 shrink-0" checked={!!choice.alias} onChange={(e) => onPick({ ...choice, alias: e.target.checked })} />
          <span>Remember “{ing.name}” as another name for {titleCase(chosen.name)}</span></label>
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
    <div className="space-y-3 rounded-theme border border-line bg-raised p-3">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">The recipe says</div>
        <div className="text-base font-semibold">{ing.raw}</div>
      </div>
      <div className="text-base">Is that the same as <strong>{titleCase(guess.item.name)}</strong> from your pantry? <span className="text-sm text-muted">({guess.item.name.toLowerCase() === ing.name.toLowerCase() ? 'same words' : KIND[guess.kind]})</span></div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" aria-pressed={yes} className={`btn h-12 ${yes ? 'btn-accent' : ''}`} onClick={() => onPick({ kind: 'item', id: guess.item.id, alias: true })}>{yes && <Check size={16} className="mr-1.5 inline" />}Yes, same</button>
        <button type="button" aria-pressed={no} className={`btn h-12 ${no ? 'btn-accent' : ''}`} onClick={() => onPick({ kind: 'new', name: newName(ing) })}>{no && <Check size={16} className="mr-1.5 inline" />}No, different</button>
      </div>
      {yes && <p className="text-sm text-muted">Done. “{ing.name}” will link to {titleCase(guess.item.name)} by itself next time.</p>}
      {no && <label className="block text-sm"><span className="mb-1 block text-muted">It becomes a new item called</span><input className="input h-11" aria-label="Name of the new item" value={choice.kind === 'new' ? choice.name : ''} onChange={(e) => onPick({ kind: 'new', name: e.target.value })} /></label>}
      <button type="button" className="min-h-[2.5rem] text-sm text-muted underline" onClick={() => setOther(!other)}>{other ? 'Hide other choices' : 'Pick a different item…'}</button>
      {other && <Row ing={ing} items={items} choice={choice} onPick={onPick} />}
    </div>
  );
}

/**
 * Links a recipe's lines to the household's items. The lines that could be something you already have come first, as questions; everything
 * else is already matched and only listed (one menu per line) if you want to look. The kind of ingredient matters: a recipe's "fettuccine" is
 * offered the item "Pasta" as "less specific", and stays its own item unless you say otherwise.
 */
export function IngredientLinker({ ingredients, items, choices, onChange }: { ingredients: Ingredient[]; items: Item[]; choices: Choices; onChange(c: Choices): void }) {
  const [all, setAll] = useState(false);
  const attention = ingredients.filter((i) => !matchItems(i.name, items).exact && matchItems(i.name, items).candidates.length > 0);
  const rest = ingredients.filter((i) => !attention.includes(i));
  const linked = ingredients.filter((i) => choices[i.raw]?.kind === 'item').length;
  const fresh = ingredients.filter((i) => choices[i.raw]?.kind === 'new').length;
  const pick = (ing: Ingredient) => (c: Choice) => onChange({ ...choices, [ing.raw]: c });
  return (
    <section className="space-y-4" aria-label="Link to your items">
      <p className="text-sm text-muted">Each line of the recipe is matched to something in your pantry, so the shopping list and “I cooked this” know what it is. The recipe keeps its own wording.</p>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="chip inline-flex items-center gap-1.5"><Link2 size={14} />{linked} matched</span>
        <span className="chip inline-flex items-center gap-1.5"><Plus size={14} />{fresh} new</span>
        {attention.length > 0 && <span className="chip inline-flex items-center gap-1.5 !bg-warn/20"><HelpCircle size={14} />{attention.length} to check</span>}
      </div>
      {attention.length > 0 && (
        <div className="space-y-2.5">
          <h2 className="font-semibold">Please check {attention.length === 1 ? 'this one' : 'these'}</h2>
          {attention.map((ing, i) => <Question key={`${ing.raw}-${i}`} ing={ing} items={items} choice={choices[ing.raw] ?? { kind: 'none' }} onPick={pick(ing)} />)}
        </div>
      )}
      {!attention.length && <p className="rounded-theme bg-good/15 p-3 text-sm"><Check size={14} className="mr-1.5 inline" />Nothing needs checking.</p>}
      {rest.length > 0 && (
        <div>
          <button type="button" className="btn btn-ghost h-11 w-full justify-between" aria-expanded={all} onClick={() => setAll(!all)}><span>All the other lines ({rest.length})</span><span className="text-sm text-muted">{all ? 'Hide' : 'Show'}</span></button>
          {all && <div className="divide-y divide-line">{rest.map((ing, i) => <Row key={`${ing.raw}-${i}`} compact ing={ing} items={items} choice={choices[ing.raw] ?? { kind: 'none' }} onPick={pick(ing)} />)}</div>}
        </div>
      )}
    </section>
  );
}
