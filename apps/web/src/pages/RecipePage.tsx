import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChefHat, Clock, ExternalLink, Hash, Link2, Minus, Pencil, Plus, ShoppingCart, Trash2, Users } from 'lucide-react';
import { UNIT_MODES, displayAmount, highlightStep, prettyStock, stockStatus, type Ingredient, type Item, type Recipe, type StockStatus } from '@turbopantry/shared';
import { CookSheet } from '../components/CookSheet.tsx';
import { defaultChoices, IngredientLinker, resolveLinks, type Choices } from '../components/IngredientLinker.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { LoadError } from '../components/SignInNotice.tsx';
import { RecipeImage } from './RecipesPage.tsx';
import { useItems } from '../lib/data.ts';
import { toast } from '../lib/toast.ts';
import { useApi, useLoad } from '../lib/useApi.ts';
import { useStore } from '../lib/store.ts';
import { cn } from '../lib/cn.ts';

const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

/** "have it", "have 3 of 5", "missing" next to a line, from the pantry. Says nothing for lines it cannot judge. */
function StockChip({ st, item }: { st: StockStatus; item?: Item }) {
  if (st.state === 'unlinked' || st.state === 'staple') return null;
  const base = 'ml-2 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium';
  if (st.state === 'enough') return <span className={cn(base, 'bg-good/15 text-good')}>have it</span>;
  if (st.state === 'some') return <span className={cn(base, 'bg-warn/15 text-warn')}>have {prettyStock(st.have ?? 0, st.unit)}</span>;
  if (st.state === 'none') return <span className={cn(base, 'bg-bad/15 text-bad')}>{item?.qty ? 'not enough' : 'none'}</span>;
  return <span className={cn(base, 'bg-raised text-muted')} title="Its amount cannot be compared with what is in stock">have {prettyStock(st.have ?? 0, st.unit)}</span>;
}

