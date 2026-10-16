import { useEffect, useState } from 'react';
import { useToasts } from '../lib/toast.ts';

/** How far from the bottom of the screen the notifications start: just above the page bar (bottom bar or dock) wherever the layout puts it. */
function useClearance(active: boolean): number {
  const [px, setPx] = useState(88);
  useEffect(() => {
    if (!active) return;
    const measure = () => {
      const bar = [...document.querySelectorAll<HTMLElement>('.bt-tabbar')].find((b) => b.getClientRects().length > 0);
      setPx(bar ? Math.max(0, window.innerHeight - bar.getBoundingClientRect().top) + 8 : 24);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active]);
  return px;
}

/** Small confirmations above the page bar, with an Undo where the change can be taken back. */
export function Toasts() {
  const { toasts, dismiss } = useToasts();
  const bottom = useClearance(toasts.length > 0);
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-3" style={{ bottom }} aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="bt-menu pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-3 text-sm shadow-lg">
          <span>{t.text}</span>
          {t.undo && <button className="btn btn-accent !py-1.5" onClick={() => { void t.undo!(); dismiss(t.id); }}>Undo</button>}
        </div>
      ))}
    </div>
  );
}
