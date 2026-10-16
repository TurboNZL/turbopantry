import { useMemo, useState } from 'react';
import { Check, Pencil, Plus, ShoppingCart, Store as StoreIcon, Trash2, Package, ListChecks, PackageX } from 'lucide-react';
import { GROUPS, dimensionOf, formatStock, groupOrder, parseQuickAdd, searchItems, titleCase, type Item, type ListEntry } from '@turbopantry/shared';
import { LoadError } from '../components/SignInNotice.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { Stepper } from '../components/Stepper.tsx';
import { useAddToList } from '../components/useAddToList.tsx';
import { useRowMenu } from '../lib/contextMenu.tsx';
import { useItems, useListEntries, useStores } from '../lib/data.ts';
import { useStore } from '../lib/store.ts';
import { toast } from '../lib/toast.ts';
import { useApi } from '../lib/useApi.ts';
import { cn } from '../lib/cn.ts';

function EntrySheet({ entry, onClose, onChanged }: { entry: ListEntry; onClose(): void; onChanged(): void }) {
  const api = useApi();
  const [qty, setQty] = useState(entry.qty ?? 0);
  const [note, setNote] = useState(entry.note);
  async function save() { try { await api.updateEntry(entry.id, { qty: entry.qty === null && qty === 0 ? null : qty, note }); onChanged(); onClose(); } catch (e) { toast((e as Error).message); } }
  async function remove() { try { await api.deleteEntry(entry.id); onChanged(); onClose(); } catch (e) { toast((e as Error).message); } }
  return (
    <Sheet title={titleCase(entry.name)} onClose={onClose} footer={<div className="flex gap-2"><button className="btn h-11 !px-3" aria-label="Remove from the list" onClick={() => void remove()}><Trash2 size={18} /></button><button className="btn btn-accent h-11 flex-1" onClick={() => void save()}>Done</button></div>}>
      <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">How much</span><Stepper label="amount" value={qty} step={entry.step} unit={entry.unit} onChange={setQty} /></div>
      <label className="block"><span className="mb-1 block text-sm font-medium">Note</span><input className="input h-11" value={note} onChange={(e) => setNote(e.target.value)} placeholder="the tasty one, the big pack…" /></label>
      {!entry.addsStock && <p className="text-sm text-muted">Buying this leaves the pantry count as it is.</p>}
    </Sheet>
  );
}

function Line({ e, onBuy, onEdit, onQty, onRemove, onOut }: { e: ListEntry; onBuy(): void; onEdit(): void; onQty(v: number): void; onRemove(): void; onOut(): void }) {
  const menu = useRowMenu(titleCase(e.name), () => [
    { label: 'Cross off (bought)', icon: <Check size={16} />, run: onBuy },
    { label: 'Edit', icon: <Pencil size={16} />, run: onEdit },
    { label: 'I’m out of it', icon: <PackageX size={16} />, run: onOut },
    { label: 'Remove from the list', icon: <Trash2 size={16} />, danger: true, run: onRemove },
  ]);
  return (
    <div {...menu} className="flex min-h-[3.5rem] items-center pl-1 pr-1">
      <button className="flex min-h-[3.5rem] min-w-0 flex-1 items-center gap-2 text-left" onClick={onBuy} aria-label={`Cross off ${titleCase(e.name)}`}>
        <span className="flex h-11 w-10 shrink-0 items-center justify-center"><span className="h-7 w-7 rounded-full border-2 border-line" /></span>
        <span className="min-w-0"><span className="line-clamp-2 break-words font-medium">{titleCase(e.name)}</span>{e.note && <span className="block truncate text-xs text-muted">{e.note}</span>}</span>
      </button>
      {e.qty !== null && <Stepper compact label={titleCase(e.name)} value={e.qty} step={e.step} unit={e.unit} onChange={onQty} />}
      <button className="btn btn-ghost flex h-10 w-10 shrink-0 items-center justify-center !p-0" aria-label={`Edit ${titleCase(e.name)}`} onClick={onEdit}><Pencil size={17} /></button>
    </div>
  );
}

