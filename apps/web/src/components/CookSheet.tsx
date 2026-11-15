import { useMemo, useState } from 'react';
import { Check, ShoppingCart } from 'lucide-react';
import { fineStep, prettyStock, stockStatus, type Ingredient, type Item, type Recipe, titleCase } from '@turbopantry/shared';
import { Sheet } from './Sheet.tsx';
import { Stepper } from './Stepper.tsx';
import { BigStepper } from './EasySheets.tsx';
import { useEasy } from '../lib/easy.ts';
import { toast } from '../lib/toast.ts';
import { useApi } from '../lib/useApi.ts';

interface Line { index: number; ing: Ingredient; item: Item; /** what the recipe calls for, in the item's unit */ need: number; /** how much is left after cooking: the number the person confirms or changes */ left: number }

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * "I cooked this": for each ingredient you track, how much do you have NOW? It starts at what you had minus what the recipe calls for, and you just
 * correct it (a recipe is a guess; you know what is really left). Nothing changes until you confirm, and the confirmation can be undone. In easy mode the
 * questions come one at a time in a simple popup. Afterwards, what is now running low can go straight on the list.
 */
export function CookSheet({ recipe, factor, byId, onClose }: { recipe: Recipe; factor: number; byId: Map<number, Item>; onClose(): void }) {
  const api = useApi();
  const easy = useEasy();
  const initial = useMemo<Line[]>(() => recipe.ingredients.flatMap((ing, index) => {
    const item = ing.itemId ? byId.get(ing.itemId) : undefined;
    if (!item) return [];
    const st = stockStatus(ing, factor, item);
    if (st.need === null) return [];
    return [{ index, ing, item, need: st.need, left: round3(Math.max(0, item.qty - st.need)) }];
  }), [recipe, factor, byId]);
  const [lines, setLines] = useState(initial);
  const [done, setDone] = useState<Item[] | null>(null);
  const [undo, setUndo] = useState<{ itemId: number; delta: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState(0); // easy mode: which question
  const skipped = recipe.ingredients.length - initial.length;

  const patch = (i: number, left: number) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, left } : l)));
  const changes = lines.filter((l) => round3(l.left - l.item.qty) !== 0).map((l) => ({ itemId: l.item.id, delta: round3(l.left - l.item.qty) }));

  async function confirm() {
    if (!changes.length) { onClose(); return; }
    setBusy(true);
    try {
      const r = await api.adjustStock(changes, 'cooked', recipe.id);
      const used = r.applied.map((a) => ({ itemId: a.itemId, delta: -a.delta })).filter((a) => a.delta !== 0);
      setUndo(used);
      setDone(r.items.filter((i) => i.tracked && i.minQty > 0 && i.qty <= i.minQty));
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  }
  async function toList(it: Item) { try { await api.addToList({ itemId: it.id }); toast(`Added ${titleCase(it.name)} to the list`); setDone((d) => (d ?? []).filter((x) => x.id !== it.id)); } catch (e) { toast((e as Error).message); } }

  if (done) return (
    <Sheet title="Done" onClose={onClose} footer={<button className="btn btn-accent h-11 w-full" onClick={onClose}>Close</button>}>
      <p className="flex items-center gap-2"><Check size={18} className="text-good" />Updated {undo?.length ?? 0} {undo?.length === 1 ? 'thing' : 'things'} in the pantry.</p>
      {undo && undo.length > 0 && <button className="btn h-11" onClick={async () => { await api.adjustStock(undo, 'undo', recipe.id); toast('Put back'); onClose(); }}>Undo</button>}
      {done.length > 0 && <div className="space-y-2"><p className="text-sm font-medium">Running low now</p><div className="flex flex-wrap gap-2">{done.map((it) => <button key={it.id} className="chip inline-flex min-h-[2.5rem] items-center gap-2 px-3" onClick={() => void toList(it)}>{it.name}<ShoppingCart size={14} /></button>)}</div></div>}
    </Sheet>
  );

  if (easy && lines.length > 0) { // one question at a time
    const l = lines[at]!, last = at === lines.length - 1;
    return (
      <Sheet title={`I cooked this · ${at + 1} of ${lines.length}`} onClose={onClose} footer={
        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <button className="btn easy-action" disabled={at === 0} onClick={() => setAt(at - 1)}>Back</button>
          {last ? <button className="btn btn-accent easy-action" disabled={busy} onClick={() => void confirm()}>{changes.length ? 'Save' : 'Done'}</button> : <button className="btn btn-accent easy-action" onClick={() => setAt(at + 1)}>Next</button>}
        </div>}>
        <p className="text-center text-xl font-semibold">{titleCase(l.item.name)}</p>
        <p className="text-center text-base text-muted">You had {prettyStock(l.item.qty, l.item.unit)}. The recipe uses about {prettyStock(l.need, l.item.unit)}.</p>
        <p className="text-center text-base font-medium">How much is left?</p>
        <BigStepper label={titleCase(l.item.name)} value={l.left} step={fineStep(l.item.unit)} unit={l.item.unit} onChange={(v) => patch(at, v)} />
      </Sheet>
    );
  }

  return (
    <Sheet title="I cooked this" onClose={onClose} footer={<button className="btn btn-accent h-12 w-full" disabled={busy} onClick={() => void confirm()}>{changes.length ? `Update ${changes.length} in the pantry` : 'Nothing to change'}</button>}>
      <p className="text-sm text-muted">How much do you have <strong>now</strong>? Each starts at what you had minus what the recipe calls for. Change it to what is really left.</p>
      {lines.length === 0 && <p className="text-sm">None of this recipe's ingredients are tracked in your pantry yet, so there is nothing to update.</p>}
      <div className="divide-y divide-line">
        {lines.map((l, i) => (
          <div key={l.index} className="flex min-h-[3.5rem] items-center gap-3 py-1.5">
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{titleCase(l.item.name)}</span><span className="block text-xs text-muted">had {prettyStock(l.item.qty, l.item.unit)} · recipe uses {prettyStock(l.need, l.item.unit)}</span></span>
            <Stepper label={`${titleCase(l.item.name)} left`} value={l.left} step={fineStep(l.item.unit)} unit={l.item.unit} onChange={(v) => patch(i, v)} />
          </div>
        ))}
      </div>
      {skipped > 0 && lines.length > 0 && <p className="text-xs text-muted">{skipped} other {skipped === 1 ? 'ingredient is' : 'ingredients are'} not listed: things not tracked in the pantry, or amounts that cannot be compared.</p>}
    </Sheet>
  );
}
