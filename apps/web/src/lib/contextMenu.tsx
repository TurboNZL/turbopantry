import { useEffect, useRef, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import { create } from 'zustand';

export interface MenuAction { label: string; icon?: ReactNode; danger?: boolean; run(): void }
interface MenuState { open: { x: number; y: number; title: string; actions: MenuAction[] } | null; show(x: number, y: number, title: string, actions: MenuAction[]): void; close(): void }
export const useMenu = create<MenuState>((set) => ({ open: null, show: (x, y, title, actions) => set({ open: { x, y, title, actions } }), close: () => set({ open: null }) }));

const HOLD_MS = 500, SLOP = 10;

/**
 * Right-click on a computer, press and hold on a phone: spread the result on an element and it opens the menu with the actions for it.
 * A press that moves (scrolling) or is lifted early is a normal tap and nothing else happens.
 */
export function useRowMenu(title: string, actions: () => MenuAction[]) {
  const show = useMenu((s) => s.show);
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => { window.clearTimeout(timer.current); start.current = null; };
  return {
    onContextMenu(e: React.MouseEvent) { e.preventDefault(); e.stopPropagation(); show(e.clientX, e.clientY, title, actions()); },
    onPointerDown(e: RPointerEvent) {
      if (e.pointerType === 'mouse') return; // the mouse has the right button
      fired.current = false; start.current = { x: e.clientX, y: e.clientY };
      const { clientX: x, clientY: y } = e;
      timer.current = window.setTimeout(() => { fired.current = true; navigator.vibrate?.(15); show(x, y, title, actions()); }, HOLD_MS);
    },
    onPointerMove(e: RPointerEvent) { if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > SLOP) cancel(); },
    onPointerUp: cancel, onPointerCancel: cancel, onPointerLeave: cancel,
    // the tap that ends a long press must not also activate the row
    onClickCapture(e: React.MouseEvent) { if (fired.current) { e.preventDefault(); e.stopPropagation(); fired.current = false; } },
    style: { WebkitTouchCallout: 'none', userSelect: 'none' } as React.CSSProperties,
  };
}

/** The one menu of the app (mounted once in the layout). Stays inside the screen; Escape, a tap outside or scrolling closes it. */
export function ContextMenuHost() {
  const { open, close } = useMenu();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: Event) => { if (!(e.target instanceof Node && ref.current?.contains(e.target))) close(); };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('pointerdown', off, true); window.addEventListener('scroll', close, true); window.addEventListener('keydown', key); window.addEventListener('resize', close);
    return () => { window.removeEventListener('pointerdown', off, true); window.removeEventListener('scroll', close, true); window.removeEventListener('keydown', key); window.removeEventListener('resize', close); };
  }, [open, close]);
  useEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(open.x, window.innerWidth - r.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(open.y, window.innerHeight - r.height - 8))}px`;
    el.querySelector<HTMLElement>('button')?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div ref={ref} role="menu" aria-label={open.title} className="bt-menu fixed z-[60] min-w-[12rem] max-w-[18rem] overflow-hidden py-1 shadow-xl" style={{ left: open.x, top: open.y }}>
      <div className="truncate px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted">{open.title}</div>
      {open.actions.map((a) => (
        <button key={a.label} role="menuitem" className={`flex min-h-[2.75rem] w-full items-center gap-3 px-4 text-left text-sm hover:bg-raised focus:bg-raised focus:outline-none ${a.danger ? 'text-bad' : ''}`} onClick={() => { close(); a.run(); }}>{a.icon}{a.label}</button>
      ))}
    </div>
  );
}