/** From the pantry: scroll everything you keep (with how much is in the house) and put things on the list. */
function PantryBrowse({ items, text, onAdd, onList }: { items: Item[]; text: string; onAdd(it: Item): void; onList: Set<number> }) {
  const tracked = items.filter((i) => i.tracked);
  const shown = text ? searchItems(tracked, text, 200) : tracked;
  const groups = GROUPS.map((c) => ({ c, rows: shown.filter((i) => i.category === c).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.rows.length);
  if (!groups.length) return <p className="px-1 text-sm text-muted">{tracked.length ? `Nothing in the pantry matches “${text}”.` : 'The pantry is empty. Things you add to the list are kept here.'}</p>;
  return <>{groups.map(({ c, rows }) => (
    <section key={c} className="space-y-1" aria-label={c}>
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">{c}</h2>
      <div className="card divide-y divide-line overflow-hidden">
        {rows.map((it) => (
          <div key={it.id} className="flex min-h-[3.25rem] items-center gap-2 pl-4 pr-1">
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{titleCase(it.name)}</span><span className={cn('block text-xs', it.qty === 0 ? 'text-warn' : 'text-muted')}>{it.qty === 0 ? 'none in the pantry' : `${formatStock(it.qty, it.unit)} in the pantry`}</span></span>
            {onList.has(it.id) ? <span className="flex h-11 items-center gap-1 px-3 text-sm text-muted"><Check size={16} />On the list</span>
              : <button className="btn btn-ghost flex h-11 items-center gap-1.5 px-3" aria-label={`Add ${titleCase(it.name)} to the list`} onClick={() => onAdd(it)}><Plus size={18} /><span className="text-sm">{formatStock(it.defaultQty, it.unit)}</span></button>}
          </div>
        ))}
      </div>
    </section>))}</>;
}

/**
 * The shared shopping list. It is the pantry's other half: every line is a pantry item, found by typing ("750 ch" finds chicken and asks for 750 g),
 * crossing a line off (a tap anywhere on it) adds what you bought to the pantry and removes the line, and Undo is on the toast. No completed list.
 */
export function ShoppingPage() {
  const api = useApi();
  const { entries, error, set, reload, loading } = useListEntries();
  const { items, reload: reloadItems } = useItems();
  const { stores } = useStores();
  const { settings, updateSettings } = useStore();
  const [q, setQ] = useState('');
  const [view, setView] = useState<'list' | 'pantry'>('list');
  const [edit, setEdit] = useState<ListEntry | null>(null);
  const toList = useAddToList(() => { reload(); reloadItems(); });

  const store = stores.find((s) => s.id === settings.storeId) ?? null;
  const order = groupOrder(store);
  const onList = useMemo(() => new Set(entries.map((e) => e.itemId).filter((x): x is number => x !== null)), [entries]);
  const text = q.trim();
  const parsed = parseQuickAdd(text);
  // "750 ch" means a weight: items counted in weight come first. "3 ch" (a small number, no unit) does not.
  const sugg = useMemo(() => {
    if (!parsed.words) return [];
    const found = searchItems(items, parsed.words, 12);
    const wantsMeasure = parsed.qty !== null && (parsed.unit ? dimensionOf(parsed.unit) !== 'count' : parsed.qty >= 50);
    const fits = (i: Item) => (wantsMeasure ? (parsed.unit ? dimensionOf(i.unit) === dimensionOf(parsed.unit) : i.mode !== 'amount') : true);
    return [...found.filter(fits), ...found.filter((i) => !fits(i))].slice(0, 6);
  }, [items, parsed.words, parsed.qty, parsed.unit]);
  const exact = parsed.words ? items.find((i) => i.name.toLowerCase() === parsed.words.toLowerCase()) : undefined;
  const low = items.filter((i) => i.tracked && i.minQty > 0 && i.qty <= i.minQty && !onList.has(i.id));
  const groups = order.map((c) => ({ c, rows: entries.filter((e) => e.category === c) })).filter((g) => g.rows.length);

  const pick = (it: Item) => { setQ(''); void toList.add(it, parsed.qty ?? undefined, parsed.qty !== null ? parsed.unit : undefined); };
  async function create() {
    if (!parsed.words) return;
    try { await api.addToList({ name: parsed.words, ...(parsed.qty !== null ? { qty: parsed.qty, unit: parsed.unit } : {}) }); setQ(''); reload(); reloadItems(); toast(`${titleCase(parsed.words)} is on the list and in the pantry`); } catch (e) { toast((e as Error).message); }
  }
  async function submit() { if (!text) return; if (sugg[0] && (exact || sugg.length)) return pick(exact ?? sugg[0]); await create(); }

  async function buy(e: ListEntry) {
    set((cur) => (cur ?? []).filter((x) => x.id !== e.id)); // gone at once
    try {
      const r = await api.updateEntry(e.id, { checked: true });
      reloadItems();
      toast(r.stock ? `${titleCase(e.name)} bought · ${formatStock(r.stock.delta, e.unit)} added to the pantry` : `${titleCase(e.name)} bought`, async () => { await api.updateEntry(e.id, { checked: false }); reload(); reloadItems(); });
    } catch { reload(); }
  }
  async function step(e: ListEntry, qty: number) {
    set((cur) => (cur ?? []).map((x) => (x.id === e.id ? { ...x, qty } : x)));
    try { await api.updateEntry(e.id, { qty }); } catch { reload(); }
  }
  async function remove(e: ListEntry) { set((cur) => (cur ?? []).filter((x) => x.id !== e.id)); try { await api.deleteEntry(e.id); } catch { reload(); } }
  async function markOut(e: ListEntry) {
    const it = e.itemId ? items.find((i) => i.id === e.itemId) : undefined;
    if (!it || !it.qty) { toast('Nothing in the pantry to take off'); return; }
    try { await api.adjustStock([{ itemId: it.id, delta: -it.qty }], 'out'); reloadItems(); toast(`${titleCase(it.name)} is out in the pantry`, async () => { await api.adjustStock([{ itemId: it.id, delta: it.qty }], 'undo out'); reloadItems(); }); } catch (err) { toast((err as Error).message); }
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Shopping</h1>
        {stores.length > 0 && <label className="flex items-center gap-1.5 text-sm"><StoreIcon size={16} className="text-muted" aria-hidden /><span className="sr-only">Store</span>
          <select className="input h-10 !py-0" aria-label="Store" value={settings.storeId ?? ''} onChange={(e) => updateSettings({ storeId: e.target.value ? Number(e.target.value) : null })}><option value="">Standard order</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
      </div>
      <form className="sticky top-14 z-10 -mx-1 bg-bg/90 px-1 py-2 backdrop-blur md:top-16" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="flex gap-2">
          <input className="input h-12 flex-1 text-base" placeholder={view === 'pantry' ? 'Search the pantry' : 'Add: milk, 750 ch, 2kg flour…'} aria-label={view === 'pantry' ? 'Search the pantry' : 'Add to the list'} value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="done" autoCapitalize="none" />
          {view === 'list' && text && <button className="btn btn-accent h-12 px-4" aria-label={`Add ${text}`}><Plus size={20} /></button>}
          <button type="button" className={cn('btn h-12 px-3', view === 'pantry' && 'btn-accent')} aria-pressed={view === 'pantry'} onClick={() => setView(view === 'pantry' ? 'list' : 'pantry')} title={view === 'pantry' ? 'Back to the list' : 'Add from the pantry'}>
            {view === 'pantry' ? <><ListChecks size={18} className="mr-1.5 inline" />List</> : <><Package size={18} className="mr-1.5 inline" />Pantry</>}</button>
        </div>
        {view === 'list' && text && (
          <div className="bt-menu mt-2 overflow-hidden" role="listbox" aria-label="Suggestions">
            {sugg.map((it) => (
              <button key={it.id} type="button" role="option" aria-selected="false" className="flex min-h-[3.25rem] w-full items-center justify-between gap-3 px-4 text-left" onClick={() => pick(it)}>
                <span className="min-w-0"><span className="block truncate">{titleCase(it.name)}{onList.has(it.id) && <span className="ml-2 text-xs text-muted">already on the list</span>}</span>
                  <span className="block text-xs text-muted">{it.tracked && it.qty > 0 ? `${formatStock(it.qty, it.unit)} in the pantry` : 'none in the pantry'}</span></span>
                <span className="shrink-0 text-sm font-medium">{formatStock(parsed.qty ?? it.defaultQty, parsed.qty !== null && parsed.unit ? parsed.unit : it.unit)}</span>
              </button>
            ))}
            {!exact && parsed.words && (
              <button type="button" className="flex min-h-[3.25rem] w-full items-center gap-2 border-t border-line px-4 text-left text-accent" onClick={() => void create()}><Plus size={16} />Add “{titleCase(parsed.words)}” as a new item</button>
            )}
          </div>
        )}
      </form>

      {error && !entries.length && <LoadError error={error} />}

      {view === 'pantry' ? <PantryBrowse items={items} text={text} onList={onList} onAdd={(it) => void toList.add(it)} /> : <>
        {!text && low.length > 0 && (
          <section className="space-y-2" aria-label="Running low">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">Running low</h2>
            <div className="flex flex-wrap gap-2">{low.map((it) => <button key={it.id} className="chip inline-flex min-h-[2.5rem] items-center gap-1.5 px-3" onClick={() => void toList.add(it)}><Plus size={14} />{titleCase(it.name)}</button>)}</div>
          </section>
        )}
        {loading && !entries.length && !error && <p className="text-sm text-muted">Loading…</p>}
        {!loading && !entries.length && (
          <div className="card flex flex-col items-center gap-2 p-10 text-center"><ShoppingCart size={28} className="text-muted" /><p className="font-medium">The list is empty</p><p className="max-w-xs text-sm text-muted">Type above, or tap Pantry to scroll what you keep. Open a recipe to add only what it is missing.</p></div>
        )}
        {groups.map(({ c, rows }) => (
          <section key={c} className="space-y-1" aria-label={c}>
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">{c}</h2>
            <div className="card divide-y divide-line overflow-hidden">
              {rows.map((e) => <Line key={e.id} e={e} onBuy={() => void buy(e)} onEdit={() => setEdit(e)} onQty={(v) => void step(e, v)} onRemove={() => void remove(e)} onOut={() => void markOut(e)} />)}
            </div>
          </section>
        ))}
      </>}
      {edit && <EntrySheet key={edit.id} entry={entries.find((x) => x.id === edit.id) ?? edit} onClose={() => setEdit(null)} onChanged={reload} />}
      {toList.node}
    </div>
  );
}
