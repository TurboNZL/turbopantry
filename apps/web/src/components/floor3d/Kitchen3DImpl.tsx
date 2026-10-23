import { useMemo, useState } from 'react';
import { MapPinOff, Pencil, PackageX, Plus, Search, ShoppingCart, Sofa } from 'lucide-react';
import { placeOf, searchItems, starterKitchen, titleCase, FLOOR, type Block, type Item, type Layout } from '@turbopantry/shared';
import { useLayout } from '../../lib/useLayout.ts';
import { useApi } from '../../lib/useApi.ts';
import { toast } from '../../lib/toast.ts';
import { cn } from '../../lib/cn.ts';
import { Sheet } from '../Sheet.tsx';
import { Select } from '../Select.tsx';
import { Stepper } from '../Stepper.tsx';
import { CameraPad } from './CameraPad.tsx';
import { useCamera } from './camera.ts';
import { LayoutEditor } from './LayoutEditor.tsx';
import { Scene3D, type BlockInfo } from './Scene3D.tsx';
import type { Kitchen3DProps } from './types.ts';

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const isOut = (i: Item) => i.qty <= 0;
const isLow = (i: Item) => i.minQty > 0 && i.qty <= i.minQty;

/** The kitchen as a 3D plan: each block is a place (fridge, cupboard...), tap it to see and change what is kept there. */
export function Kitchen3DImpl({ items, onChange, onOut, onList }: Kitchen3DProps) {
  const api = useApi();
  const { layout, loaded, save } = useLayout('pantry');
  const cam = useCamera();
  const [editing, setEditing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [elsewhere, setElsewhere] = useState(false);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');

  const tracked = useMemo(() => items.filter((i) => i.tracked), [items]);
  // the first block with a place name owns the items of that name
  const { byBlock, other } = useMemo(() => {
    const owner = new Map<string, string>();
    for (const b of layout.blocks) { const p = norm(placeOf(b)); if (p && !owner.has(p)) owner.set(p, b.id); }
    const by = new Map<string, Item[]>(), rest: Item[] = [];
    for (const it of tracked) { const id = it.place ? owner.get(norm(it.place)) : undefined; if (id) by.set(id, [...(by.get(id) ?? []), it]); else rest.push(it); }
    return { byBlock: by, other: rest };
  }, [layout.blocks, tracked]);

  const info = useMemo(() => {
    const m = new Map<string, BlockInfo>();
    for (const b of layout.blocks) {
      if (!placeOf(b)) continue;
      const list = byBlock.get(b.id) ?? [], low = list.filter((i) => isOut(i) || isLow(i)).length;
      m.set(b.id, low ? { badge: low, tone: 'warn', hot: true } : list.length ? { badge: list.length, tone: 'ok' } : {});
    }
    return m;
  }, [layout.blocks, byBlock]);

  const places = useMemo(() => layout.blocks.filter((b) => placeOf(b)).map((b) => ({ id: b.id, name: placeOf(b)! })), [layout.blocks]);
  const open = layout.blocks.find((b) => b.id === openId) ?? null;

  /** Saves the plan, and when a block was renamed the things kept in it move to the new name (a place IS its name). A cleared name moves nothing, so retyping one cannot lose them. */
  async function saveRenaming(next: Layout) {
    const before = layout;
    void save(next);
    const taken = new Set(next.blocks.map((b) => norm(placeOf(b))));
    for (const nb of next.blocks) {
      const ob = before.blocks.find((b) => b.id === nb.id);
      const from = ob ? placeOf(ob) : null, to = placeOf(nb);
      if (!from || !to || norm(from) === norm(to) || taken.has(norm(from))) continue; // another block still has the old name: it keeps them
      for (const it of items.filter((i) => norm(i.place) === norm(from))) await api.updateItem(it.id, { place: to }).catch(() => undefined);
    }
  }

  async function setPlace(item: Item, place: string | null) {
    try { await api.updateItem(item.id, { place }); toast(place ? `${titleCase(item.name)} is in ${place}` : `${titleCase(item.name)} has no place now`); } catch (e) { toast((e as Error).message); }
  }

  if (!loaded) return <div className="card p-8 text-center text-sm text-muted" role="status">Loading the kitchen…</div>;
  if (editing) return <LayoutEditor kind="pantry" layout={layout} cam={cam} onSave={(l) => void saveRenaming(l)} onDone={() => setEditing(false)} />;

  if (!layout.blocks.length) return (
    <div className="card space-y-3 p-6 text-center">
      <Sofa size={32} className="mx-auto text-muted" aria-hidden />
      <h2 className="font-semibold">Build your kitchen</h2>
      <p className="text-sm text-muted">Put your fridge, freezer and cupboards on a little 3D floor plan. Then tap one to see what is inside.</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button className="btn btn-accent h-11 px-4" onClick={() => void save(starterKitchen())}>Start with a simple kitchen</button>
        <button className="btn h-11 px-4" onClick={() => setEditing(true)}>Build my own</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button className="btn flex h-11 items-center gap-1.5 px-3" onClick={() => setEditing(true)}><Pencil size={16} />Edit layout</button>
        <span className="flex-1" />
        {other.length > 0 && <button className="chip inline-flex min-h-[2.75rem] items-center gap-1.5 px-3" onClick={() => setElsewhere(true)}>Elsewhere<span className="font-semibold">{other.length}</span></button>}
      </div>
      <Scene3D cam={cam} size={FLOOR.pantry} blocks={layout.blocks} selectedId={openId} info={info} label="Kitchen" onTap={(id) => { const b = layout.blocks.find((x) => x.id === id); setOpenId(b && placeOf(b) ? b.id : null); }} />
      <CameraPad cam={cam} />
      <p className="text-center text-xs text-muted">Tap a place (or its name tag) to see what is in it; tap it again to pick the one behind. Orange numbers are things that are low or out.</p>

      {open && !adding && (
        <PlaceSheet block={open} name={placeOf(open) ?? open.label} list={byBlock.get(open.id) ?? []} onClose={() => setOpenId(null)} onChange={onChange} onOut={onOut} onList={onList}
          onTakeOut={(it) => void setPlace(it, null)} onAdd={() => { setQ(''); setAdding(true); }} />
      )}
      {open && adding && (
        <Sheet title={`Keep in ${placeOf(open)}`} onClose={() => setAdding(false)} footer={<button className="btn h-11 w-full" onClick={() => setAdding(false)}>Back</button>}>
          <label className="relative block"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden /><input className="input h-11 w-full pl-9" placeholder="Find an item" aria-label="Find an item" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></label>
          <Candidates open={open} tracked={tracked} byBlock={byBlock} q={q} onPick={(it) => { void setPlace(it, placeOf(open)); setAdding(false); }} />
        </Sheet>
      )}
      {elsewhere && (
        <Sheet title="Elsewhere" onClose={() => setElsewhere(false)}>
          <p className="text-sm text-muted">These have no place, or a place that is not on your plan. Choose where each one lives.</p>
          {!places.length && <p className="text-sm text-muted">Add a fridge, cupboard or shelf to your plan first.</p>}
          <ul className="divide-y divide-line overflow-hidden rounded-theme border border-line">
            {other.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0"><span className="block truncate">{titleCase(it.name)}</span>{it.place && <span className="block truncate text-xs text-muted">in “{it.place}”</span>}</span>
                <Select className="h-11 w-40 shrink-0" aria-label={`Put ${titleCase(it.name)} in`} value="" placeholder="Put in…" onChange={(v) => void setPlace(it, v)} options={places.map((p) => ({ value: p.name, label: titleCase(p.name) }))} />
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </div>
  );
}

/** Items that could be kept in this place: first the ones in the same category as what is already here, then the rest. */
function Candidates({ open, tracked, byBlock, q, onPick }: { open: Block; tracked: Item[]; byBlock: Map<string, Item[]>; q: string; onPick(i: Item): void }) {
  const here = placeOf(open);
  const mineCats = new Set((byBlock.get(open.id) ?? []).map((i) => i.category));
  const pool = (q.trim() ? searchItems(tracked, q, 60) : [...tracked].sort((a, b) => Number(!!a.place) - Number(!!b.place) || a.name.localeCompare(b.name))).filter((i) => norm(i.place) !== norm(here));
  const same = q.trim() ? [] : pool.filter((i) => mineCats.has(i.category)).slice(0, 20);
  const rest = pool.filter((i) => !same.includes(i)).slice(0, 40);
  const row = (it: Item) => (
    <li key={it.id}><button className="flex min-h-[2.75rem] w-full items-center justify-between gap-2 px-3 py-2 text-left" onClick={() => onPick(it)}>
      <span className="min-w-0 truncate">{titleCase(it.name)}</span><span className="shrink-0 text-xs text-muted">{it.place ? `now in ${titleCase(it.place)}` : 'no place yet'}</span></button></li>
  );
  return (
    <div className="space-y-3">
      {same.length > 0 && (
        <div className="space-y-1"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">In the same category</h3>
          <p className="text-xs text-muted">Things like what is already in the {here?.toLowerCase()}.</p>
          <ul className="divide-y divide-line overflow-hidden rounded-theme border border-line">{same.map(row)}</ul></div>
      )}
      <div className="space-y-1">{same.length > 0 && <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Everything else</h3>}
        {rest.length ? <ul className="divide-y divide-line overflow-hidden rounded-theme border border-line">{rest.map(row)}</ul> : !same.length && <p className="text-sm text-muted">Nothing to move here.</p>}</div>
    </div>
  );
}

function PlaceSheet({ block, name, list, onClose, onChange, onOut, onList, onTakeOut, onAdd }: { block: Block; name: string; list: Item[]; onClose(): void; onChange: Kitchen3DProps['onChange']; onOut: Kitchen3DProps['onOut']; onList: Kitchen3DProps['onList']; onTakeOut(i: Item): void; onAdd(): void }) {
  const sorted = [...list].sort((a, b) => Number(isOut(b) || isLow(b)) - Number(isOut(a) || isLow(a)) || a.name.localeCompare(b.name));
  return (
    <Sheet title={titleCase(name)} onClose={onClose} footer={<button className="btn flex h-11 w-full items-center justify-center gap-1.5" onClick={onAdd}><Plus size={18} />Keep something here</button>}>
      {!sorted.length ? <p className="py-4 text-center text-sm text-muted">Nothing is kept in the {name.toLowerCase()} yet.{block.kind === 'wall' ? '' : ' Use the button below to move items here.'}</p> : (
        <ul className="divide-y divide-line overflow-hidden rounded-theme border border-line">
          {sorted.map((it) => (
            <li key={it.id} className="space-y-1 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2"><span className="min-w-0 truncate font-medium">{titleCase(it.name)}</span>
                {(isOut(it) || isLow(it)) && <span className={cn('shrink-0 text-xs font-semibold', isOut(it) ? 'text-bad' : 'text-warn')}>{isOut(it) ? 'out' : 'running low'}</span>}</div>
              <div className="flex items-center justify-between gap-1">
                <Stepper compact label={titleCase(it.name)} value={it.qty} step={it.step} unit={it.unit} onChange={(v) => onChange(it, v)} />
                <span className="flex shrink-0">
                  <button className="btn btn-ghost flex h-10 w-10 items-center justify-center !p-0" aria-label={`Mark ${titleCase(it.name)} as out`} title="Mark as out" disabled={isOut(it)} onClick={() => onOut(it)}><PackageX size={18} /></button>
                  <button className="btn btn-ghost flex h-10 w-10 items-center justify-center !p-0" aria-label={`Add ${titleCase(it.name)} to the list`} title="Add to the shopping list" onClick={() => onList(it)}><ShoppingCart size={18} /></button>
                  <button className="btn btn-ghost flex h-10 w-10 items-center justify-center !p-0" aria-label={`${titleCase(it.name)} is not kept here`} title="Not kept here" onClick={() => onTakeOut(it)}><MapPinOff size={18} /></button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
