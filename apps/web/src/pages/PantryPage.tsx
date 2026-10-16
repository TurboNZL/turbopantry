import { useMemo, useState } from 'react';
import { AlertTriangle, PackageX, Plus, ShoppingCart, SlidersHorizontal, Trash2, Pencil } from 'lucide-react';
import { GROUPS, parseQuickAdd, searchItems, titleCase, type Item } from '@turbopantry/shared';
import { ItemSheet } from '../components/ItemSheet.tsx';
import { LoadError } from '../components/SignInNotice.tsx';
import { Stepper } from '../components/Stepper.tsx';
import { UndoButton } from '../components/UndoButton.tsx';
import { useAddToList } from '../components/useAddToList.tsx';
import { useRowMenu } from '../lib/contextMenu.tsx';
import { useItems } from '../lib/data.ts';
import { toast } from '../lib/toast.ts';
import { useApi } from '../lib/useApi.ts';
import { useNavigate } from 'react-router-dom';

interface RowProps { it: Item; undoing: boolean; onOpen(): void; onChange(qty: number): void; onOut(): void; onUndo(): void; onExpire(): void; onList(): void; onMore(): void; onDelete(): void }

function Row({ it, undoing, onOpen, onChange, onOut, onUndo, onExpire, onList, onMore, onDelete }: RowProps) {
  const low = it.minQty > 0 && it.qty <= it.minQty;
  const menu = useRowMenu(titleCase(it.name), () => [
    { label: 'Add to the shopping list', icon: <ShoppingCart size={16} />, run: onList },
    { label: 'Mark as out', icon: <PackageX size={16} />, run: onOut },
    { label: 'Edit', icon: <Pencil size={16} />, run: onOpen },
    { label: 'More settings', icon: <SlidersHorizontal size={16} />, run: onMore },
    { label: 'Delete', icon: <Trash2 size={16} />, danger: true, run: onDelete },
  ]);
  return (
    <div {...menu} className="flex min-h-[3.5rem] items-center gap-0.5 pl-3 pr-1">
      <button className="flex min-w-0 flex-1 items-center gap-1 py-2 text-left" onClick={onOpen} aria-label={`${titleCase(it.name)} settings`}>
        <span className="min-w-0"><span className={it.qty === 0 && !undoing ? 'line-clamp-2 break-words text-muted' : 'line-clamp-2 break-words font-medium'}>{titleCase(it.name)}</span>
          {(low || it.place) && <span className="block truncate text-xs text-muted">{[low && 'running low', it.place].filter(Boolean).join(' · ')}</span>}</span>
              </button>
      {undoing ? <UndoButton onUndo={onUndo} onExpire={onExpire} label="Undo" /> : <>
        <Stepper compact label={titleCase(it.name)} value={it.qty} step={it.step} unit={it.unit} onChange={onChange} />
        <button className="btn btn-ghost flex h-10 w-10 shrink-0 items-center justify-center !p-0 disabled:opacity-30" aria-label={`Mark ${titleCase(it.name)} as out`} title="Mark as out" disabled={it.qty === 0} onClick={onOut}><PackageX size={18} /></button>
        <button className="btn btn-ghost flex h-10 w-10 shrink-0 items-center justify-center !p-0" aria-label={`Add ${titleCase(it.name)} to the list`} title="Add to the shopping list" onClick={onList}><ShoppingCart size={18} /></button>
      </>}
    </div>
  );
}

