import { useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Hand, ListTree, Maximize2, Orbit, X } from 'lucide-react';
import { cn } from '../../lib/cn.ts';
import type { CameraApi } from './camera.ts';

/** The room the page leaves for the 3D view: everything between the top bar and the page dock, beside the side bar. Re-measured when the window changes. */
function useFreeRect(): CSSProperties {
  const [r, setR] = useState<CSSProperties>({ left: 0, right: 0, top: 56, bottom: 56 });
  useLayoutEffect(() => {
    const measure = () => {
      const main = document.querySelector('main'), top = document.querySelector('.bt-top'), tab = document.querySelector<HTMLElement>('.bt-tabbar');
      const m = main?.getBoundingClientRect(), t = top?.getBoundingClientRect();
      const tabShown = tab && tab.offsetParent !== null ? tab.getBoundingClientRect() : null;
      setR({ left: m?.left ?? 0, right: window.innerWidth - (m?.right ?? window.innerWidth), top: t ? t.bottom : (m?.top ?? 0), bottom: tabShown ? window.innerHeight - tabShown.top : 0 });
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(measure); document.querySelectorAll('main, .bt-top, .bt-tabbar').forEach((n) => ro.observe(n));
    return () => { window.removeEventListener('resize', measure); ro.disconnect(); };
  }, []);
  return r;
}

/**
 * The 3D view as a temporary full-screen stage: it takes all the room between the top bar and the dock, leaves the controls to the mouse (drag, wheel)
 * and to two fingers (pinch zooms, twist turns), and puts a panel for the places in the free space beside it (a drawer on a phone).
 * Only what a mouse cannot do is a button: close, a drag-moves/drag-turns switch (computers only), reset, and the drawer.
 */
export function Stage3D({ title, cam, onClose, panel, panelTitle = 'Places', drawer, onDrawer, children }: { title: string; cam: CameraApi; onClose(): void; panel: ReactNode; panelTitle?: string; /** the panel as a drawer on a phone */ drawer: boolean; onDrawer(open: boolean): void; children: ReactNode }) {
  const rect = useFreeRect();
  const setDrawer = (f: (d: boolean) => boolean) => onDrawer(f(drawer));
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="fixed z-20 flex flex-col bg-bg" style={rect} role="region" aria-label={title}>
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line px-2">
        <button className="btn flex h-10 items-center gap-1.5 px-3" onClick={onClose} aria-label="Close the 3D view"><X size={18} /><span className="hidden sm:inline">Close</span></button>
        <h2 className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">{title}</h2>
        <div className="hidden items-center gap-0.5 rounded-theme border border-line bg-raised p-0.5 [@media(pointer:fine)]:flex" role="radiogroup" aria-label="What dragging does">
          <button role="radio" aria-checked={cam.drag === 'pan'} className={cn('flex h-9 w-9 items-center justify-center rounded-theme', cam.drag === 'pan' ? 'bg-accent text-accent-fg' : 'text-muted')} title="Dragging moves the view" aria-label="Dragging moves the view" onClick={() => cam.setDrag('pan')}><Hand size={17} /></button>
          <button role="radio" aria-checked={cam.drag === 'orbit'} className={cn('flex h-9 w-9 items-center justify-center rounded-theme', cam.drag === 'orbit' ? 'bg-accent text-accent-fg' : 'text-muted')} title="Dragging turns the view" aria-label="Dragging turns the view" onClick={() => cam.setDrag('orbit')}><Orbit size={17} /></button>
        </div>
        <button className="btn btn-ghost flex h-10 w-10 items-center justify-center !p-0" onClick={() => cam.reset()} aria-label="Reset the view" title="Reset the view"><Maximize2 size={18} /></button>
        <button className={cn('btn flex h-10 items-center gap-1.5 px-3 md:hidden', drawer && 'btn-accent')} aria-pressed={drawer} onClick={() => setDrawer((d) => !d)}><ListTree size={17} />{panelTitle}</button>
      </div>
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">{children}
          <p className="pointer-events-none absolute bottom-2 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-full bg-bg/80 px-3 py-1 text-xs text-muted [@media(pointer:fine)]:block">Drag to look around · scroll to zoom · shift-drag or right-drag turns</p>
          <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-bg/80 px-3 py-1 text-xs text-muted [@media(pointer:fine)]:hidden">Drag · pinch to zoom · twist to turn</p>
        </div>
        <aside className={cn('min-h-0 overflow-y-auto border-line bg-bg', 'md:static md:block md:w-80 md:shrink-0 md:border-l', drawer ? 'absolute inset-x-0 bottom-0 z-10 max-h-[45%] border-t shadow-2xl' : 'hidden')} aria-label={panelTitle}>{panel}</aside>
      </div>
    </div>
  );
}
