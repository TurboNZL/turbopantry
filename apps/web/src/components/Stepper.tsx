import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { formatQuantity, unitLabel } from '@turbopantry/shared';
import { cn } from '../lib/cn.ts';

/**
 * − 500 g + : the way every amount is changed. Each tap moves by the item's own step, and the number in the middle is a text field for the times
 * a number is quicker ("750"). The unit sits beside it; typing a number keeps the unit.
 */
export function Stepper({ value, step, unit, onChange, min = 0, max, className, label, compact }: { value: number; step: number; unit: string | null; onChange(v: number): void; min?: number; max?: number; className?: string; label: string; compact?: boolean }) {
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min, Math.round(v * 1000) / 1000));
  const [text, setText] = useState(formatQuantity(value) || '0');
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setText(formatQuantity(value) || '0'); }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const n = Number(text.replace(',', '.').trim());
    if (Number.isFinite(n) && text.trim() !== '') { if (clamp(n) !== value) onChange(clamp(n)); setText(formatQuantity(clamp(n)) || '0'); } else setText(formatQuantity(value) || '0');
  };
  const u = unitLabel(unit, value);
  const btn = compact ? 'h-8 w-8' : 'h-11 w-11';
  // the number and the unit have the same size whatever the unit is, and each sits in a column of its own width, so rows line up
  return (
    <div className={cn('inline-flex items-center', compact ? 'gap-0' : 'gap-0.5', className)} role="group" aria-label={label}>
      <button type="button" className={cn('btn btn-ghost flex shrink-0 items-center justify-center !p-0', btn)} aria-label={`Less ${label}`} onClick={() => onChange(clamp(value - step))} disabled={value <= min}><Minus size={compact ? 16 : 18} /></button>
      <span className="flex items-baseline justify-center gap-0.5">
        <input className={cn('rounded-md border border-transparent bg-transparent text-center text-sm font-semibold tabular-nums hover:border-line focus:border-accent focus:outline-none', compact ? 'w-10 py-0.5' : 'w-12 py-1')} inputMode="decimal" aria-label={`${label} amount`}
          value={text} onFocus={(e) => { setEditing(true); e.currentTarget.select(); }} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setEditing(false); setText(formatQuantity(value) || '0'); e.currentTarget.blur(); } }} />
        <span className={cn('truncate text-left text-xs text-muted', compact ? 'w-8' : 'w-10')} title={u ?? undefined}>{u}</span>
      </span>
      <button type="button" className={cn('btn btn-ghost flex shrink-0 items-center justify-center !p-0', btn)} aria-label={`More ${label}`} onClick={() => onChange(clamp(value + step))} disabled={max !== undefined && value >= max}><Plus size={compact ? 16 : 18} /></button>
    </div>
  );
}
