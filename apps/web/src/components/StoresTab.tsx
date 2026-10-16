import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, GripVertical, Plus, Trash2 } from 'lucide-react';
import { GROUPS, groupOrder, sectionOf, type Store } from '@turbopantry/shared';
import { useItems, useListEntries, useStores } from '../lib/data.ts';
import { Segmented } from './Segmented.tsx';
import { StoreMap3D } from './floor3d/index.tsx';
import { useStore } from '../lib/store.ts';
import { toast } from '../lib/toast.ts';
import { useApi } from '../lib/useApi.ts';
import { cn } from '../lib/cn.ts';

function MapPanel({ store }: { store: Store }) {
  const { entries } = useListEntries();
  const { items } = useItems();
  return <StoreMap3D store={store} entries={entries} items={items} />;
}

function Layout({ store, onChanged }: { store: Store; onChanged(): void }) {
  const api = useApi();
  const { settings, updateSettings } = useStore();
  const order = groupOrder(store);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [name, setName] = useState(store.name);
  const [view, setView] = useState<'order' | 'map'>('order');

  async function save(next: string[]) { try { await api.updateStore(store.id, { order: next }); onChanged(); } catch (e) { toast((e as Error).message); } }
  const move = (g: string, to: number) => { const rest = order.filter((x) => x !== g); rest.splice(Math.max(0, Math.min(rest.length, to)), 0, g); void save(rest); };
  async function rename() { if (name.trim() && name.trim() !== store.name) { try { await api.updateStore(store.id, { name: name.trim() }); onChanged(); } catch (e) { toast((e as Error).message); setName(store.name); } } }
  async function remove() {
    if (!window.confirm(`Delete the layout “${store.name}”?`)) return;
    try { await api.deleteStore(store.id); if (settings.storeId === store.id) updateSettings({ storeId: null }); onChanged(); } catch (e) { toast((e as Error).message); }
  }
  const mine = settings.storeId === store.id;
  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input h-11 min-w-0 flex-1" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void rename()} aria-label="Store name" maxLength={60} />
        <button className={cn('btn h-11', mine && 'btn-accent')} onClick={() => updateSettings({ storeId: mine ? null : store.id })} aria-pressed={mine}>{mine ? <><Check size={16} className="mr-1 inline" />Shopping here</> : 'Shop here'}</button>
        <button className="btn h-11 !px-3" onClick={() => void remove()} aria-label="Delete layout"><Trash2 size={18} /></button>
      </div>
      {settings.view3d && <Segmented<'order' | 'map'> label="Store view" value={view} onChange={setView} options={[{ value: 'order', label: 'Order' }, { value: 'map', label: 'Map' }]} />}
      {settings.view3d && view === 'map' ? <MapPanel store={store} /> : <>
        <p className="text-sm text-muted">The order you walk the shop in. Drag a group, or use the arrows. The shopping list follows it while “Shopping here” is on.</p>
        <ol className="divide-y divide-line overflow-hidden rounded-theme border border-line">
          {order.map((g, i) => (
            <li key={g} draggable onDragStart={() => setDrag(g)} onDragEnd={() => { setDrag(null); setOver(null); }} onDragOver={(e) => { e.preventDefault(); setOver(g); }}
              onDrop={(e) => { e.preventDefault(); if (drag && drag !== g) move(drag, i); setDrag(null); setOver(null); }}
              className={cn('flex min-h-[2.75rem] items-center gap-2 bg-bg px-2', drag === g && 'opacity-40', over === g && drag !== g && 'border-t-2 border-accent')}>
              <GripVertical size={16} className="shrink-0 cursor-grab text-muted" aria-hidden />
              <span className="w-6 shrink-0 text-right text-xs text-muted tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{g}<span className="ml-2 text-xs text-muted">{sectionOf(g)}</span></span>
              <button className="btn btn-ghost flex h-9 w-9 items-center justify-center !p-0" aria-label={`Move ${g} up`} disabled={i === 0} onClick={() => move(g, i - 1)}><ArrowUp size={16} /></button>
              <button className="btn btn-ghost flex h-9 w-9 items-center justify-center !p-0" aria-label={`Move ${g} down`} disabled={i === order.length - 1} onClick={() => move(g, i + 1)}><ArrowDown size={16} /></button>
            </li>
          ))}
        </ol>
      </>}
    </div>
  );
}

/** Settings > Stores: make a layout for each shop and put its shopping groups in the order you walk them. */
export function StoresTab() {
  const api = useApi();
  const { stores, reload } = useStores();
  const [name, setName] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const cur = stores.find((s) => s.id === sel) ?? stores[0];
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try { const s = await api.createStore(name.trim(), cur ? cur.order : GROUPS); setName(''); setSel(s.id); reload(); } catch (err) { toast((err as Error).message); }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">A store layout is the order a shop's aisles come in. Make one per shop (a new one starts as a copy of the one you are looking at) and the shopping list is sorted to match when you pick it.</p>
      <form className="flex gap-2" onSubmit={(e) => void add(e)}>
        <input className="input h-11 flex-1" placeholder="New store, e.g. Pak’nSave Albany" aria-label="New store name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <button className="btn btn-accent h-11 px-4" aria-label="Add store"><Plus size={18} /></button>
      </form>
      {stores.length > 1 && <div className="flex flex-wrap gap-2" role="tablist" aria-label="Stores">{stores.map((s) => <button key={s.id} role="tab" aria-selected={s.id === cur?.id} className={cn('chip min-h-[2.5rem] px-3', s.id === cur?.id && 'bg-accent text-accent-fg')} onClick={() => setSel(s.id)}>{s.name}</button>)}</div>}
      {cur ? <Layout key={cur.id} store={cur} onChanged={reload} /> : <div className="card p-8 text-center text-sm text-muted">No stores yet. Without one the list uses a standard supermarket order.</div>}
    </div>
  );
}
