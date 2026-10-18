import { useState } from 'react';
import { nativeNotify } from '../lib/native.ts';
import { useStore } from '../lib/store.ts';
import { cn } from '../lib/cn.ts';
import { Section } from './Section.tsx';

/** Settings > Server (Android app only): an opt-in switch for "someone else changed the shopping list" notifications. */
export function NotificationsCard() {
  const { settings, updateSettings } = useStore();
  const [, bump] = useState(0);
  if (!nativeNotify.supported()) return null;
  const on = settings.listNotifications;
  const allowed = nativeNotify.allowed();
  function toggle() {
    if (!on) { nativeNotify.request(); window.setTimeout(() => bump((n) => n + 1), 1500); }
    updateSettings({ listNotifications: !on });
  }
  return (
    <Section title="Notifications">
      <p className="text-sm text-muted">Get a notification when someone else adds to or takes things off the shopping list. It is off until you turn it on, and only on this phone. It arrives while the app is open in the background; a phone that has stopped the app completely hears nothing until you open it.</p>
      <button type="button" role="switch" aria-checked={on} onClick={toggle} className="flex min-h-[2.75rem] w-full items-center justify-between gap-3 rounded-theme border border-line bg-raised px-3 text-left">
        <span className="text-sm font-medium">Shopping list changes</span>
        <span className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-line')}><span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-[1.375rem]' : 'left-0.5')} /></span>
      </button>
      {on && !allowed && <p className="text-sm text-warn">Android has not allowed notifications for TurboPantry yet. Allow them in the prompt, or in Android Settings, Apps, TurboPantry, Notifications.</p>}
    </Section>
  );
}
