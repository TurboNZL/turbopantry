import { Undo2 } from 'lucide-react';

export const UNDO_MS = 10_000;

/** "Undo" whose outline draws itself all the way round while there is time left; when the outline is complete the chance is gone and `onExpire` runs. */
export function UndoButton({ onUndo, onExpire, label = 'Undo', ms = UNDO_MS, compact }: { onUndo(): void; onExpire(): void; label?: string; ms?: number; compact?: boolean }) {
  return (
    <button type="button" className={compact ? 'relative flex h-8 min-w-[4.25rem] shrink-0 items-center justify-center gap-1 rounded-theme bg-raised px-2 text-xs font-semibold' : 'relative flex h-11 min-w-[7.5rem] items-center justify-center gap-2 rounded-theme bg-raised px-4 text-sm font-semibold'} onClick={onUndo} aria-label={`${label} (${Math.round(ms / 1000)} seconds)`}>
      <Undo2 size={compact ? 14 : 16} />{label}
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        <rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="8" ry="8" pathLength={1} fill="none" stroke="hsl(var(--accent))" strokeWidth="2" className="undo-outline" style={{ ['--undo-ms' as string]: `${ms}ms` }} onAnimationEnd={onExpire} />
      </svg>
    </button>
  );
}
