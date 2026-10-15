import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, Plus, ShoppingCart } from 'lucide-react';
import { CATEGORIES, itemKey, parseIngredient, type Item } from '@turbopantry/shared';
import { ItemSheet } from '../components/ItemSheet.tsx';
import { LoadError } from '../components/SignInNotice.tsx';
import { Stepper } from '../components/Stepper.tsx';
import { useItems } from '../lib/data.ts';
import { toast } from '../lib/toast.ts';
import { useApi } from '../lib/useApi.ts';

const matches = (i: Item, q: string) => { const n = q.toLowerCase(); return i.name.toLowerCase().includes(n) || i.aliases.some((a) => a.toLowerCase().includes(n)); };

/** What is in the house. Type to find or add ("2kg flour" works), tap − + to change an amount, tap a name for its settings. */
export function PantryPage() {
  const api = useApi();
  const { items, error, set, reload, loading } = useItems();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Item | null>(null);

  const tracked = useMemo(() => items.filter((i) => i.tracked), [items]);
  const shown = q.trim() ? tracked.filter((i) => matches(i, q.trim())) : tracked;
  const low = tracked.filter((i) => !i.staple && i.minQty > 0 && i.qty <= i.minQty);
  const exact = q.trim() ? items.find((i) => itemKey(i.name) === itemKey(q) || i.aliases.some((a) => itemKey(a) === itemKey(q))) : null;
  const untracked = q.trim() ? items.filter((i) => !i.tracked && matches(i, q.trim())).slice(0, 3) : [];
  const groups = CATEGORIES.map((c) => ({ c, rows: shown.filter((i) => i.category === c).sort((a, b) => Number(a.qty === 0) - Number(b.qty === 0) || a.name.localeCompare(b.name)) })).filter((g) => g.rows.length);

  async function change(it: Item, qty: number) {
    const delta = qty - it.qty;
    if (!delta) return;
    set((cur) => (cur ?? []).map((x) => (x.id === it.id ? { ...x, qty } : x))); // the screen moves at once
    try { await api.adjustStock([{ itemId: it.id, delta }], 'manual'); } catch { reload(); }
  }

  async function add() {
    const text = q.trim();
    if (!text) return;
    const p = parseIngredient(text);
    const hasQty = p.quantity !== null;
    try {
      const made = await api.createItem({ name: hasQty ? p.name : text, ...(hasQty ? { qty: p.quantity!, unit: p.unit } : { qty: 1 }) }); // "milk" means one, "2kg flour" means two kilos
      toast(made.existed ? `${made.name} is already here` : `Added ${made.name}`);
      setQ(''); reload();
    } catch (e) { toast((e as Error).message); }
  }
  async function bring(it: Item) { try { await api.updateItem(it.id, { tracked: true, qty: it.qty || it.defaultQty }); toast(`${it.name} is in the pantry`); setQ(''); reload(); } catch (e) { toast((e as Error).message); } }
  async function toList(it: Item) { try { await api.addToList({ itemId: it.id }); toast(`Added ${it.name} to the list`); } catch (e) { toast((e as Error).message); } }

  return (
    <div className="space-y-4 pb-4">
      <h1 className="text-2xl font-bold">Pantry</h1>
      <form className="sticky top-14 z-10 -mx-1 flex gap-2 bg-bg/90 px-1 py-2 backdrop-blur md:top-16" onSubmit={(e) => { e.preventDefault(); if (!exact) void add(); }}>
        <input className="input h-12 flex-1 text-base" placeholder="Find or add: milk, 2kg flour…" aria-label="Find or add an item" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="done" autoCapitalize="none" />
        {q.trim() && !exact && <button className="btn btn-accent h-12 px-4" aria-label={`Add ${q.trim()}`}><Plus size={20} /></button>}
      </form>

      {error && !items.length && <LoadError error={error} />}
      {untracked.map((it) => (
        <button key={it.id} className="card flex min-h-[3.25rem] w-full items-center justify-between px-4 text-left" onClick={() => void bring(it)}>
          <span><span className="font-medium">{it.name}</span><span className="block text-sm text-muted">Known from a recipe, not in your pantry yet</span></span><span className="btn btn-accent !py-1.5">Add</span>
        </button>
      ))}

      {!q.trim() && low.length > 0 && (
        <section className="card space-y-2 p-3" aria-label="Running low">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={16} className="text-warn" />Running low</h2>
          <div className="flex flex-wrap gap-2">{low.map((it) => <button key={it.id} className="chip inline-flex min-h-[2.5rem] items-center gap-2 px-3" onClick={() => void toList(it)}>{it.name}<ShoppingCart size={14} /></button>)}</div>
        </section>
      )}

      {loading && !items.length && !error && <p className="text-sm text-muted">Loading…</p>}
      {!loading && !tracked.length && !q.trim() && (
        <div className="card space-y-1 p-8 text-center"><p className="font-medium">Nothing in the pantry yet</p><p className="text-sm text-muted">Type above to add what you have. “2kg flour” sets the amount too. Ticking things off the shopping list adds them here by itself.</p></div>
      )}

      {groups.map(({ c, rows }) => (
        <section key={c} aria-label={c} className="space-y-1">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">{c}</h2>
          <div className="card divide-y divide-line overflow-hidden">
            {rows.map((it) => (
              <div key={it.id} className="flex min-h-[3.5rem] items-center gap-2 pl-4 pr-1">
                <button className="flex min-w-0 flex-1 items-center gap-1 py-2 text-left" onClick={() => setOpen(it)} aria-label={`${it.name} settings`}>
                  <span className="min-w-0"><span className={it.qty === 0 ? 'block truncate text-muted' : 'block truncate font-medium'}>{it.name}</span>
                    {(it.staple || (it.minQty > 0 && it.qty <= it.minQty) || it.place) && <span className="block truncate text-xs text-muted">{[it.staple && 'always have', it.minQty > 0 && it.qty <= it.minQty && !it.staple && 'running low', it.place].filter(Boolean).join(' · ')}</span>}</span>
                  <ChevronRight size={14} className="shrink-0 text-muted" />
                </button>
                <Stepper label={it.name} value={it.qty} step={it.step} unit={it.unit} onChange={(v) => void change(it, v)} />
              </div>
            ))}
          </div>
        </section>
      ))}
      {q.trim() && !groups.length && !untracked.length && <p className="px-1 text-sm text-muted">Nothing called “{q.trim()}”. Press + to add it.</p>}
      {open && <ItemSheet key={open.id} item={items.find((i) => i.id === open.id) ?? open} onClose={() => setOpen(null)} onSaved={reload} />}
    </div>
  );
}
