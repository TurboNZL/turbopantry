import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { CATEGORIES, formatStock, itemKey, parseIngredient, type Item, type ListEntry } from '@turbopantry/shared';
import { LoadError } from '../components/SignInNotice.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { Stepper } from '../components/Stepper.tsx';
import { useItems, useListEntries } from '../lib/data.ts';
import { toast } from '../lib/toast.ts';
import { useApi } from '../lib/useApi.ts';
import { cn } from '../lib/cn.ts';

const matches = (i: Item, q: string) => { const n = q.toLowerCase(); return i.name.toLowerCase().includes(n) || i.aliases.some((a) => a.toLowerCase().includes(n)); };

function EntrySheet({ entry, item, onClose, onChanged }: { entry: ListEntry; item?: Item; onClose(): void; onChanged(): void }) {
  const api = useApi();
  const [qty, setQty] = useState(entry.qty ?? 0);
  const [note, setNote] = useState(entry.note);
  async function save() { try { await api.updateEntry(entry.id, { qty: entry.qty === null && qty === 0 ? null : qty, note }); onChanged(); onClose(); } catch (e) { toast((e as Error).message); } }
  async function remove() { try { await api.deleteEntry(entry.id); onChanged(); onClose(); } catch (e) { toast((e as Error).message); } }
  return (
    <Sheet title={entry.name} onClose={onClose} footer={<div className="flex gap-2"><button className="btn h-11 !px-3" aria-label="Remove from the list" onClick={() => void remove()}><Trash2 size={18} /></button><button className="btn btn-accent h-11 flex-1" onClick={() => void save()}>Done</button></div>}>
      <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">How much</span><Stepper label="amount" value={qty} step={item?.step ?? 1} unit={entry.unit} onChange={setQty} /></div>
      <label className="block"><span className="mb-1 block text-sm font-medium">Note</span><input className="input h-11" value={note} onChange={(e) => setNote(e.target.value)} placeholder="the tasty one, the big pack…" /></label>
    </Sheet>
  );
}