/** What is in the house. Type to find or add ("2kg flour" works), − + or type a number to change an amount, one tap to mark something out or put it on the list. */
export function PantryPage() {
  const api = useApi();
  const nav = useNavigate();
  const { items, error, set, reload, loading } = useItems();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Item | null>(null);
  const [outed, setOuted] = useState<Record<number, number>>({}); // item id -> how much there was, while Undo is on offer
  const toList = useAddToList(reload);

  const tracked = useMemo(() => items.filter((i) => i.tracked), [items]);
  const text = q.trim();
  const shown = text ? searchItems(tracked, text, 200) : tracked;
  const low = tracked.filter((i) => i.minQty > 0 && i.qty <= i.minQty);
  const parsed = parseQuickAdd(text);
  const exact = text ? items.find((i) => i.name.toLowerCase() === parsed.words.toLowerCase()) : null;
  const untracked = text ? searchItems(items.filter((i) => !i.tracked), parsed.words, 3) : [];
  const groups = GROUPS.map((c) => ({ c, rows: shown.filter((i) => i.category === c).sort((a, b) => Number(a.qty === 0 && !(a.id in outed)) - Number(b.qty === 0 && !(b.id in outed)) || a.name.localeCompare(b.name)) })).filter((g) => g.rows.length);

  async function change(it: Item, qty: number) {
    const delta = qty - it.qty;
    if (!delta) return;
    set((cur) => (cur ?? []).map((x) => (x.id === it.id ? { ...x, qty } : x))); // the screen moves at once
    try { await api.adjustStock([{ itemId: it.id, delta }], 'manual'); } catch { reload(); }
  }
  async function out(it: Item) {
    if (!it.qty) return;
    const had = it.qty;
    setOuted((o) => ({ ...o, [it.id]: had }));
    set((cur) => (cur ?? []).map((x) => (x.id === it.id ? { ...x, qty: 0 } : x)));
    try { await api.adjustStock([{ itemId: it.id, delta: -had }], 'out'); } catch { setOuted((o) => { const { [it.id]: _gone, ...rest } = o; return rest; }); reload(); }
  }
  async function undoOut(it: Item) {
    const had = outed[it.id] ?? 0;
    setOuted((o) => { const { [it.id]: _gone, ...rest } = o; return rest; });
    set((cur) => (cur ?? []).map((x) => (x.id === it.id ? { ...x, qty: had } : x)));
    try { await api.adjustStock([{ itemId: it.id, delta: had }], 'undo out'); } catch { reload(); }
  }
  const expire = (id: number) => setOuted((o) => { const { [id]: _gone, ...rest } = o; return rest; });

  async function add() {
    if (!text) return;
    const hasQty = parsed.qty !== null;
    try {
      const made = await api.createItem({ name: parsed.words, ...(hasQty ? { qty: parsed.qty!, unit: parsed.unit } : { qty: 1 }) }); // "milk" means one, "2kg flour" means two kilos
      toast(made.existed ? `${titleCase(made.name)} is already here` : `Added ${titleCase(made.name)}`);
      setQ(''); reload();
    } catch (e) { toast((e as Error).message); }
  }
  async function bring(it: Item) { try { await api.updateItem(it.id, { tracked: true, qty: it.qty || it.defaultQty }); toast(`${titleCase(it.name)} is in the pantry`); setQ(''); reload(); } catch (e) { toast((e as Error).message); } }
  async function del(it: Item) {
    if (!window.confirm(`Delete “${titleCase(it.name)}”? Recipes keep their wording but lose the link.`)) return;
    try { await api.deleteItem(it.id); toast(`Deleted ${titleCase(it.name)}`); reload(); } catch (e) { toast((e as Error).message); }
  }

  return (
    <div className="space-y-4 pb-4">
      <h1 className="text-2xl font-bold">Pantry</h1>
      <form className="sticky top-14 z-10 -mx-1 flex gap-2 bg-bg/90 px-1 py-2 backdrop-blur md:top-16" onSubmit={(e) => { e.preventDefault(); if (!exact) void add(); }}>
        <input className="input h-12 flex-1 text-base" placeholder="Find or add: milk, 2kg flour…" aria-label="Find or add an item" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="done" autoCapitalize="none" />
        {text && !exact && <button className="btn btn-accent h-12 px-4" aria-label={`Add ${text}`}><Plus size={20} /></button>}
      </form>

      {error && !items.length && <LoadError error={error} />}
      {untracked.map((it) => (
        <button key={it.id} className="card flex min-h-[3.25rem] w-full items-center justify-between px-4 text-left" onClick={() => void bring(it)}>
          <span><span className="font-medium">{titleCase(it.name)}</span><span className="block text-sm text-muted">Known from a recipe, not in your pantry yet</span></span><span className="btn btn-accent !py-1.5">Add</span>
        </button>
      ))}

      {!text && low.length > 0 && (
        <section className="card space-y-2 p-3" aria-label="Running low">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={16} className="text-warn" />Running low</h2>
          <div className="flex flex-wrap gap-2">{low.map((it) => <button key={it.id} className="chip inline-flex min-h-[2.5rem] items-center gap-2 px-3" onClick={() => void toList.add(it)}>{titleCase(it.name)}<ShoppingCart size={14} /></button>)}</div>
        </section>
      )}

      {loading && !items.length && !error && <p className="text-sm text-muted">Loading…</p>}
      {!loading && !tracked.length && !text && (
        <div className="card space-y-1 p-8 text-center"><p className="font-medium">Nothing in the pantry yet</p><p className="text-sm text-muted">Type above to add what you have. “2kg flour” sets the amount too. Ticking things off the shopping list adds them here by itself.</p></div>
      )}

      {groups.map(({ c, rows }) => (
        <section key={c} aria-label={c} className="space-y-1">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">{c}</h2>
          <div className="card divide-y divide-line overflow-hidden">
            {rows.map((it) => (
              <Row key={it.id} it={it} undoing={it.id in outed} onOpen={() => setOpen(it)} onChange={(v) => void change(it, v)} onOut={() => void out(it)} onUndo={() => void undoOut(it)} onExpire={() => expire(it.id)}
                onList={() => void toList.add(it)} onMore={() => nav(`/settings?tab=items&item=${it.id}`)} onDelete={() => void del(it)} />
            ))}
          </div>
        </section>
      ))}
      {text && !groups.length && !untracked.length && <p className="px-1 text-sm text-muted">Nothing called “{text}”. Press + to add it.</p>}
      {open && <ItemSheet key={open.id} item={items.find((i) => i.id === open.id) ?? open} onClose={() => setOpen(null)} onSaved={reload} />}
      {toList.node}
    </div>
  );
}
