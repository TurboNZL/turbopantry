import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { canPlace, footprint, snap, titleCase, type Block } from '@turbopantry/shared';
import { CELL, STEP_H, screenToFloor, type CameraApi } from './camera.ts';
import './floor3d.css';

export interface BlockInfo { badge?: string | number; tone?: 'warn' | 'ok' | 'walk'; hot?: boolean }

const FRONT: Record<number, string> = { 0: 's', 90: 'w', 180: 'n', 270: 'e' };

const Block3D = memo(function Block3D({ b, selected, editable, hot }: { b: Block; selected: boolean; editable: boolean; hot?: boolean }) {
  const f = footprint(b);
  const style = { left: b.x * CELL, top: b.y * CELL, width: f.w * CELL, height: f.d * CELL, '--h': `${b.h * STEP_H}px`, '--z': `${(b.z ?? 0) * STEP_H}px`, '--c': b.color } as CSSProperties;
  return (
    <div className="f3-block" data-bid={b.id} data-kind={b.kind} data-front={FRONT[b.rot]} data-sel={selected || undefined} data-hot={hot || undefined} data-edit={editable || undefined} style={style}>
      <i className="f3-top" /><i className="f3-s" /><i className="f3-n" /><i className="f3-e" /><i className="f3-w" />
    </div>
  );
});

/**
 * Labels are drawn in a flat layer on top of the 3D scene (a label hidden behind a neighbouring block would be useless). Each one is placed by CSS
 * from the same camera variables as the scene, so it follows the block exactly, including while the camera animates.
 */
const Labels = memo(function Labels({ blocks, size, selectedId, editable, info }: { blocks: Block[]; size: number; selectedId?: string | null; editable: boolean; info?: Map<string, BlockInfo> }) {
  return (
    <div className="f3-labels" aria-hidden>
      {blocks.map((b) => {
        const i = info?.get(b.id), f = footprint(b), sel = b.id === selectedId;
        if (!b.label && i?.badge === undefined) return null;
        const style = { '--bx': ((b.x + f.w / 2) * CELL - (size * CELL) / 2), '--by': ((b.y + f.d / 2) * CELL - (size * CELL) / 2), '--bz': ((b.z ?? 0) + b.h) * STEP_H + 4 } as CSSProperties;
        return (
          <span key={b.id} className="f3-label" data-bid={b.id} data-sel={sel || undefined} style={style}>
            {i?.badge !== undefined && i.tone === 'walk' && <b className="walk">{i.badge}</b>}
            <span className="t">{titleCase(b.label)}</span>
            {i?.badge !== undefined && i.tone !== 'walk' && <b className={i.tone === 'warn' ? '' : 'ok'}>{i.badge}</b>}
          </span>
        );
      })}
    </div>
  );
});

type Gesture =
  | { mode: 'pinch'; dist: number; zoom: number }
  | { mode: 'block'; id: string; sx: number; sy: number; bx: number; by: number; moved: boolean; editable: boolean; /** every block under the finger, front to back */ stack: string[]; /** it was already the selected one */ was: boolean }
  | { mode: 'pan' | 'orbit'; lx: number; ly: number; moved: boolean };

/**
 * The 3D floor: boxes on a grid, seen from a camera you turn, tilt, zoom and pan. One finger on a block selects it (and, in the editor, drags it
 * with snapping and no overlaps); one finger on the empty floor pans or turns the view (the Move/Turn switch); two fingers pinch to zoom.
 * The mouse wheel zooms, shift or right-drag turns. Arrow keys pan the view (the editor claims them for the selected block through `onKey`).
 */