/** The shared shopping list. Adding is one tap (suggestions carry their default amount), ticking puts it in the pantry, and everything is live between phones. */
export function ShoppingPage() {
  const api = useApi();
  const { entries, error, set, reload, loading } = useListEntries();
  const { items, byId, reload: reloadItems } = useItems();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<ListEntry | null>(null);
  const [showDone, setShowDone] = useState(false);

  const open = entries.filter((e) => !e.checked), done = entries.filter((e) => e.checked);
  const onList = new Set(open.map((e) => e.itemId).filter((x): x is number => x !== null));
  const text = q.trim();
  const sugg = useMemo(() => (text ? items.filter((i) => matches(i, text) && !onList.has(i.id)).sort((a, b) => Number(b.tracked) - Number(a.tracked) || a.name.localeCompare(b.name)).slice(0, 6) : []), [items, text, entries]); // eslint-disable-line react-hooks/exhaustive-deps
  const exact = text ? items.find((i) => itemKey(i.name) === itemKey(text) || i.aliases.some((a) => itemKey(a) === itemKey(text))) : null;
  const low = items.filter((i) => i.tracked && !i.staple && i.minQty > 0 && i.qty <= i.minQty && !onList.has(i.id));
  const groups = CATEGORIES.map((c) => ({ c, rows: open.filter((e) => e.category === c) })).filter((g) => g.rows.length);

  async function addItem(it: Item) { try { await api.addToList({ itemId: it.id }); setQ(''); reload(); } catch (e) { toast((e as Error).message); } }
  async function addText() {
    if (!text) return;
    if (exact) return addItem(exact);
    const p = parseIngredient(text);
    try { await api.addToList({ name: p.quantity !== null ? p.name : text, ...(p.quantity !== null ? { qty: p.quantity, unit: p.unit } : { qty: null }) }); setQ(''); reload(); } catch (e) { toast((e as Error).message); }
  }

  async function tick(e: ListEntry, checked: boolean) {
    set((cur) => (cur ?? []).map((x) => (x.id === e.id ? { ...x, checked } : x)));
    try {
      const r = await api.updateEntry(e.id, { checked });
      reloadItems();
      if (r.stock && checked) toast(`${e.name} is in the pantry`, async () => { await api.updateEntry(e.id, { checked: false }); reload(); reloadItems(); });
    } catch { reload(); }
  }
  async function step(e: ListEntry, qty: number) {
    set((cur) => (cur ?? []).map((x) => (x.id === e.id ? { ...x, qty } : x)));
    try { await api.updateEntry(e.id, { qty }); } catch { reload(); }
  }
  async function clear() { try { const r = await api.clearChecked(); toast(`Cleared ${r.removed}`); setShowDone(false); reload(); } catch (e) { toast((e as Error).message); } }

  return (
    <div className="space-y-4 pb-4">
      <h1 className="text-2xl font-bold">Shopping</h1>
      <form className="sticky top-14 z-10 -mx-1 bg-bg/90 px-1 py-2 backdrop-blur md:top-16" onSubmit={(e) => { e.preventDefault(); void addText(); }}>
        <div className="flex gap-2">
          <input className="input h-12 flex-1 text-base" placeholder="Add something: milk, 2kg flour…" aria-label="Add to the list" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="done" autoCapitalize="none" />
          {text && <button className="btn btn-accent h-12 px-4" aria-label={`Add ${text}`}><Plus size={20} /></button>}
        </div>
        {text && sugg.length > 0 && (
          <div className="bt-menu mt-2 overflow-hidden" role="listbox" aria-label="Suggestions">
            {sugg.map((it) => (
              <button key={it.id} type="button" role="option" aria-selected="false" className="flex min-h-[3rem] w-full items-center justify-between px-4 text-left" onClick={() => void addItem(it)}>
                <span className="min-w-0 truncate">{it.name}</span><span className="shrink-0 text-sm text-muted">{formatStock(it.defaultQty, it.unit)}</span>
              </button>
            ))}
          </div>
        )}
      </form>

      {error && !entries.length && <LoadError error={error} />}
      {!text && low.length > 0 && (
        <section className="space-y-2" aria-label="Running low">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">Running low</h2>
          <div className="flex flex-wrap gap-2">{low.map((it) => <button key={it.id} className="chip inline-flex min-h-[2.5rem] items-center gap-1.5 px-3" onClick={() => void addItem(it)}><Plus size={14} />{it.name}</button>)}</div>
        </section>
      )}

      {loading && !entries.length && !error && <p className="text-sm text-muted">Loading…</p>}
      {!loading && !entries.length && (
        <div className="card flex flex-col items-center gap-2 p-10 text-center"><ShoppingCart size={28} className="text-muted" /><p className="font-medium">The list is empty</p><p className="max-w-xs text-sm text-muted">Type above, or open a recipe and add what it is missing. Anything you already have is left off.</p></div>
      )}

      {groups.map(({ c, rows }) => (
        <section key={c} className="space-y-1" aria-label={c}>
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">{c}</h2>
          <div className="card divide-y divide-line overflow-hidden">
            {rows.map((e) => {
              const it = e.itemId ? byId.get(e.itemId) : undefined;
              return (
                <div key={e.id} className="flex min-h-[3.5rem] items-center gap-1 pl-1 pr-1">
                  <button className="flex h-12 w-12 shrink-0 items-center justify-center" aria-label={`Tick off ${e.name}`} onClick={() => void tick(e, true)}><span className="h-7 w-7 rounded-full border-2 border-line" /></button>
                  <button className="min-w-0 flex-1 py-2 text-left" onClick={() => setEdit(e)}><span className="block truncate font-medium">{e.name}</span>{e.note && <span className="block truncate text-xs text-muted">{e.note}</span>}</button>
                  {e.qty !== null ? <Stepper label={e.name} value={e.qty} step={it?.step ?? 1} unit={e.unit} min={0} onChange={(v) => void step(e, v)} /> : <ChevronRight size={14} className="mr-2 text-muted" />}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {done.length > 0 && (
        <section className="space-y-1" aria-label="In the trolley">
          <div className="flex items-center justify-between px-1">
            <button className="flex min-h-[2.5rem] items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>{showDone ? <ChevronDown size={14} /> : <ChevronRight size={14} />}In the trolley ({done.length})</button>
            <button className="btn btn-ghost !py-1.5 text-sm" onClick={() => void clear()}>Clear</button>
          </div>
          {showDone && <div className="card divide-y divide-line overflow-hidden">{done.map((e) => (
            <button key={e.id} className="flex min-h-[3.25rem] w-full items-center gap-3 px-3 text-left text-muted" onClick={() => void tick(e, false)} aria-label={`Put ${e.name} back on the list`}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-fg"><Check size={16} /></span><span className={cn('flex-1 truncate line-through')}>{e.name}</span><span className="text-sm">{e.qty !== null ? formatStock(e.qty, e.unit) : ''}</span>
            </button>))}</div>}
        </section>
      )}
      {edit && <EntrySheet key={edit.id} entry={entries.find((x) => x.id === edit.id) ?? edit} item={edit.itemId ? byId.get(edit.itemId) : undefined} onClose={() => setEdit(null)} onChanged={reload} />}
    </div>
  );
}
