import { useSearchParams } from 'react-router-dom';
import { AppearanceLayout, WallpaperCard } from '../components/AppearanceCard.tsx';
import { GuidesTab } from '../components/GuidesTab.tsx';
import { Section } from '../components/Section.tsx';
import { ItemsTab } from '../components/ItemsTab.tsx';
import { StoresTab } from '../components/StoresTab.tsx';
import { PairCard, ServerCard } from '../components/ServerCard.tsx';
import { InstagramCard } from '../components/InstagramCard.tsx';
import { ServerUpdateCard } from '../components/ServerUpdate.tsx';
import { View3dCard } from '../components/View3dCard.tsx';
import { ThemeUpdates } from '../components/ThemeUpdates.tsx';
import { ErrorBoundary } from '../components/ErrorBoundary.tsx';
import { cn } from '../lib/cn.ts';

const TABS = [{ id: 'look', label: 'Appearance' }, { id: 'items', label: 'Items' }, { id: 'stores', label: 'Stores' }, { id: 'server', label: 'Server' }, { id: 'guides', label: 'Guides' }];

/** Settings: a tab strip that wraps instead of scrolling sideways (settings-shell convention), one titled panel per topic. */
export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab')! : 'look';
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div role="tablist" aria-label="Settings sections" className="flex flex-wrap gap-x-1 border-b border-line pb-px">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} data-selected={tab === t.id || undefined} onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={cn('-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors', tab === t.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}>{t.label}</button>
        ))}
      </div>
      {tab === 'look' && <>
        <AppearanceLayout />
        <Section title="Wallpaper"><WallpaperCard /></Section>
        <View3dCard />
        <ThemeUpdates />
      </>}
      <ErrorBoundary key={tab} label={`The ${tab} tab`}>
      {tab === 'items' && <ItemsTab />}
      {tab === 'stores' && <StoresTab />}
      {tab === 'server' && <><ServerUpdateCard /><ServerCard /><PairCard /><InstagramCard /></>}
      {tab === 'guides' && <GuidesTab />}
      </ErrorBoundary>
    </div>
  );
}
