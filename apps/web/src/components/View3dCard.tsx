import { Section } from './Section.tsx';
import { useStore } from '../lib/store.ts';
import { cn } from '../lib/cn.ts';

/** Settings > Appearance: the optional faux-3D kitchen and shop maps. Off, nothing 3D is loaded at all. */
export function View3dCard() {
  const { settings, updateSettings } = useStore();
  const on = settings.view3d;
  return (
    <Section title="3D views">
      <p className="text-sm text-muted">Draw your kitchen and the shops you use as a little 3D floor plan you can turn, tilt and zoom with big buttons. Tap a cupboard to see what is in it; tap an aisle to see what to grab there. You build the plan yourself, block by block. Saved on this device only; the plans themselves are shared with the household.</p>
      <button type="button" role="switch" aria-checked={on} onClick={() => updateSettings({ view3d: !on })} className="flex min-h-[2.75rem] w-full items-center justify-between gap-3 rounded-theme border border-line bg-raised px-3 text-left">
        <span className="text-sm font-medium">Show 3D views</span>
        <span className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-line')}>
          <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-[1.375rem]' : 'left-0.5')} />
        </span>
      </button>
    </Section>
  );
}
