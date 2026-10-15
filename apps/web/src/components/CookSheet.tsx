import { useMemo, useState } from 'react';
import { Check, ShoppingCart } from 'lucide-react';
import { fineStep, prettyStock, stockStatus, type Ingredient, type Item, type Recipe } from '@turbopantry/shared';
import { Sheet } from './Sheet.tsx';
import { Stepper } from './Stepper.tsx';
import { toast } from '../lib/toast.ts';
import { useApi } from '../lib/useApi.ts';

interface Line { index: number; ing: Ingredient; item: Item; use: number; on: boolean }

/**
 * "I cooked this": proposes taking what the recipe used out of the pantry, and you change or remove anything you did not use (untick it, or
 * tap − + for a different amount). Nothing changes until you confirm, and the confirmation can be undone. Afterwards, what is now running low
 * can go straight on the list.
 */
export function CookSheet({ recipe, factor, byId, onClose }: { recipe: Recipe; factor: number; byId: Map<number, Item>; onClose(): void }) {
  const api = useApi();
  const initial = useMemo<Line[]>(() => recipe.ingredients.flatMap((ing, index) => {
    const item = ing.itemId ? byId.get(ing.itemId) : undefined;
    if (!item || item.staple) return [];
    const st = stockStatus(ing, factor, item);
    if (st.need === null) return [];
    const use = Math.round(Math.min(st.need, item.qty) * 1000) / 1000;
    return [{ index, ing, item, use, on: use > 0 }];
  }), [recipe, factor, byId]);
  const [lines, setLines] = useState(initial);
  const [done, setDone] = useState<Item[] | null>(null);
  const [undo, setUndo] = useState<{ itemId: number; delta: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const skipped = recipe.ingredients.length - initial.length;

  const patch = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const changes = lines.filter((l) => l.on && l.use > 0).map((l) => ({ itemId: l.item.id, delta: -l.use }));

  async function confirm() {
    if (!changes.length) { onClose(); return; }
    setBusy(true);
    try {
      const r = await api.adjustStock(changes, 'cooked', recipe.id);
      const used = r.applied.map((a) => ({ itemId: a.itemId, delta: -a.delta })).filter((a) => a.delta !== 0);
      setUndo(used);
      setDone(r.items.filter((i) => i.tracked && !i.staple && i.minQty > 0 && i.qty <= i.minQty));
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  }
  async function toList(it: Item) { try { await api.addToList({ itemId: it.id }); toast(`Added ${it.name} to the list`); setDone((d) => (d ?? []).filter((x) => x.id !== it.id)); } catch (e) { toast((e as Error).message); } }

  if (done) return (
    <Sheet title="Done" onClose={onClose} footer={<button className="btn btn-accent h-11 w-full" onClick={onClose}>Close</button>}>
      <p className="flex items-center gap-2"><Check size={18} className="text-good" />Took {undo?.length ?? 0} {undo?.length === 1 ? 'thing' : 'things'} out of the pantry.</p>
      {undo && undo.length > 0 && <button className="btn h-11" onClick={async () => { await api.adjustStock(undo, 'undo', recipe.id); toast('Put back'); onClose(); }}>Undo</button>}
      {done.length > 0 && <div className="space-y-2"><p className="text-sm font-medium">Running low now</p><div className="flex flex-wrap gap-2">{done.map((it) => <button key={it.id} className="chip inline-flex min-h-[2.5rem] items-center gap-2 px-3" onClick={() => void toList(it)}>{it.name}<ShoppingCart size={14} /></button>)}</div></div>}
    </Sheet>
  );
  return (
    <Sheet title="I cooked this" onClose={onClose} footer={<button className="btn btn-accent h-12 w-full" disabled={busy} onClick={() => void confirm()}>{changes.length ? `Take ${changes.length} from the pantry` : 'Nothing to take out'}</button>}>
      <p className="text-sm text-muted">Untick anything you did not use, or change the amount.</p>
      {lines.length === 0 && <p className="text-sm">None of this recipe's ingredients are tracked in your pantry yet, so there is nothing to take out.</p>}
      <div className="divide-y divide-line">
        {lines.map((l, i) => (
          <div key={l.index} className="flex min-h-[3.5rem] items-center gap-3 py-1">
            <label className="flex min-w-0 flex-1 items-center gap-3"><input type="checkbox" className="h-5 w-5 shrink-0" checked={l.on} onChange={(e) => patch(i, { on: e.target.checked })} aria-label={`Used ${l.item.name}`} />
              <span className="min-w-0"><span className="block truncate font-medium">{l.item.name}</span><span className="block text-xs text-muted">have {prettyStock(l.item.qty, l.item.unit)}</span></span></label>
            {l.on && <Stepper label={l.item.name} value={l.use} step={fineStep(l.item.unit)} unit={l.item.unit} max={l.item.qty} onChange={(v) => patch(i, { use: v })} />}
          </div>
        ))}
      </div>
      {skipped > 0 && lines.length > 0 && <p className="text-xs text-muted">{skipped} other {skipped === 1 ? 'ingredient is' : 'ingredients are'} not taken out: staples, things not tracked, or amounts that cannot be compared.</p>}
    </Sheet>
  );
}
