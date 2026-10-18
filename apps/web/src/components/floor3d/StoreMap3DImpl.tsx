import { useMemo, useState } from 'react';
import { Footprints, Pencil } from 'lucide-react';
import { FLOOR, formatStock, titleCase, walkOrder, type ListEntry } from '@turbopantry/shared';
import { useLayout } from '../../lib/useLayout.ts';
import { useApi } from '../../lib/useApi.ts';
import { toast } from '../../lib/toast.ts';
import { Sheet } from '../Sheet.tsx';
import { CameraPad } from './CameraPad.tsx';
import { useCamera } from './camera.ts';
import { LayoutEditor } from './LayoutEditor.tsx';
import { Scene3D, type BlockInfo } from './Scene3D.tsx';
import type { StoreMap3DProps } from './types.ts';

/** A shop as a 3D plan: aisles carry shopping groups; tap one to see what your list needs from it. */
export function StoreMap3DImpl({ store, entries, items }: StoreMap3DProps) {
  const api = useApi();
  const { layout, loaded, save } = useLayout('store', store.id);
  const cam = useCamera();
  const [editing, setEditing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const todo = useMemo(() => entries.filter((e) => !e.checked), [entries]);
  const walking = layout.blocks.some((b) => b.walk !== undefined && b.groups?.length);

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

  async function useOrder() {
    try { await api.updateStore(store.id, { order: walkOrder(layout.blocks, store.order) }); toast(`${store.name} now follows this walking order.`); } catch (e) { toast((e as Error).message); }
  }
  const nameOf = (e: ListEntry) => titleCase((e.itemId ? byId.get(e.itemId)?.name : null) ?? e.name);
  const amount = (e: ListEntry) => (e.qty ? formatStock(e.qty, e.unit) : '');

  if (!loaded) return <div className="card p-8 text-center text-sm text-muted" role="status">Loading the map…</div>;
  if (editing) return <LayoutEditor kind="store" layout={layout} cam={cam} onSave={(l) => void save(l)} onDone={() => setEditing(false)} />;
  const open = layout.blocks.find((b) => b.id === openId) ?? null;

  if (!layout.blocks.length) return (
    <div className="card space-y-3 p-6 text-center">
      <h2 className="font-semibold">Map {store.name}</h2>
      <p className="text-sm text-muted">Draw the aisles, then say which shopping groups are in each and the order you walk. Your list can then follow it.</p>
      <button className="btn btn-accent h-11 px-4" onClick={() => setEditing(true)}>Build the map</button>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn flex h-11 items-center gap-1.5 px-3" onClick={() => setEditing(true)}><Pencil size={16} />Edit map</button>
        {walking && <button className="btn flex h-11 items-center gap-1.5 px-3" onClick={() => void useOrder()}><Footprints size={16} />Use this walking order</button>}
      </div>
      <Scene3D cam={cam} size={FLOOR.store} blocks={layout.blocks} selectedId={openId} info={info} label={`${store.name} map`} onTap={(id) => { const b = layout.blocks.find((x) => x.id === id); setOpenId(b ? b.id : null); }} />
      <CameraPad cam={cam} />
      <p className="text-center text-xs text-muted">{walking ? 'Blue numbers are the order you walk. ' : ''}Orange numbers are things on your list in that part of the shop.</p>
      {rest.length > 0 && <p className="text-center text-xs text-muted">{rest.length} {rest.length === 1 ? 'line' : 'lines'} on your list {rest.length === 1 ? 'is' : 'are'} in a group that no part of this map claims.</p>}

      {open && (
        <Sheet title={titleCase(open.label)} onClose={() => setOpenId(null)}>
          {open.walk !== undefined && <p className="text-sm text-muted">Stop {open.walk} on your walk.</p>}
          <div className="space-y-1"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Shopping groups</h3>
            <div className="flex flex-wrap gap-1.5">{open.groups?.length ? open.groups.map((g) => <span key={g} className="chip px-2 py-1 text-xs">{g}</span>) : <span className="text-sm text-muted">None chosen yet. Edit the map to choose them.</span>}</div></div>
          <div className="space-y-1"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">To grab here</h3>
            {(lines.get(open.id) ?? []).length ? (
              <ul className="divide-y divide-line overflow-hidden rounded-theme border border-line">
                {lines.get(open.id)!.map((e) => <li key={e.id} className="flex min-h-[2.75rem] items-center justify-between gap-2 px-3"><span className="min-w-0 truncate">{nameOf(e)}</span><span className="shrink-0 text-sm text-muted">{amount(e)}</span></li>)}
              </ul>
            ) : <p className="text-sm text-muted">Nothing on your list from here.</p>}</div>
        </Sheet>
      )}
    </div>
  );
}