export function Scene3D({ cam, size, blocks, selectedId, editable = false, info, onTap, onDragStart, onMove, onDragEnd, onKey, onFloorTap, label = 'Floor plan', compact = false, children }: {
  cam: CameraApi; size: number; blocks: Block[]; selectedId?: string | null; editable?: boolean; info?: Map<string, BlockInfo>;
  onTap?(id: string | null): void; onDragStart?(id: string): void; onMove?(id: string, x: number, y: number): void; onDragEnd?(): void;
  /** Return true when the key was used. */
  onKey?(e: React.KeyboardEvent): boolean;
  /** A tap anywhere (block or floor) reports the spot instead of picking a block, in pixels from the floor's centre. For a straight-down overview. */
  onFloorTap?(cx: number, cy: number): void; label?: string; compact?: boolean; children?: ReactNode;
}) {
  const vp = useRef<HTMLDivElement>(null);
  const blocksRef = useRef(blocks); blocksRef.current = blocks;
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<Gesture | null>(null);
  const tap = useRef<string | null | undefined>(undefined);
  const [gesturing, setGesturing] = useState(false);
  const { cam: c, setFit } = cam;

  // "fit": the blocks (or the whole floor while there are none) fill the scene
  const extent = useMemo(() => {
    if (!blocks.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, hh = 0;
    for (const b of blocks) { const f = footprint(b); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + f.w); y1 = Math.max(y1, b.y + f.d); hh = Math.max(hh, (b.z ?? 0) + b.h); }
    return { x0, y0, x1, y1, hh };
  }, [blocks]);
  useEffect(() => {
    const el = vp.current; if (!el) return;
    const fit = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!extent) { setFit(Math.min(1.4, (w * 0.94) / (size * CELL * 1.38)), 0, 0, false); return; }
      const span = Math.max(extent.x1 - extent.x0, extent.y1 - extent.y0, 6) * CELL * 1.42;
      const z = Math.min(2, (w * 0.86) / span, (h * 0.8) / (span * 0.6 + extent.hh * STEP_H));
      setFit(z, ((extent.x0 + extent.x1) / 2) * CELL - (size * CELL) / 2, ((extent.y0 + extent.y1) / 2) * CELL - (size * CELL) / 2, true);
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [size, setFit, extent]);

  // blocks added (or removed) before anyone has touched the camera: fit again, so the first few blocks are not tiny
  const count = blocks.length;
  const { refit } = cam;
  useEffect(() => { refit(); }, [count, refit]);

  // the wheel zooms (a listener of our own: React's is passive and could not stop the page from scrolling)
  useEffect(() => {
    const el = vp.current; if (!el) return;
    const h = (e: WheelEvent) => { e.preventDefault(); cam.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12); };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, [cam]);

  const down = (e: React.PointerEvent) => {
    tap.current = undefined;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    vp.current?.setPointerCapture(e.pointerId);
    setGesturing(true);
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      g.current = { mode: 'pinch', dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1, zoom: cam.ref.current.zoom };
      return;
    }
    const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-bid]');
    const isLabel = !!hit?.classList.contains('f3-label'); // a name tag always means its own block, however much is stacked around it
    // every block under the finger, front to back: where blocks overlap on screen the one in front is not always the one meant
    const stack = [...new Set(document.elementsFromPoint(e.clientX, e.clientY).filter((n) => !n.classList.contains('f3-label')).map((n) => (n as HTMLElement).closest<HTMLElement>('.f3-block')?.dataset.bid).filter((v): v is string => !!v))];
    let id = hit?.dataset.bid;
    const was = !!id && id === selectedId;
    // tapping the selected block again picks the next one behind it, so a stack can be walked through
    if (id && !isLabel && !editable && stack.length > 1 && stack[0] === selectedId) id = stack[1];
    const blk = id ? blocksRef.current.find((b) => b.id === id) : undefined;
    if (blk) {
      g.current = { mode: 'block', id: blk.id, sx: e.clientX, sy: e.clientY, bx: blk.x, by: blk.y, moved: false, editable, stack: isLabel ? [blk.id] : stack, was: was && !isLabel };
      if (editable) onTap?.(blk.id);
    } else {
      const orbit = e.shiftKey || e.button === 2 || e.button === 1 || cam.drag === 'orbit';
      g.current = { mode: orbit ? 'orbit' : 'pan', lx: e.clientX, ly: e.clientY, moved: false };
    }
  };

  const move = (e: React.PointerEvent) => {
    const p = ptrs.current.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    const s = g.current; if (!s) return;
    if (s.mode === 'pinch') {
      if (ptrs.current.size < 2) return;
      const [a, b] = [...ptrs.current.values()];
      cam.setZoom(s.zoom * (Math.hypot(a!.x - b!.x, a!.y - b!.y) / s.dist));
    } else if (s.mode === 'block') {
      if (!s.editable) { if (Math.hypot(e.clientX - s.sx, e.clientY - s.sy) > 6) s.moved = true; return; }
      if (!s.moved) { if (Math.hypot(e.clientX - s.sx, e.clientY - s.sy) < 5) return; s.moved = true; onDragStart?.(s.id); }
      const cur = blocksRef.current.find((b) => b.id === s.id); if (!cur) return;
      const d = screenToFloor(cam.ref.current, e.clientX - s.sx, e.clientY - s.sy);
      const f = footprint(cur);
      const nx = Math.max(0, Math.min(size - f.w, snap(s.bx + d.x))), ny = Math.max(0, Math.min(size - f.d, snap(s.by + d.y)));
      // try the full move, then each axis alone, so a block slides along its neighbour instead of sticking
      for (const [x, y] of [[nx, ny], [nx, cur.y], [cur.x, ny]] as const) {
        if (x === cur.x && y === cur.y) break;
        if (canPlace(blocksRef.current, { ...cur, x, y }, size)) { onMove?.(s.id, x, y); break; }
      }
    } else {
      if (Math.abs(dx) + Math.abs(dy) > 0) s.moved = true;
      if (s.mode === 'pan') cam.panBy(dx, dy); else { cam.turn(dx * 0.45); cam.tilt(-dy * 0.3); }
    }
  };

  const up = (e: React.PointerEvent) => {
    const s = g.current;
    ptrs.current.delete(e.pointerId);
    try { vp.current?.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (ptrs.current.size > 0) { if (s?.mode === 'pinch') g.current = null; return; }
    g.current = null; setGesturing(false);
    if (!s || s.mode === 'pinch') return;
    // a tap that opens a sheet is reported from the click that follows (opening it on pointer-up would put the sheet under that click and close it again)
    if (s.mode === 'block') {
      if (s.moved && s.editable) onDragEnd?.();
      else if (!s.moved && !editable) tap.current = s.id;
      else if (!s.moved && editable && s.was && s.stack.length > 1) onTap?.(s.stack[(s.stack.indexOf(s.id) + 1) % s.stack.length]!); // a second tap on the selected block picks the one behind it
    }
    else if (!s.moved) { if (editable) onTap?.(null); else tap.current = null; }
  };
  const click = (e: React.MouseEvent) => {
    const t = tap.current; tap.current = undefined;
    if (t === undefined) return;
    if (onFloorTap && vp.current) {
      const r = vp.current.getBoundingClientRect(), k = cam.ref.current;
      const f = screenToFloor(k, e.clientX - r.left - r.width / 2 - k.px, e.clientY - r.top - r.height / 2 - k.py);
      onFloorTap(f.x * CELL, f.y * CELL); return;
    }
    onTap?.(t);
  };

  const keys = (e: React.KeyboardEvent) => {
    if (onKey?.(e)) { e.preventDefault(); return; }
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') { e.shiftKey ? cam.turn(k === 'ArrowLeft' ? -15 : 15) : cam.panBy(k === 'ArrowLeft' ? 40 : -40, 0); }
    else if (k === 'ArrowUp' || k === 'ArrowDown') { e.shiftKey ? cam.tilt(k === 'ArrowUp' ? -8 : 8) : cam.panBy(0, k === 'ArrowUp' ? 40 : -40); }
    else if (k === '+' || k === '=') cam.zoomBy(1.2);
    else if (k === '-') cam.zoomBy(1 / 1.2);
    else if (k === '0') cam.reset();
    else return;
    e.preventDefault();
  };

  const vars = { '--f3-yaw': `${c.yaw}deg`, '--f3-pitch': `${c.pitch}deg`, '--f3-z': c.zoom, '--f3-px': `${c.px}px`, '--f3-py': `${c.py}px` } as CSSProperties;
  const S = size * CELL;
  return (
    <div ref={vp} className="f3-viewport" style={vars} data-gesture={gesturing || undefined} data-compact={compact || undefined} role="application" tabIndex={0} aria-label={`${label}. Arrow keys move the view, plus and minus zoom, shift with arrows turns and tilts.`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={click} onContextMenu={(e) => e.preventDefault()} onKeyDown={keys}>
      <div className="f3-world">
        <div className="f3-floor" style={{ left: -S / 2, top: -S / 2, width: S, height: S }}>
          {blocks.map((b) => { const i = info?.get(b.id); return <Block3D key={b.id} b={b} selected={b.id === selectedId} editable={editable} hot={i?.hot} />; })}
        </div>
      </div>
      <Labels blocks={blocks} size={size} selectedId={selectedId} editable={editable} info={info} />
      {children}
    </div>
  );
}
