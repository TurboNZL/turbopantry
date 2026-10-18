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

/** Settings > Appearance: the optional faux-3D kitchen and shop maps. Off, nothing 3D is loaded at all. */
export function View3dCard() {
  const { settings, updateSettings } = useStore();
  return (
    <Section title="3D views">
      <p className="text-sm text-muted">Draw your kitchen and the shops you use as a little 3D floor plan you can turn, tilt and zoom with big buttons. Tap a cupboard to see what is in it; tap an aisle to see what to grab there. You build the plan yourself. The switches are saved on this device; the plans are shared with the household.</p>
      <Switch label="Kitchen view on the Pantry page" on={settings.view3d} onChange={(v) => updateSettings({ view3d: v })} />
      <Switch label="Shop map on the Shopping page" hint="Opens from straight above: tap where you are in the shop to look around from there." on={settings.listMap3d} onChange={(v) => updateSettings({ listMap3d: v })} />
    </Section>
  );
}
