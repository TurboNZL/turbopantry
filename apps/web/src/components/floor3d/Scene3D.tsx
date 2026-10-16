import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { canPlace, footprint, holdsThings, snap, titleCase, type Block } from '@turbopantry/shared';
import { CELL, STEP_H, screenToFloor, type CameraApi } from './camera.ts';
import './floor3d.css';

export interface BlockInfo { badge?: string | number; tone?: 'warn' | 'ok' | 'walk'; hot?: boolean }

const FRONT: Record<number, string> = { 0: 's', 90: 'w', 180: 'n', 270: 'e' };

const Block3D = memo(function Block3D({ b, selected, editable, badge, tone, hot }: { b: Block; selected: boolean; editable: boolean; badge?: string | number; tone?: BlockInfo['tone']; hot?: boolean }) {
  const f = footprint(b), wall = !holdsThings(b.kind);
  const style = { left: b.x * CELL, top: b.y * CELL, width: f.w * CELL, height: f.d * CELL, '--h': `${b.h * STEP_H}px`, '--c': b.color } as CSSProperties;
  const showTag = (!wall || selected || editable) && (b.label || badge !== undefined);
  return (
    <div className="f3-block" data-bid={b.id} data-kind={b.kind} data-front={FRONT[b.rot]} data-sel={selected || undefined} data-hot={hot || undefined} data-edit={editable || undefined} data-wall={(wall && !editable) || undefined} style={style}>
      <i className="f3-top" /><i className="f3-s" /><i className="f3-n" /><i className="f3-e" /><i className="f3-w" />
      {showTag && <div className="f3-tag"><span>{badge !== undefined && tone === 'walk' && <b className="walk">{badge}</b>}<span className="t">{titleCase(b.label)}</span>{badge !== undefined && tone !== 'walk' && <b className={tone === 'warn' ? '' : 'ok'}>{badge}</b>}</span></div>}
    </div>
  );
});

type Gesture =
  | { mode: 'pinch'; dist: number; zoom: number }
  | { mode: 'block'; id: string; sx: number; sy: number; bx: number; by: number; moved: boolean; editable: boolean }
  | { mode: 'pan' | 'orbit'; lx: number; ly: number; moved: boolean };

/**
 * The 3D floor: boxes on a grid, seen from a camera you turn, tilt, zoom and pan. One finger on a block selects it (and, in the editor, drags it
 * with snapping and no overlaps); one finger on the empty floor pans or turns the view (the Move/Turn switch); two fingers pinch to zoom.
 * The mouse wheel zooms, shift or right-drag turns. Arrow keys pan the view (the editor claims them for the selected block through `onKey`).
 */
export function Scene3D({ cam, size, blocks, selectedId, editable = false, info, onTap, onDragStart, onMove, onDragEnd, onKey, label = 'Floor plan', height, children }: {
  cam: CameraApi; size: number; blocks: Block[]; selectedId?: string | null; editable?: boolean; info?: Map<string, BlockInfo>;
  onTap?(id: string | null): void; onDragStart?(id: string): void; onMove?(id: string, x: number, y: number): void; onDragEnd?(): void;
  /** Return true when the key was used. */
  onKey?(e: React.KeyboardEvent): boolean; label?: string; height?: string; children?: ReactNode;
}) {
  const vp = useRef<HTMLDivElement>(null);
  const blocksRef = useRef(blocks); blocksRef.current = blocks;
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<Gesture | null>(null);
  const [gesturing, setGesturing] = useState(false);
  const { cam: c, setFit } = cam;

  // fit the whole floor to the width of the scene
  useEffect(() => {
    const el = vp.current; if (!el) return;
    const fit = () => setFit(Math.min(1.4, (el.clientWidth * 0.94) / (size * CELL * 1.38)));
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [size, setFit]);

  // the wheel zooms (a listener of our own: React's is passive and could not stop the page from scrolling)
  useEffect(() => {
    const el = vp.current; if (!el) return;
    const h = (e: WheelEvent) => { e.preventDefault(); cam.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12); };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, [cam]);

  const down = (e: React.PointerEvent) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    vp.current?.setPointerCapture(e.pointerId);
    setGesturing(true);
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      g.current = { mode: 'pinch', dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1, zoom: cam.ref.current.zoom };
      return;
    }
    const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-bid]');
    const id = hit?.dataset.bid;
    const blk = id ? blocksRef.current.find((b) => b.id === id) : undefined;
    if (blk) {
      g.current = { mode: 'block', id: blk.id, sx: e.clientX, sy: e.clientY, bx: blk.x, by: blk.y, moved: false, editable };
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
    if (s.mode === 'block') { if (s.moved && s.editable) onDragEnd?.(); else if (!s.moved && !editable) onTap?.(s.id); }
    else if (!s.moved) onTap?.(null);
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

  const vars = { ...(height ? { height } : {}), '--f3-yaw': `${c.yaw}deg`, '--f3-pitch': `${c.pitch}deg`, '--f3-z': c.zoom, '--f3-px': `${c.px}px`, '--f3-py': `${c.py}px` } as CSSProperties;
  const S = size * CELL;
  return (
    <div ref={vp} className="f3-viewport" style={vars} data-gesture={gesturing || undefined} role="application" tabIndex={0} aria-label={`${label}. Arrow keys move the view, plus and minus zoom, shift with arrows turns and tilts.`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onContextMenu={(e) => e.preventDefault()} onKeyDown={keys}>
      <div className="f3-world">
        <div className="f3-floor" style={{ left: -S / 2, top: -S / 2, width: S, height: S }}>
          {blocks.map((b) => { const i = info?.get(b.id); return <Block3D key={b.id} b={b} selected={b.id === selectedId} editable={editable} badge={i?.badge} tone={i?.tone} hot={i?.hot} />; })}
        </div>
      </div>
      {children}
    </div>
  );
}
