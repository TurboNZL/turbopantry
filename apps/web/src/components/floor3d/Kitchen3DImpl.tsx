import { useMemo, useState } from 'react';
import { MapPinOff, PackageX, Plus, Search, ShoppingCart } from 'lucide-react';
import { placeOf, searchItems, titleCase, FLOOR, footprint, type Block, type Item } from '@turbopantry/shared';
import { useLayout } from '../../lib/useLayout.ts';
import { useApi } from '../../lib/useApi.ts';
import { toast } from '../../lib/toast.ts';
import { cn } from '../../lib/cn.ts';
import { Sheet } from '../Sheet.tsx';
import { Select } from '../Select.tsx';
import { Stepper } from '../Stepper.tsx';
import { CELL } from './camera.ts';
import { useCamera } from './camera.ts';
import { Scene3D, type BlockInfo } from './Scene3D.tsx';
import { Stage3D } from './Stage3D.tsx';
import type { Kitchen3DProps } from './types.ts';

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const isOut = (i: Item) => i.qty <= 0;
const isLow = (i: Item) => i.minQty > 0 && i.qty <= i.minQty;

/** The kitchen as a full-screen 3D view: tap a place (or pick it in the panel) to zoom in and see what is kept there, with the same buttons as the pantry list. */
export function Kitchen3DImpl({ items, onChange, onOut, onList, onClose }: Kitchen3DProps) {
  const api = useApi();
  const { layout, loaded } = useLayout('pantry');
  const cam = useCamera();
  const [openId, setOpenId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
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

  const placed = useMemo(() => layout.blocks.filter((b) => placeOf(b)), [layout.blocks]);
  const places = useMemo(() => placed.map((b) => ({ id: b.id, name: placeOf(b)! })), [placed]);
  const open = layout.blocks.find((b) => b.id === openId) ?? null;
  const SIZE = FLOOR.pantry * CELL;
  const pick = (id: string | null) => {
    const b = id ? layout.blocks.find((x) => x.id === id) : undefined;
    if (!b || !placeOf(b)) { setOpenId(null); return; }
    setOpenId(b.id); setDrawer(true);
    const f = footprint(b);
    cam.closeUp((b.x + f.w / 2) * CELL - SIZE / 2, (b.y + f.d / 2) * CELL - SIZE / 2); // come in close on the place
  };

  async function setPlace(item: Item, place: string | null) {
    try { await api.updateItem(item.id, { place }); toast(place ? `${titleCase(item.name)} is in ${place}` : `${titleCase(item.name)} has no place now`); } catch (e) { toast((e as Error).message); }
  }

  const panel = !loaded ? <p className="p-4 text-sm text-muted">Loading the kitchen…</p> : (
    <div>
      <div className="border-b border-line p-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Places</h3>
        {!placed.length ? <p className="mt-1 text-sm text-muted">No places yet. Build your kitchen in Settings › Kitchen.</p> : (
          <ul className="mt-1 space-y-1">
            {placed.map((b) => { const n = byBlock.get(b.id)?.length ?? 0, bad = info.get(b.id)?.tone === 'warn' ? info.get(b.id)!.badge : 0;
              return <li key={b.id}><button className={cn('flex min-h-[2.75rem] w-full items-center justify-between gap-2 rounded-theme border px-3 text-left', openId === b.id ? 'border-accent bg-accent/10' : 'border-line')} aria-pressed={openId === b.id} onClick={() => pick(b.id)}>
                <span className="min-w-0 truncate font-medium">{titleCase(placeOf(b)!)}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">{bad ? <b className="rounded-full bg-warn px-1.5 py-0.5 text-white">{bad} low</b> : null}{n}</span></button></li>; })}
          </ul>)}
        {other.length > 0 && <button className="chip mt-2 inline-flex min-h-[2.5rem] items-center gap-1.5 px-3" onClick={() => setElsewhere(true)}>Elsewhere<span className="font-semibold">{other.length}</span></button>}
      </div>
      {open && placeOf(open) ? <PlaceItems block={open} name={placeOf(open)!} list={byBlock.get(open.id) ?? []} onChange={onChange} onOut={onOut} onList={onList} onTakeOut={(it) => void setPlace(it, null)} onAdd={() => { setQ(''); setAdding(true); }} />
        : placed.length > 0 && <p className="p-4 text-sm text-muted">Pick a place here, or tap one in the view, to see what is kept in it.</p>}
    </div>
  );

  return (
    <Stage3D title="Kitchen" cam={cam} onClose={onClose} panel={panel} drawer={drawer} onDrawer={setDrawer}>
      {!loaded ? <div className="flex h-full items-center justify-center text-sm text-muted" role="status">Loading the kitchen…</div>
        : <Scene3D fill cam={cam} size={FLOOR.pantry} blocks={layout.blocks} selectedId={openId} info={info} label="Kitchen" onTap={pick} />}
      {adding && open && (
        <Sheet title={`Keep in ${placeOf(open)}`} onClose={() => setAdding(false)} footer={<button className="btn h-11 w-full" onClick={() => setAdding(false)}>Back</button>}>
          <label className="relative block"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden /><input className="input h-11 w-full pl-9" placeholder="Find an item" aria-label="Find an item" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></label>
          <Candidates open={open} tracked={tracked} byBlock={byBlock} q={q} onPick={(it) => { void setPlace(it, placeOf(open)); setAdding(false); }} />
        </Sheet>
      )}
      {elsewhere && (
        <Sheet title="Elsewhere" onClose={() => setElsewhere(false)}>
          <p className="text-sm text-muted">These have no place, or a place that is not on your plan. Choose where each one lives.</p>
          {!places.length && <p className="text-sm text-muted">Add a fridge, cupboard or shelf in Settings › Kitchen first.</p>}
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
    </Stage3D>
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

function PlaceItems({ block, name, list, onChange, onOut, onList, onTakeOut, onAdd }: { block: Block; name: string; list: Item[]; onChange: Kitchen3DProps['onChange']; onOut: Kitchen3DProps['onOut']; onList: Kitchen3DProps['onList']; onTakeOut(i: Item): void; onAdd(): void }) {
  const sorted = [...list].sort((a, b) => Number(isOut(b) || isLow(b)) - Number(isOut(a) || isLow(a)) || a.name.localeCompare(b.name));
  return (
    <div className="space-y-2 p-3">
      <h3 className="text-base font-semibold">{titleCase(name)}</h3>
      {!sorted.length ? <p className="py-2 text-sm text-muted">Nothing is kept in the {name.toLowerCase()} yet.{block.kind === 'wall' ? '' : ' Use the button below to move items here.'}</p> : (
        <ul className="divide-y divide-line overflow-hidden rounded-theme border border-line">
          {sorted.map((it) => (
            <li key={it.id} className="space-y-1 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2"><span className="min-w-0 truncate font-medium">{titleCase(it.name)}</span>
                {(isOut(it) || isLow(it)) && <span className={cn('shrink-0 text-xs font-semibold', isOut(it) ? 'text-bad' : 'text-warn')}>{isOut(it) ? 'out' : 'running low'}</span>}</div>
              <div className="flex items-center justify-between gap-1">
                <span className="flex shrink-0 items-center">
                  <button className="btn btn-ghost flex h-8 w-8 items-center justify-center !p-0 disabled:opacity-30" aria-label={`Mark ${titleCase(it.name)} as out`} title="Mark as out" disabled={isOut(it)} onClick={() => onOut(it)}><PackageX size={17} /></button>
                  <Stepper compact label={titleCase(it.name)} value={it.qty} step={it.step} unit={it.unit} onChange={(v) => onChange(it, v)} />
                  <button className="btn btn-ghost flex h-8 w-8 items-center justify-center !p-0" aria-label={`Add ${titleCase(it.name)} to the list`} title="Add to the shopping list" onClick={() => onList(it)}><ShoppingCart size={17} /></button>
                </span>
                <button className="btn btn-ghost flex h-8 w-8 items-center justify-center !p-0" aria-label={`${titleCase(it.name)} is not kept here`} title="Not kept here" onClick={() => onTakeOut(it)}><MapPinOff size={17} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button className="btn flex h-11 w-full items-center justify-center gap-1.5" onClick={onAdd}><Plus size={18} />Keep something here</button>
    </div>
  );
}
