import { useMemo, useState } from 'react';
import { Check, Plus, ShoppingCart, Store as StoreIcon, Trash2, Package, ListChecks, PackageX, Map as MapIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { GROUPS, dimensionOf, formatStock, groupOrder, parseQuickAdd, searchItems, titleCase, type Item, type ListEntry } from '@turbopantry/shared';
import { LoadError } from '../components/SignInNotice.tsx';
import { Stepper } from '../components/Stepper.tsx';
import { StoreMap3D } from '../components/floor3d/index.tsx';
import { useAddToList } from '../components/useAddToList.tsx';
import { useRowMenu } from '../lib/contextMenu.tsx';
import { useItems, useListEntries, useStores } from '../lib/data.ts';
import { useStore } from '../lib/store.ts';
import { toast } from '../lib/toast.ts';
import { useApi } from '../lib/useApi.ts';
import { Segmented } from '../components/Segmented.tsx';
import { cn } from '../lib/cn.ts';

const LEAVE_MS = 340; // how long a crossed-off line shows its tick before it folds away

/** How the pantry stands for an item, for colour coding: out (red), running low (amber), in stock (green). */
const tone = (it: Pick<Item, 'qty' | 'minQty'>): 'out' | 'low' | 'have' => (it.qty <= 0 ? 'out' : it.minQty > 0 && it.qty <= it.minQty ? 'low' : 'have');
const TONE = {
  out: { row: 'border-l-4 border-bad bg-bad/10', text: 'text-bad', word: 'out' },
  low: { row: 'border-l-4 border-warn bg-warn/10', text: 'text-warn', word: 'running low' },
  have: { row: 'border-l-4 border-good bg-good/10', text: 'text-good', word: 'in the pantry' },
} as const;

/** One list line, one row high: tap the name to cross it off (it goes into the pantry), the red bin takes it off the list WITHOUT adding it to the pantry. */
function Line({ e, leaving, onBuy, onView, onQty, onRemove, onOut }: { e: ListEntry; leaving: 'tick' | 'fold' | null; onBuy(): void; onView(): void; onQty(v: number): void; onRemove(): void; onOut(): void }) {
  const menu = useRowMenu(titleCase(e.name), () => [
    { label: 'Cross off (bought)', icon: <Check size={16} />, run: onBuy },
    { label: 'View in the pantry', icon: <Package size={16} />, run: onView },
    { label: 'I’m out of it', icon: <PackageX size={16} />, run: onOut },
    { label: 'Remove, not bought', icon: <Trash2 size={16} />, danger: true, run: onRemove },
  ]);
  return (
    <div className={cn('overflow-hidden transition-[max-height,opacity] duration-300 ease-out', leaving === 'fold' ? 'max-h-0 opacity-0' : 'max-h-12 opacity-100')}>
      <div {...menu} className={cn('flex h-11 items-center gap-0.5 pl-3 pr-1 transition-colors duration-200', leaving && 'bg-good/10')}>
        <button className="flex h-11 min-w-0 flex-1 items-center gap-1.5 text-left text-[15px]" onClick={onBuy} disabled={!!leaving} aria-label={`Cross off ${titleCase(e.name)}`}>
          {leaving && <Check size={16} strokeWidth={3} className="shrink-0 text-good" />}
          <span className={cn('truncate font-medium transition-colors duration-200', leaving && 'text-muted line-through')}>{titleCase(e.name)}{e.note && <span className="ml-1.5 text-xs font-normal text-muted">{e.note}</span>}</span>
        </button>
        {e.qty !== null && !leaving && <Stepper compact label={titleCase(e.name)} value={e.qty} step={e.step} unit={e.unit} onChange={onQty} />}
        {!leaving && <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-theme bg-bad/15 text-bad" aria-label={`Remove ${titleCase(e.name)} from the list without adding it to the pantry`} title="Remove, not bought" onClick={onRemove}><Trash2 size={16} /></button>}
      </div>
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
    <section key={c} className="space-y-0.5" aria-label={c}>
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{c}</h2>
      <div className="card divide-y divide-line overflow-hidden">
        {rows.map((it) => (
          <div key={it.id} className={cn('flex h-11 items-center gap-2 pl-3 pr-1', TONE[tone(it)].row)}>
            <span className="min-w-0 flex-1 truncate text-[15px]"><span className="font-medium">{titleCase(it.name)}</span> <span className={cn('text-xs', TONE[tone(it)].text)}>{it.qty <= 0 ? 'out' : formatStock(it.qty, it.unit)}</span></span>
            {onList.has(it.id) ? <span className="flex h-9 items-center gap-1 px-2 text-xs text-muted"><Check size={14} />On the list</span>
              : <button className="btn btn-ghost flex h-9 items-center gap-1 px-2" aria-label={`Add ${titleCase(it.name)} to the list`} onClick={() => onAdd(it)}><Plus size={16} /><span className="text-xs">{formatStock(it.defaultQty, it.unit)}</span></button>}
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
  const [show, setShow] = useState<'list' | 'map'>(() => { try { return localStorage.getItem('turbopantry.shoppingView') === 'map' ? 'map' : 'list'; } catch { return 'list'; } });
  const pickShow = (v: 'list' | 'map') => { setShow(v); try { localStorage.setItem('turbopantry.shoppingView', v); } catch { /* not saved */ } };
  const nav = useNavigate();
  const [leaving, setLeaving] = useState<Record<number, 'tick' | 'fold'>>({});
  const toList = useAddToList(() => { reload(); reloadItems(); });

  const store = stores.find((s) => s.id === settings.storeId) ?? null;
  const map = show === 'map' && stores.length > 0;
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

  const pick = (it: Item) => { setQ(''); void toList.add(it, parsed.qty ?? undefined, parsed.unit ?? undefined); }; // a bare number has no unit: it is counted in the item's own
  async function create() {
    if (!parsed.words) return;
    try { await api.addToList({ name: parsed.words, ...(parsed.qty !== null ? { qty: parsed.qty, unit: parsed.unit } : {}) }); setQ(''); reload(); reloadItems(); toast(`${titleCase(parsed.words)} is on the list and in the pantry`); } catch (e) { toast((e as Error).message); }
  }
  async function submit() { if (!text) return; if (sugg[0] && (exact || sugg.length)) return pick(exact ?? sugg[0]); await create(); }

  function cross(e: ListEntry) {
    if (leaving[e.id]) return;
    setLeaving((l) => ({ ...l, [e.id]: 'tick' }));                                       // the tick fills in and the name is struck through
    window.setTimeout(() => setLeaving((l) => (e.id in l ? { ...l, [e.id]: 'fold' } : l)), LEAVE_MS); // then the line folds away
    window.setTimeout(() => { void buy(e); setLeaving((l) => { const { [e.id]: _gone, ...rest } = l; return rest; }); }, LEAVE_MS + 300);
  }
  async function buy(e: ListEntry) {
    set((cur) => (cur ?? []).filter((x) => x.id !== e.id));
    try {
      const r = await api.updateEntry(e.id, { checked: true });
      reloadItems();
      toast(r.stock ? `${titleCase(e.name)} bought · ${formatStock(r.stock.delta, e.unit)} added to the pantry` : `${titleCase(e.name)} bought`, async () => { await api.updateEntry(e.id, { checked: false }); reload(); reloadItems(); });
    } catch { reload(); }
  }
  async function step(e: ListEntry, qty: number) {
    if (qty <= 0) { // none of it on the list means it is not on the list
      set((cur) => (cur ?? []).filter((x) => x.id !== e.id));
      try { await api.deleteEntry(e.id); toast(`${titleCase(e.name)} taken off the list`, async () => { await api.addToList({ ...(e.itemId ? { itemId: e.itemId } : { name: e.name }), qty: e.qty ?? 1, unit: e.unit }); reload(); }); } catch { reload(); }
      return;
    }
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
    <div className="space-y-2 pb-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold md:text-2xl">Shopping</h1>
        <div className="flex items-center gap-2">
          {stores.length > 0 && <Segmented<'list' | 'map'> label="Shopping view" value={show} onChange={pickShow} options={[{ value: 'list', label: 'List' }, { value: 'map', label: 'Store' }]} />}
          {stores.length > 0 && <label className="flex items-center gap-1.5 text-sm"><StoreIcon size={16} className="text-muted" aria-hidden /><span className="sr-only">Store</span>
            <select className="input h-9 !py-0" aria-label="Store" value={settings.storeId ?? ''} onChange={(e) => updateSettings({ storeId: e.target.value ? Number(e.target.value) : null })}><option value="">Standard order</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
        </div>
      </div>
      {map ? (
        !settings.view3d ? <div className="card space-y-2 p-5 text-center"><p className="font-medium">The store view is a 3D map</p><p className="text-sm text-muted">Turn on 3D views to see what to grab in each part of the shop.</p><button className="btn btn-accent h-11 px-4" onClick={() => updateSettings({ view3d: true })}>Turn on 3D views</button></div>
        : !store ? <div className="card p-5 text-center text-sm text-muted">Pick a store above to see its map.</div>
        : <StoreMap3D store={store} entries={entries} items={items} />
      ) : <>
      <form className="find-bar sticky top-14 z-10 -mx-1 px-1 py-1.5 backdrop-blur md:top-16" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="flex gap-2">
          <input className="input find-box h-11 flex-1 text-base" placeholder={view === 'pantry' ? 'Search the pantry' : 'Add: milk, 750 ch, 2kg flour…'} aria-label={view === 'pantry' ? 'Search the pantry' : 'Add to the list'} value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="done" autoCapitalize="none" />
          {view === 'list' && text && <button className="btn btn-accent h-11 px-4" aria-label={`Add ${text}`}><Plus size={20} /></button>}
          <button type="button" className={cn('btn h-11 px-3', view === 'pantry' && 'btn-accent')} aria-pressed={view === 'pantry'} onClick={() => setView(view === 'pantry' ? 'list' : 'pantry')} title={view === 'pantry' ? 'Back to the list' : 'Add from the pantry'}>
            {view === 'pantry' ? <><ListChecks size={18} className="mr-1.5 inline" />List</> : <><Package size={18} className="mr-1.5 inline" />Pantry</>}</button>
        </div>
        {view === 'list' && text && (
          <div className="bt-menu mt-1.5 overflow-hidden" role="listbox" aria-label="Suggestions">
            {sugg.map((it) => { const t = TONE[tone(it)]; return (
              <button key={it.id} type="button" role="option" aria-selected="false" className={cn('flex h-12 w-full items-center justify-between gap-3 px-3 text-left', t.row)} onClick={() => pick(it)}>
                <span className="min-w-0 truncate"><span className="font-medium">{titleCase(it.name)}</span>{onList.has(it.id) ? <span className="ml-2 text-xs text-muted">already on the list</span> : <span className={cn('ml-2 text-xs', t.text)}>{it.qty <= 0 ? 'out' : `${formatStock(it.qty, it.unit)} ${it.minQty > 0 && it.qty <= it.minQty ? '(low)' : 'in stock'}`}</span>}</span>
                <span className="shrink-0 text-sm font-medium">{formatStock(parsed.qty ?? it.defaultQty, parsed.qty !== null && parsed.unit ? parsed.unit : it.unit)}</span>
              </button>); })}
            {!exact && parsed.words && (
              <button type="button" className="flex h-12 w-full items-center gap-2 border-l-4 border-accent border-t-line px-3 text-left text-accent" onClick={() => void create()}><Plus size={16} />Add “{titleCase(parsed.words)}” as a new item</button>
            )}
          </div>
        )}
      </form>

      {error && !entries.length && <LoadError error={error} />}

      {view === 'pantry' ? <PantryBrowse items={items} text={text} onList={onList} onAdd={(it) => void toList.add(it)} /> : <>
        {!text && low.length > 0 && (
          <section className="space-y-1" aria-label="Running low">
            <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Running low</h2>
            <div className="flex flex-wrap gap-1.5">{low.map((it) => <button key={it.id} className="chip inline-flex min-h-[2.25rem] items-center gap-1.5 px-3" onClick={() => void toList.add(it)}><Plus size={14} />{titleCase(it.name)}</button>)}</div>
          </section>
        )}
        {loading && !entries.length && !error && <p className="text-sm text-muted">Loading…</p>}
        {!loading && !entries.length && (
          <div className="card flex flex-col items-center gap-2 p-10 text-center"><ShoppingCart size={28} className="text-muted" /><p className="font-medium">The list is empty</p><p className="max-w-xs text-sm text-muted">Type above, or tap Pantry to scroll what you keep. Open a recipe to add only what it is missing.</p></div>
        )}
        {groups.map(({ c, rows }) => (
          <section key={c} className="space-y-0.5" aria-label={c}>
            <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{c}</h2>
            <div className="card divide-y divide-line overflow-hidden">
              {rows.map((e) => <Line key={e.id} e={e} leaving={leaving[e.id] ?? null} onBuy={() => cross(e)} onView={() => nav(`/pantry?item=${e.itemId}`)} onQty={(v) => void step(e, v)} onRemove={() => void remove(e)} onOut={() => void markOut(e)} />)}
            </div>
          </section>
        ))}
      </>}
      </>}
      {toList.node}
    </div>
  );
}
