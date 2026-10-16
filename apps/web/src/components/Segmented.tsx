import { cn } from '../lib/cn.ts';

/** A switch with a few labelled choices side by side (easier to read at a glance than a dropdown). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange(v: T): void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-theme border border-line bg-raised p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
          className={cn('min-h-[2.5rem] rounded-theme px-2 text-sm font-medium transition-colors', o.value === value ? 'bg-accent text-accent-fg shadow-sm' : 'text-muted hover:text-fg')}>{o.label}</button>
      ))}
    </div>
  );
}
