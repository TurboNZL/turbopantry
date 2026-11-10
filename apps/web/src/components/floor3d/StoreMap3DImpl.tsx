import { useMemo, useState } from 'react';
import { Footprints, LocateFixed } from 'lucide-react';
import { FLOOR, footprint, formatStock, titleCase, walkOrder, type ListEntry } from '@turbopantry/shared';
import { useLayout } from '../../lib/useLayout.ts';
import { useApi } from '../../lib/useApi.ts';
import { toast } from '../../lib/toast.ts';
import { cn } from '../../lib/cn.ts';
import { CELL, useCamera } from './camera.ts';
import { Scene3D, type BlockInfo } from './Scene3D.tsx';
import { Stage3D } from './Stage3D.tsx';
import type { StoreMap3DProps } from './types.ts';

/** A shop as a full-screen 3D view: the areas you drew carry shopping groups; pick one (in the view or the panel) to zoom in and see what your list needs from it. */
export function StoreMap3DImpl({ store, entries, items, onClose }: StoreMap3DProps) {
  const api = useApi();
  const { layout, loaded } = useLayout('store', store.id);
  const cam = useCamera(true); // starts straight down: tap where you are to come in close
  const [openId, setOpenId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const todo = useMemo(() => entries.filter((e) => !e.checked), [entries]);
  const walking = layout.blocks.some((b) => b.walk !== undefined && b.groups?.length);
  const SIZE = FLOOR.store * CELL;

  const { lines, rest } = useMemo(() => {
    const claimed = new Set<ListEntry>(), map = new Map<string, ListEntry[]>();
    for (const b of layout.blocks) {
      const mine = todo.filter((e) => b.groups?.includes(e.category));
      mine.forEach((e) => claimed.add(e));
      map.set(b.id, mine);
    }
    return { lines: map, rest: todo.filter((e) => !claimed.has(e)) };
  }, [layout.blocks, todo]);

  const info = useMemo(() => {
    const m = new Map<string, BlockInfo>();
    for (const b of layout.blocks) {
      const n = lines.get(b.id)?.length ?? 0;
      if (b.walk !== undefined) m.set(b.id, { badge: b.walk, tone: 'walk', hot: n > 0 });
      else if (n) m.set(b.id, { badge: n, tone: 'warn', hot: true });
    }
    return m;
  }, [layout.blocks, lines]);

  const named = useMemo(() => [...layout.blocks].filter((b) => b.label || b.groups?.length).sort((a, b) => (a.walk ?? 999) - (b.walk ?? 999) || a.label.localeCompare(b.label)), [layout.blocks]);
  const open = layout.blocks.find((b) => b.id === openId) ?? null;
  const centre = (b: (typeof layout.blocks)[number]) => { const f = footprint(b); return { x: (b.x + f.w / 2) * CELL - SIZE / 2, y: (b.y + f.d / 2) * CELL - SIZE / 2 }; };
  const pick = (id: string | null) => {
    const b = id ? layout.blocks.find((x) => x.id === id) : undefined;
    if (!b) { setOpenId(null); return; }
    setOpenId(b.id); setDrawer(true);
    const c = centre(b); cam.closeUp(c.x, c.y);
  };

  async function useOrder() {
    try { await api.updateStore(store.id, { order: walkOrder(layout.blocks, store.order) }); toast(`${store.name} now follows this walking order.`); } catch (e) { toast((e as Error).message); }
  }
  const nameOf = (e: ListEntry) => titleCase((e.itemId ? byId.get(e.itemId)?.name : null) ?? e.name);
  const amount = (e: ListEntry) => (e.qty ? formatStock(e.qty, e.unit) : '');

  const panel = (
    <div className="space-y-3 p-3">
      <div className="flex flex-wrap gap-2">
        {!cam.top && <button className="btn flex h-10 items-center gap-1.5 px-3" onClick={() => { setOpenId(null); cam.overview(); }}><LocateFixed size={16} />Top down</button>}
        {walking && <button className="btn flex h-10 items-center gap-1.5 px-3" onClick={() => void useOrder()}><Footprints size={16} />Use this walking order</button>}
      </div>
      {!layout.blocks.length && loaded && <p className="text-sm text-muted">{store.name} has no map yet. Draw its areas in Settings › Stores.</p>}
      <ul className="space-y-1">
        {named.map((b) => { const n = lines.get(b.id)?.length ?? 0;
          return <li key={b.id}><button className={cn('flex min-h-[2.75rem] w-full items-center justify-between gap-2 rounded-theme border px-3 text-left', openId === b.id ? 'border-accent bg-accent/10' : 'border-line')} aria-pressed={openId === b.id} onClick={() => pick(b.id)}>
            <span className="flex min-w-0 items-center gap-2">{b.walk !== undefined && <b className="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1 text-xs text-accent-fg">{b.walk}</b>}<span className="min-w-0 truncate font-medium">{titleCase(b.label) || (b.groups ?? []).join(', ')}</span></span>
            {n > 0 && <b className="shrink-0 rounded-full bg-warn px-1.5 py-0.5 text-xs text-white">{n}</b>}</button></li>; })}
      </ul>
      {open && (
        <div className="space-y-2 border-t border-line pt-3">
          <h3 className="text-base font-semibold">{titleCase(open.label) || 'This area'}</h3>
          <div className="flex flex-wrap gap-1.5">{open.groups?.length ? open.groups.map((g) => <span key={g} className="chip px-2 py-1 text-xs">{g}</span>) : <span className="text-sm text-muted">No shopping groups chosen yet.</span>}</div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">To grab here</h4>
          {(lines.get(open.id) ?? []).length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-theme border border-line">
              {lines.get(open.id)!.map((e) => <li key={e.id} className="flex min-h-[2.75rem] items-center justify-between gap-2 px-3"><span className="min-w-0 truncate">{nameOf(e)}</span><span className="shrink-0 text-sm text-muted">{amount(e)}</span></li>)}
            </ul>
          ) : <p className="text-sm text-muted">Nothing on your list from here.</p>}
        </div>
      )}
      {rest.length > 0 && <p className="text-xs text-muted">{rest.length} {rest.length === 1 ? 'line' : 'lines'} on your list {rest.length === 1 ? 'is' : 'are'} in a group that no area of this map claims.</p>}
    </div>
  );

  return (
    <Stage3D title={`${store.name} map`} cam={cam} onClose={onClose} panel={panel} panelTitle="Areas" drawer={drawer} onDrawer={setDrawer}>
      {!loaded ? <div className="flex h-full items-center justify-center text-sm text-muted" role="status">Loading the map…</div>
        : <Scene3D fill cam={cam} size={FLOOR.store} blocks={layout.blocks} selectedId={openId} info={info} label={`${store.name} map`} onFloorTap={cam.top ? (x, y) => cam.closeUp(x, y) : undefined} onTap={pick} />}
    </Stage3D>
  );
}
