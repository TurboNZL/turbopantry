import { Section } from './Section.tsx';
import { useStore } from '../lib/store.ts';
import { cn } from '../lib/cn.ts';

function Switch({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange(v: boolean): void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-[2.75rem] w-full items-center justify-between gap-3 rounded-theme border border-line bg-raised px-3 py-2 text-left">
      <span><span className="block text-sm font-medium">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
      <span className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-line')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-[1.375rem]' : 'left-0.5')} />
      </span>
    </button>
  );
}

/** Settings > Appearance: what the pantry rows show. (The 3D views are not a setting: they are opened from the Pantry and Shopping pages.) */
export function View3dCard() {
  const { settings, updateSettings } = useStore();
  return (
    <Section title="Pantry rows">
      <Switch label="Show where things are kept" hint="Adds the place (Fridge, Cupboard…) after each item's name in the pantry list. Off by default; the 3D kitchen uses places either way." on={settings.showPlaces} onChange={(v) => updateSettings({ showPlaces: v })} />
    </Section>
  );
}
