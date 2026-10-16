import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronsDown, ChevronsUp, Hand, Maximize2, Orbit, RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '../../lib/cn.ts';
import type { CameraApi } from './camera.ts';

/** A 44 px button that acts at once and keeps acting while it is held (so a long press turns the view smoothly). */
export function HoldButton({ label, onAct, children, className, disabled, repeat = true }: { label: string; onAct(): void; children: ReactNode; className?: string; disabled?: boolean; repeat?: boolean }) {
  const timer = useRef<number | undefined>(undefined);
  const act = useRef(onAct); act.current = onAct;
  const stop = () => { window.clearTimeout(timer.current); window.clearInterval(timer.current); };
  useEffect(() => stop, []);
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} style={{ touchAction: 'none' }}
      className={cn('btn btn-ghost flex h-11 w-11 shrink-0 items-center justify-center !p-0 select-none', className)}
      onPointerDown={(e) => { if (e.button > 0) return; e.preventDefault(); act.current(); if (repeat) { stop(); timer.current = window.setTimeout(() => { timer.current = window.setInterval(() => act.current(), 70); }, 350); } }}
      onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act.current(); } }}>{children}</button>
  );
}

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex flex-col items-center gap-0.5" role="group" aria-label={title}>
    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{title}</span>
    <div className="flex rounded-theme border border-line bg-raised">{children}</div>
  </div>
);

/** The buttons that move the camera: turn, tilt, zoom, move, reset, and what a drag on the floor does. Big on purpose: phones are the main screen. */
export function CameraPad({ cam, className }: { cam: CameraApi; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-center gap-x-3 gap-y-1.5', className)} aria-label="Camera controls">
      <Group title="Turn">
        <HoldButton label="Turn left" onAct={() => cam.turn(-12)}><RotateCcw size={20} /></HoldButton>
        <HoldButton label="Turn right" onAct={() => cam.turn(12)}><RotateCw size={20} /></HoldButton>
      </Group>
      <Group title="Tilt">
        <HoldButton label="Tilt up (look from higher)" onAct={() => cam.tilt(-6)}><ChevronsUp size={20} /></HoldButton>
        <HoldButton label="Tilt down (look from lower)" onAct={() => cam.tilt(6)}><ChevronsDown size={20} /></HoldButton>
      </Group>
      <Group title="Zoom">
        <HoldButton label="Zoom out" onAct={() => cam.zoomBy(1 / 1.12)}><ZoomOut size={20} /></HoldButton>
        <HoldButton label="Zoom in" onAct={() => cam.zoomBy(1.12)}><ZoomIn size={20} /></HoldButton>
      </Group>
      <Group title="Move view">
        <HoldButton label="Move view left" onAct={() => cam.panBy(36, 0)}><ArrowLeft size={20} /></HoldButton>
        <HoldButton label="Move view up" onAct={() => cam.panBy(0, 36)}><ArrowUp size={20} /></HoldButton>
        <HoldButton label="Move view down" onAct={() => cam.panBy(0, -36)}><ArrowDown size={20} /></HoldButton>
        <HoldButton label="Move view right" onAct={() => cam.panBy(-36, 0)}><ArrowRight size={20} /></HoldButton>
      </Group>
      <Group title="Drag">
        <button type="button" className={cn('btn flex h-11 w-11 items-center justify-center !p-0', cam.drag === 'pan' ? 'btn-accent' : 'btn-ghost')} aria-label="Dragging the floor moves the view" aria-pressed={cam.drag === 'pan'} title="Dragging moves the view" onClick={() => cam.setDrag('pan')}><Hand size={20} /></button>
        <button type="button" className={cn('btn flex h-11 w-11 items-center justify-center !p-0', cam.drag === 'orbit' ? 'btn-accent' : 'btn-ghost')} aria-label="Dragging the floor turns the view" aria-pressed={cam.drag === 'orbit'} title="Dragging turns the view" onClick={() => cam.setDrag('orbit')}><Orbit size={20} /></button>
      </Group>
      <Group title="View">
        <HoldButton label="Reset view" repeat={false} onAct={() => cam.reset()}><Maximize2 size={20} /></HoldButton>
      </Group>
    </div>
  );
}
