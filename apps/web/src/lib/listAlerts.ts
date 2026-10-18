import { useEffect } from 'react';
import { titleCase, type ListEntry } from '@turbopantry/shared';
import { lastChange, subscribe } from './live.ts';
import { nativeNotify } from './native.ts';
import { useStore } from './store.ts';
import { useApi } from './useApi.ts';

const sentence = (verb: string, names: string[]) => `${verb} ${names.slice(0, 2).map(titleCase).join(' and ')}${names.length > 2 ? ` and ${names.length - 2} more` : ''}`;

/**
 * Opt-in (Settings > Server > Notifications, Android app only): when someone ELSE changes the shopping list while this app is in the background, a
 * notification says what changed ("Sam added Milk and Eggs"). It works over the live stream the app already holds, so it needs no extra service
 * or account; if Android has stopped the app entirely there is nothing to hear it, and the list is simply current when the app opens.
 */
export function useListAlerts() {
  const api = useApi();
  const on = useStore((s) => s.settings.listNotifications);
  useEffect(() => {
    if (!on || !nativeNotify.supported()) return;
    let me: string | null = null, before = new Map<number, ListEntry>(), live = true;
    void api.status().then((s) => { me = s.user; }).catch(() => undefined);
    void api.listEntries().then((l) => { before = new Map(l.map((e) => [e.id, e])); }).catch(() => undefined);
    const off = subscribe('list', () => {
      const by = lastChange.by;
      void api.listEntries().then((l) => {
        if (!live) return;
        const now = new Map(l.map((e) => [e.id, e]));
        const added = l.filter((e) => !before.has(e.id)).map((e) => e.name), gone = [...before.values()].filter((e) => !now.has(e.id)).map((e) => e.name);
        before = now;
        if (!by || by === me || document.visibilityState === 'visible' || (!added.length && !gone.length) || !nativeNotify.allowed()) return;
        const parts = [added.length ? sentence('added', added) : '', gone.length ? sentence('took off', gone) : ''].filter(Boolean);
        nativeNotify.show('Shopping list', `${by} ${parts.join(', ')}`);
      }).catch(() => undefined);
    });
    return () => { live = false; off(); };
  }, [on, api]);
}