function IngredientList({ items, factor, showQuantities, mode, byId }: { items: Ingredient[]; factor: number; showQuantities: boolean; mode: 'original' | 'metric-cups' | 'metric-grams'; byId: Map<number, Item> }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setDone((d) => { const n = new Set(d); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  let section: string | null | undefined;
  return (
    <ul className="space-y-1">
      {items.map((it, i) => {
        const head = it.section !== section && it.section ? <li key={`h${i}`} className="pt-3 text-xs font-semibold uppercase tracking-wider text-muted">{it.section}</li> : null;
        section = it.section;
        const item = it.itemId ? byId.get(it.itemId) : undefined;
        const amount = showQuantities ? displayAmount(it, factor, mode, item?.gramsPerCup ?? null).amount : '';
        const st = stockStatus(it, factor, item);
        return [head, (
          <li key={i}><label className="flex min-h-[2.75rem] cursor-pointer items-start gap-3 py-1.5">
            <input type="checkbox" className="mt-1.5 h-5 w-5 shrink-0" checked={done.has(i)} onChange={() => toggle(i)} />
            <span className={cn('min-w-0', done.has(i) && 'text-muted line-through')}>
              {amount && <strong className="font-semibold tabular-nums">{amount} </strong>}{it.quantity === null ? it.raw : it.name}{it.quantity !== null && it.note && <span className="text-muted">, {it.note}</span>}
              <StockChip st={st} item={item} />
            </span>
          </label></li>
        )];
      })}
    </ul>
  );
}

export function RecipePage() {
  const id = Number(useParams().id);
  const api = useApi();
  const nav = useNavigate();
  const { data: r, error, reload } = useLoad(() => api.getRecipe(id), [api, id]);
  const { items, byId, reload: reloadItems } = useItems();
  const [servings, setServings] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sheet, setSheet] = useState<'cook' | 'link' | null>(null);
  const [choices, setChoices] = useState<Choices>({});
  const showQuantities = useStore((st) => st.settings.showQuantities);
  const mode = useStore((st) => st.settings.unitMode);
  const updateSettings = useStore((st) => st.updateSettings);

  const base = r?.servings ?? 0;
  const shown = servings ?? base;
  const factor = base > 0 ? shown / base : 1;
  const statuses = useMemo(() => (r ? r.ingredients.map((ing) => stockStatus(ing, factor, ing.itemId ? byId.get(ing.itemId) : undefined)) : []), [r, factor, byId]);

  if (error) return <LoadError error={error} />;
  if (!r) return <p className="text-sm text-muted">Loading…</p>;

  // 0 means "not given" (some sources write "0 min"): never show it
  const prep = r.prepMinutes || null, cook = r.cookMinutes || null;
  const total = r.totalMinutes || (prep || cook ? (prep ?? 0) + (cook ?? 0) : null);
  const needed = statuses.filter((s) => s.state !== 'enough' && s.state !== 'staple').length;
  const unlinked = statuses.filter((s) => s.state === 'unlinked').length;

  async function remove(recipe: Recipe) {
    if (!window.confirm(`Delete “${recipe.title}”? This cannot be undone.`)) return;
    setDeleting(true);
    try { await api.deleteRecipe(recipe.id); nav('/recipes'); } catch { setDeleting(false); }
  }
  async function addMissing() {
    try {
      const res = await api.addFromRecipe(r!.id, shown || null);
      toast(res.added.length ? `Added ${res.added.length} to the list${res.skipped.length ? `, left off ${res.skipped.length} you have` : ''}${res.checkStock.length ? `. Check amounts: ${res.checkStock.join(', ')}` : ''}` : 'You have everything');
    } catch (e) { toast((e as Error).message); }
  }
  async function saveLinks() {
    try {
      const linked = await resolveLinks(api, r!.ingredients, choices, items);
      await api.updateRecipe(r!.id, { ...r!, ingredients: linked });
      toast('Linked'); setSheet(null); reload(); reloadItems();
    } catch (e) { toast((e as Error).message); }
  }

  return (
    <article className="mx-auto max-w-3xl space-y-5 pb-24">
      {r.imageUrl && <RecipeImage url={r.imageUrl} className="max-h-80 w-full rounded-theme" />}
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{r.title}</h1>
        {r.description && <p className="text-muted">{r.description}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          {total !== null && <span className="inline-flex items-center gap-1"><Clock size={14} />{mins(total)}{prep && cook ? ` (prep ${mins(prep)}, cook ${mins(cook)})` : ''}</span>}
          {r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline"><ExternalLink size={14} />{r.sourceName ?? 'Source'}</a>}
        </div>
        {r.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{r.tags.map((t) => <span key={t} className="chip">{t}</span>)}</div>}
        <div className="flex flex-wrap gap-2 pt-1">
          <Link to={`/recipes/${r.id}/edit`} className="btn h-11"><Pencil size={15} />Edit</Link>
          <button className="btn h-11" onClick={() => { setChoices(defaultChoices(r.ingredients, items)); setSheet('link'); }}><Link2 size={15} />Link items{unlinked ? ` (${unlinked})` : ''}</button>
          <button className="btn h-11" onClick={() => void remove(r)} disabled={deleting}><Trash2 size={15} />Delete</button>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Ingredients</h2>
            {base > 0 && showQuantities && (
              <div className="flex items-center gap-1 text-sm" role="group" aria-label="Servings">
                <button className="btn btn-ghost flex h-11 w-11 items-center justify-center !p-0" aria-label="Fewer servings" onClick={() => setServings(Math.max(1, shown - 1))}><Minus size={16} /></button>
                <span className="inline-flex min-w-[5.5rem] items-center justify-center gap-1 tabular-nums"><Users size={13} />{shown} {shown === 1 ? 'serving' : 'servings'}</span>
                <button className="btn btn-ghost flex h-11 w-11 items-center justify-center !p-0" aria-label="More servings" onClick={() => setServings(shown + 1)}><Plus size={16} /></button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="How amounts are shown">
            <button type="button" className="chip inline-flex min-h-[2.5rem] items-center gap-1 px-3" aria-pressed={showQuantities} onClick={() => updateSettings({ showQuantities: !showQuantities })}><Hash size={14} />{showQuantities ? 'Amounts on' : 'Amounts off'}</button>
            {showQuantities && (
              <select className="input h-10 !w-auto !py-0 text-sm" aria-label="Units" value={mode} onChange={(e) => updateSettings({ unitMode: e.target.value as typeof mode })}>
                {UNIT_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            )}
          </div>
          {r.ingredients.length ? <IngredientList items={r.ingredients} factor={factor} showQuantities={showQuantities} mode={mode} byId={byId} /> : <p className="text-sm text-muted">No ingredients.</p>}
        </section>
        <section className="space-y-3">
          <h2 className="font-semibold">Method</h2>
          {r.steps.length ? <ol className="space-y-3">{r.steps.map((s, i) => <li key={i} className="flex gap-3"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg">{i + 1}</span><span>{highlightStep(s, r.ingredients, { hideQuantities: !showQuantities }).map((seg, k) => (seg.bold ? <strong key={k} className="font-semibold">{seg.text}</strong> : <span key={k}>{seg.text}</span>))}</span></li>)}</ol>
            : <p className="text-sm text-muted">No method written down.</p>}
          {r.notes && <div className="card p-3 text-sm"><div className="mb-1 font-semibold">Notes</div><p className="whitespace-pre-line">{r.notes}</p></div>}
        </section>
      </div>

      {/* thumb-reach actions: on a phone they stay above the bottom bar */}
      <div className="sticky bottom-2 z-10 flex gap-2">
        <button className="btn btn-accent h-12 flex-1 shadow-lg" onClick={() => void addMissing()}><ShoppingCart size={18} />{needed ? `Add ${needed} to the list` : 'You have everything'}</button>
        <button className="btn h-12 flex-1 shadow-lg" onClick={() => setSheet('cook')}><ChefHat size={18} />I cooked this</button>
      </div>

      {sheet === 'cook' && <CookSheet recipe={r} factor={factor} byId={byId} onClose={() => { setSheet(null); reloadItems(); }} />}
      {sheet === 'link' && (
        <Sheet title="Link items" onClose={() => setSheet(null)} footer={<button className="btn btn-accent h-12 w-full" onClick={() => void saveLinks()}>Save links</button>}>
          <IngredientLinker ingredients={r.ingredients} items={items} choices={choices} onChange={setChoices} />
        </Sheet>
      )}
    </article>
  );
}
