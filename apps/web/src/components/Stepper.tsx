import { Minus, Plus } from 'lucide-react';
import { prettyStock } from '@turbopantry/shared';
import { cn } from '../lib/cn.ts';

/** − 500 g + : the way every amount is changed (a thumb, not a keyboard). Each tap moves by the item's own step. */
export function Stepper({ value, step, unit, onChange, min = 0, max, className, label }: { value: number; step: number; unit: string | null; onChange(v: number): void; min?: number; max?: number; className?: string; label: string }) {
  const set = (v: number) => onChange(Math.min(max ?? Infinity, Math.max(min, Math.round(v * 1000) / 1000)));
  return (
    <div className={cn('inline-flex items-center gap-1', className)} role="group" aria-label={label}>
      <button type="button" className="btn btn-ghost flex h-11 w-11 items-center justify-center !p-0" aria-label={`Less ${label}`} onClick={() => set(value - step)} disabled={value <= min}><Minus size={18} /></button>
      <span className="min-w-[4.5rem] text-center text-base font-semibold tabular-nums" aria-live="polite">{prettyStock(value, unit) || '0'}</span>
      <button type="button" className="btn btn-ghost flex h-11 w-11 items-center justify-center !p-0" aria-label={`More ${label}`} onClick={() => set(value + step)} disabled={max !== undefined && value >= max}><Plus size={18} /></button>
    </div>
  );
}
