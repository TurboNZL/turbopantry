import { useEffect, useMemo, useRef, useState } from 'react';
import { Hand, Pencil, Redo2, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { BLOCK_COLORS, FLOOR, MAX_BLOCKS, MAX_LABEL, blockToZone, clampBlock, newId, sectionOf, titleCase, type Block, type Layout } from '@turbopantry/shared';
import { cn } from '../../lib/cn.ts';
import { Stepper } from '../Stepper.tsx';
import { GroupSheet } from './LayoutEditor.tsx';

const SIZE = FLOOR.store;
const HISTORY = 40;
const colorFor = (groups: string[] | undefined) => { const s = groups?.[0] ? sectionOf(groups[0]) : ''; let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return s ? BLOCK_COLORS[h % BLOCK_COLORS.length]! : BLOCK_COLORS[6]!; };

/**
 * Draws a shop: drag on the grid to mark out an area, then say which shopping groups it holds and where it comes in the walk. Areas are flat rectangles
 * (they show as tiles in the 3D map). Snapping puts a corner on the nearest grid line or on the side of a neighbouring area; with it off the corners go
 * where you put them (quarter cells). An older plan made of blocks is turned into areas the first time it is opened here.
 */
export function ZoneEditor({ layout, onSave }: { layout: Layout; onSave(l: Layout): void }) {
  const [zones, setZones] = useState<Block[]>(() => layout.blocks.map(blockToZone));
  const [past, setPast] = useState<Block[][]>([]);
  const [future, setFuture] = useState<Block[][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [snap, setSnap] = useState(true);
  const [look, setLook] = useState(false); // scroll the view with a finger instead of drawing
  const [zoom, setZoom] = useState(1);
  const [groupsFor, setGroupsFor] = useState(false);
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; d: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const ref = useRef(zones); ref.current = zones;
  const dirty = useRef(false);
  const saveRef = useRef(onSave); saveRef.current = onSave;
  const gesture = useRef<{ kind: 'draw'; x: number; y: number } | { kind: 'move'; id: string; ox: number; oy: number; zx: number; zy: number; base: Block[] } | { kind: 'size'; id: string; base: Block[] } | null>(null);
  const sel = zones.find((z) => z.id === selected) ?? null;

  useEffect(() => {
    if (!dirty.current) return;
    const t = window.setTimeout(() => { dirty.current = false; saveRef.current({ blocks: zones }); }, 500);
    return () => window.clearTimeout(t);
  }, [zones]);
  useEffect(() => () => { if (dirty.current) { dirty.current = false; saveRef.current({ blocks: ref.current }); } }, []);

  const apply = (next: Block[]) => { dirty.current = true; setZones(next); };
  const commit = (next: Block[], base = ref.current) => { setPast((p) => [...p.slice(-(HISTORY - 1)), base]); setFuture([]); apply(next); };
  const undo = () => { const p = past.at(-1); if (!p) return; setPast(past.slice(0, -1)); setFuture((f) => [ref.current, ...f]); apply(p); setSelected(null); };
  const redo = () => { const n = future[0]; if (!n) return; setFuture(future.slice(1)); setPast((p) => [...p, ref.current]); apply(n); };
  const edit = (id: string, patch: Partial<Block>) => commit(ref.current.map((z) => (z.id === id ? clampBlock({ ...z, ...patch }, SIZE) : z)));

  const edges = useMemo(() => ({ xs: zones.flatMap((z) => [z.x, z.x + z.w]), ys: zones.flatMap((z) => [z.y, z.y + z.d]) }), [zones]);
  /** A coordinate with snapping applied: the nearest whole cell, or a neighbouring area's side when one is closer than that. */
  const fit = (v: number, along: number[], skip?: Block): number => {
    if (!snap) return Math.round(v * 4) / 4;
    let best = Math.round(v), dist = Math.abs(v - best);
    for (const e of along) { if (skip && (e === skip.x || e === skip.x + skip.w || e === skip.y || e === skip.y + skip.d)) continue; if (Math.abs(v - e) < Math.min(dist, 0.7)) { best = e; dist = Math.abs(v - e); } }
    return best;
  };
  const at = (e: React.PointerEvent) => { const r = svg.current!.getBoundingClientRect(); return { x: Math.min(SIZE, Math.max(0, ((e.clientX - r.left) / r.width) * SIZE)), y: Math.min(SIZE, Math.max(0, ((e.clientY - r.top) / r.height) * SIZE)) }; };

  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (look) return;
    const p = at(e), target = (e.target as Element).closest<SVGElement>('[data-zid]'), handle = (e.target as Element).closest('[data-handle]');
    svg.current!.setPointerCapture(e.pointerId);
    if (handle && target) { gesture.current = { kind: 'size', id: target.dataset.zid!, base: ref.current }; return; }
    if (target) { const z = ref.current.find((x) => x.id === target.dataset.zid)!; setSelected(z.id); gesture.current = { kind: 'move', id: z.id, ox: p.x, oy: p.y, zx: z.x, zy: z.y, base: ref.current }; return; }
    setSelected(null);
    gesture.current = { kind: 'draw', x: fit(p.x, edges.xs), y: fit(p.y, edges.ys) };
    setDraft(null);
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current; if (!g) return;
    const p = at(e);
    if (g.kind === 'draw') { const x2 = fit(p.x, edges.xs), y2 = fit(p.y, edges.ys); setDraft({ x: Math.min(g.x, x2), y: Math.min(g.y, y2), w: Math.abs(x2 - g.x), d: Math.abs(y2 - g.y) }); }
    else if (g.kind === 'move') {
      const z = ref.current.find((x) => x.id === g.id); if (!z) return;
      const nx = fit(g.zx + (p.x - g.ox), edges.xs, z), ny = fit(g.zy + (p.y - g.oy), edges.ys, z);
      // the far sides snap too, so an area can sit flush against its neighbour from either side
      const fx = snap ? fit(g.zx + (p.x - g.ox) + z.w, edges.xs, z) - z.w : nx, fy = snap ? fit(g.zy + (p.y - g.oy) + z.d, edges.ys, z) - z.d : ny;
      const ux = Math.abs(fx - (g.zx + (p.x - g.ox))) < Math.abs(nx - (g.zx + (p.x - g.ox))) ? fx : nx, uy = Math.abs(fy - (g.zy + (p.y - g.oy))) < Math.abs(ny - (g.zy + (p.y - g.oy))) ? fy : ny;
      apply(ref.current.map((x) => (x.id === g.id ? clampBlock({ ...x, x: ux, y: uy }, SIZE) : x)));
    } else {
      const z = ref.current.find((x) => x.id === g.id); if (!z) return;
      apply(ref.current.map((x) => (x.id === g.id ? clampBlock({ ...x, w: Math.max(0.5, fit(p.x, edges.xs, z) - z.x), d: Math.max(0.5, fit(p.y, edges.ys, z) - z.y) }, SIZE) : x)));
    }
  };
  const up = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current; gesture.current = null;
    try { svg.current?.releasePointerCapture(e.pointerId); } catch { /* released */ }
    if (!g) return;
    if (g.kind === 'draw') {
      const d = draft; setDraft(null);
      if (!d || d.w < 0.5 || d.d < 0.5) return;
      if (ref.current.length >= MAX_BLOCKS) return;
      const z = clampBlock({ id: newId(), kind: 'zone', x: d.x, y: d.y, w: d.w, d: d.d, h: 1, rot: 0, label: '', color: BLOCK_COLORS[6]!, groups: [] }, SIZE);
      commit([...ref.current, z]); setSelected(z.id); setGroupsFor(true);
    } else if (ref.current !== g.base) { setPast((p) => [...p.slice(-(HISTORY - 1)), g.base]); setFuture([]); }
  };

  const remove = () => { if (!sel) return; commit(zones.filter((z) => z.id !== sel.id)); setSelected(null); };
  const fs = Math.max(0.9, 1.15 / Math.sqrt(zoom));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn flex h-11 w-11 items-center justify-center !p-0" onClick={undo} disabled={!past.length} aria-label="Undo"><Undo2 size={18} /></button>
        <button className="btn flex h-11 w-11 items-center justify-center !p-0" onClick={redo} disabled={!future.length} aria-label="Redo"><Redo2 size={18} /></button>
        <div role="radiogroup" aria-label="What a finger does" className="grid grid-cols-2 gap-1 rounded-theme border border-line bg-raised p-1">
          <button role="radio" aria-checked={!look} className={cn('flex min-h-[2.5rem] items-center gap-1.5 rounded-theme px-3 text-sm font-medium', !look ? 'bg-accent text-accent-fg' : 'text-muted')} onClick={() => setLook(false)}><Pencil size={15} />Draw</button>
          <button role="radio" aria-checked={look} className={cn('flex min-h-[2.5rem] items-center gap-1.5 rounded-theme px-3 text-sm font-medium', look ? 'bg-accent text-accent-fg' : 'text-muted')} onClick={() => setLook(true)}><Hand size={15} />Scroll</button>
        </div>
        <button className="btn flex h-11 w-11 items-center justify-center !p-0" onClick={() => setZoom((z) => Math.max(1, z / 1.5))} aria-label="Zoom out" disabled={zoom <= 1}><ZoomOut size={18} /></button>
        <button className="btn flex h-11 w-11 items-center justify-center !p-0" onClick={() => setZoom((z) => Math.min(5, z * 1.5))} aria-label="Zoom in" disabled={zoom >= 5}><ZoomIn size={18} /></button>
        <button type="button" role="switch" aria-checked={snap} onClick={() => setSnap(!snap)} className="flex h-11 items-center gap-2 rounded-theme border border-line bg-raised px-3 text-sm">
          <span className={cn('relative h-5 w-9 rounded-full transition-colors', snap ? 'bg-accent' : 'bg-line')}><span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', snap ? 'left-[1.125rem]' : 'left-0.5')} /></span>Snap to edges</button>
      </div>
      <p className="text-sm text-muted">{look ? 'Drag to scroll around the shop. Switch back to Draw to mark out areas.' : 'Drag across the grid to mark out an area (an aisle, the deli, the fridges). Drag an area to move it, or its corner dot to resize.'} {zones.length}/{MAX_BLOCKS} areas.</p>
      <div className="overflow-auto rounded-theme border border-line bg-surface" style={{ maxHeight: '70vh', touchAction: look ? 'pan-x pan-y' : 'auto' }}>
        <svg ref={svg} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: `${zoom * 100}%`, display: 'block', touchAction: look ? 'pan-x pan-y' : 'none', cursor: look ? 'grab' : 'crosshair' }} role="application" aria-label="Shop floor, drawing area"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <defs><pattern id="zgrid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="hsl(var(--line))" strokeWidth="0.04" opacity="0.8" /></pattern>
            <pattern id="zgrid8" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M8 0H0V8" fill="none" stroke="hsl(var(--line))" strokeWidth="0.1" /></pattern></defs>
          <rect width={SIZE} height={SIZE} fill="url(#zgrid)" /><rect width={SIZE} height={SIZE} fill="url(#zgrid8)" />
          {zones.map((z) => (
            <g key={z.id} data-zid={z.id} style={{ cursor: look ? 'grab' : 'move' }}>
              <rect x={z.x} y={z.y} width={z.w} height={z.d} fill={z.color} fillOpacity={0.78} stroke={z.id === selected ? 'hsl(var(--accent))' : 'rgb(0 0 0 / .45)'} strokeWidth={z.id === selected ? 0.22 : 0.08} />
              <text x={z.x + z.w / 2} y={z.y + z.d / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(fs, z.w * 0.28 + 0.4)} fontWeight="700" fill="#111" style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: 'rgb(255 255 255 / .7)', strokeWidth: 0.12 }}>{z.walk !== undefined ? `${z.walk}. ` : ''}{titleCase(z.label) || (z.groups ?? []).slice(0, 2).join(', ')}</text>
              {z.id === selected && <circle data-handle="1" cx={z.x + z.w} cy={z.y + z.d} r={Math.max(0.55, 0.9 / Math.sqrt(zoom))} fill="hsl(var(--accent))" stroke="#fff" strokeWidth="0.12" style={{ cursor: 'nwse-resize' }} />}
            </g>
          ))}
          {draft && <rect x={draft.x} y={draft.y} width={draft.w} height={draft.d} fill="hsl(var(--accent))" fillOpacity={0.3} stroke="hsl(var(--accent))" strokeWidth="0.15" strokeDasharray="0.5 0.3" pointerEvents="none" />}
        </svg>
      </div>

      {sel ? (
        <div className="card space-y-3 p-3">
          <label className="block text-sm"><span className="mb-1 block font-medium">Name <span className="font-normal text-muted">(optional)</span></span>
            <input className="input h-11 w-full" value={sel.label} maxLength={MAX_LABEL} placeholder="e.g. Aisle 3, Deli" aria-label="Area name" onChange={(e) => apply(zones.map((z) => (z.id === sel.id ? { ...z, label: e.target.value } : z)))} onBlur={() => commit(zones, zones)} /></label>
          <div className="space-y-2">
            <div className="text-sm font-medium">Shopping groups here</div>
            <div className="flex flex-wrap gap-1.5">{(sel.groups ?? []).length ? sel.groups!.map((g) => <span key={g} className="chip px-2 py-1 text-xs">{g}</span>) : <span className="text-sm text-muted">None yet.</span>}</div>
            <button className="btn h-11 px-3" onClick={() => setGroupsFor(true)}>Choose groups</button>
          </div>
          <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">Stop on the walk <span className="font-normal text-muted">(0 = not on it)</span></span>
            <Stepper compact label="Stop on the walk" value={sel.walk ?? 0} step={1} unit={null} min={0} max={MAX_BLOCKS} onChange={(v) => { const { walk: _w, ...rest } = sel; commit(zones.map((z) => (z.id === sel.id ? (v > 0 ? { ...rest, walk: v } : rest) : z))); }} /></div>
          <button className="btn flex h-11 items-center gap-1.5 px-3 text-bad" onClick={remove}><Trash2 size={18} />Delete this area</button>
        </div>
      ) : <div className="card p-5 text-center text-sm text-muted">{zones.length ? 'Tap an area to name it, give it shopping groups and a place in the walk.' : 'Drag across the grid to draw the first area.'}</div>}

      {groupsFor && sel && <GroupSheet block={sel} onChange={(groups) => edit(sel.id, { groups, color: colorFor(groups) })} onClose={() => setGroupsFor(false)} />}
    </div>
  );
}
