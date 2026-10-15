import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** A panel that slides up from the bottom on a phone (reachable with a thumb) and is a centred dialog on a wide screen. */
export function Sheet({ title, onClose, children, footer }: { title: string; onClose(): void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={onClose} />
      <div className="bt-window relative flex max-h-[88vh] w-full flex-col md:max-w-lg">
        <div className="bt-titlebar flex items-center justify-between px-4 py-3"><h2 className="font-semibold">{title}</h2>
          <button type="button" className="btn btn-ghost flex h-10 w-10 items-center justify-center !p-0" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
        <div className="bt-body min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
        {footer && <div className="border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}
