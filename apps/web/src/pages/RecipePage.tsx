import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Clock, ExternalLink, Hash, Minus, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { highlightStep, ingredientParts, type Ingredient, type Recipe } from '@turbopantry/shared';
import { LoadError } from '../components/SignInNotice.tsx';
import { RecipeImage } from './RecipesPage.tsx';
import { useApi, useLoad } from '../lib/useApi.ts';
import { useStore } from '../lib/store.ts';
import { cn } from '../lib/cn.ts';

const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

function Ingredients({ items, factor, showQuantities }: { items: Ingredient[]; factor: number; showQuantities: boolean }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setDone((d) => { const n = new Set(d); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  let section: string | null | undefined;
  return (
    <ul className="space-y-1">
      {items.map((it, i) => {
        const head = it.section !== section && it.section ? <li key={`h${i}`} className="pt-3 text-xs font-semibold uppercase tracking-wider text-muted">{it.section}</li> : null;
        section = it.section;
        return [head, (
          <li key={i}><label className="flex min-h-[2.25rem] cursor-pointer items-start gap-3 py-1">
            <input type="checkbox" className="mt-1.5 h-4 w-4" checked={done.has(i)} onChange={() => toggle(i)} />
            <span className={cn(done.has(i) && 'text-muted line-through')}>{(() => {
              const p = ingredientParts(it, factor);
              return <>{showQuantities && p.amount && <strong className="font-semibold tabular-nums">{p.amount} </strong>}{p.name}{p.note && <span className="text-muted">, {p.note}</span>}</>;
            })()}</span>
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
  const { data: r, error } = useLoad(() => api.getRecipe(id), [api, id]);
  const [servings, setServings] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const showQuantities = useStore((st) => st.settings.showQuantities);
  const updateSettings = useStore((st) => st.updateSettings);

  if (error) return <LoadError error={error} />;
  if (!r) return <p className="text-sm text-muted">Loading…</p>;

  const base = r.servings ?? 0;
  const shown = servings ?? base;
  const factor = base > 0 ? shown / base : 1;
  // 0 means "not given" (some sources write "0 min"): never show it
  const prep = r.prepMinutes || null, cook = r.cookMinutes || null;
  const total = r.totalMinutes || (prep || cook ? (prep ?? 0) + (cook ?? 0) : null);

  async function remove(recipe: Recipe) {
    if (!window.confirm(`Delete “${recipe.title}”? This cannot be undone.`)) return;
    setDeleting(true);
    try { await api.deleteRecipe(recipe.id); nav('/recipes'); } catch { setDeleting(false); }
  }

  return (
    <article className="mx-auto max-w-3xl space-y-5">
      {r.imageUrl && <RecipeImage url={r.imageUrl} className="max-h-80 w-full rounded-theme" />}
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{r.title}</h1>
        {r.description && <p className="text-muted">{r.description}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          {total !== null && <span className="inline-flex items-center gap-1"><Clock size={14} />{mins(total)}{prep && cook ? ` (prep ${mins(prep)}, cook ${mins(cook)})` : ''}</span>}
          {r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline"><ExternalLink size={14} />{r.sourceName ?? 'Source'}</a>}
        </div>
        {r.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{r.tags.map((t) => <span key={t} className="chip">{t}</span>)}</div>}
        <div className="flex gap-2 pt-1">
          <Link to={`/recipes/${r.id}/edit`} className="btn"><Pencil size={15} />Edit</Link>
          <button className="btn" onClick={() => void remove(r)} disabled={deleting}><Trash2 size={15} />Delete</button>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Ingredients</h2>
            <div className="flex items-center gap-2">
              {base > 0 && showQuantities && (
                <div className="flex items-center gap-1 text-sm" role="group" aria-label="Servings">
                  <button className="btn btn-ghost !p-2" aria-label="Fewer servings" onClick={() => setServings(Math.max(1, shown - 1))}><Minus size={16} /></button>
                  <span className="inline-flex min-w-[5.5rem] items-center justify-center gap-1 tabular-nums"><Users size={13} />{shown} {shown === 1 ? 'serving' : 'servings'}</span>
                  <button className="btn btn-ghost !p-2" aria-label="More servings" onClick={() => setServings(shown + 1)}><Plus size={16} /></button>
                </div>
              )}
              <button type="button" className="chip inline-flex min-h-[2.25rem] items-center gap-1 px-3" aria-pressed={showQuantities} title={showQuantities ? 'Hide the amounts' : 'Show the amounts'}
                onClick={() => updateSettings({ showQuantities: !showQuantities })}><Hash size={14} />{showQuantities ? 'Amounts on' : 'Amounts off'}</button>
            </div>
          </div>
          {r.ingredients.length ? <Ingredients items={r.ingredients} factor={factor} showQuantities={showQuantities} /> : <p className="text-sm text-muted">No ingredients.</p>}
        </section>
        <section className="space-y-3">
          <h2 className="font-semibold">Method</h2>
          {r.steps.length ? <ol className="space-y-3">{r.steps.map((s, i) => <li key={i} className="flex gap-3"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg">{i + 1}</span><span>{highlightStep(s, r.ingredients, { hideQuantities: !showQuantities }).map((seg, k) => (seg.bold ? <strong key={k} className="font-semibold">{seg.text}</strong> : <span key={k}>{seg.text}</span>))}</span></li>)}</ol>
            : <p className="text-sm text-muted">No method written down.</p>}
          {r.notes && <div className="card p-3 text-sm"><div className="mb-1 font-semibold">Notes</div><p className="whitespace-pre-line">{r.notes}</p></div>}
        </section>
      </div>
    </article>
  );
}
