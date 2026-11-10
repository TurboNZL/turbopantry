import { Section } from './Section.tsx';
import { useStore } from '../lib/store.ts';
import { cn } from '../lib/cn.ts';

/** Settings > Appearance: easy mode, the simplest version of every screen. */
export function EasyCard() {
  const { settings, updateSettings } = useStore();
  return (
    <Section title="Easy mode">
      <button type="button" role="switch" aria-checked={settings.easyMode} onClick={() => updateSettings({ easyMode: !settings.easyMode })} className="flex min-h-[3.5rem] w-full items-center justify-between gap-3 rounded-theme border border-line bg-raised px-4 py-2 text-left">
        <span><span className="block text-base font-semibold">Use easy mode</span><span className="block text-sm text-muted">The simplest way to use TurboPantry. Saved on this device only.</span></span>
        <span className={cn('relative h-8 w-14 shrink-0 rounded-full transition-colors', settings.easyMode ? 'bg-accent' : 'bg-line')}><span className={cn('absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all', settings.easyMode ? 'left-[1.9rem]' : 'left-1')} /></span>
      </button>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
        <li>Bigger text and buttons, with room around each one.</li>
        <li>One row per item: tap it, then pick from a few big buttons, instead of rows of tiny icons.</li>
        <li>The bottom bar is always used, so the pages are always in the same place under your thumb.</li>
        <li>Advanced things (3D views, item editing, duplicates, shop layouts) are tucked away.</li>
        <li>Recipes show “Cook it” first; the less common actions are under “More”.</li>
      </ul>
    </Section>
  );
}
