import { useToasts } from '../lib/toast.ts';

/** Small confirmations above the bottom bar, with an Undo where the change can be taken back. */
export function Toasts() {
  const { toasts, dismiss } = useToasts();
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[5rem] z-50 flex flex-col items-center gap-2 px-3 md:bottom-6" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="bt-menu pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-3 text-sm shadow-lg">
          <span>{t.text}</span>
          {t.undo && <button className="btn btn-accent !py-1.5" onClick={() => { void t.undo!(); dismiss(t.id); }}>Undo</button>}
        </div>
      ))}
    </div>
  );
}
