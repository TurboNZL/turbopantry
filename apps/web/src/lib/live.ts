import { useEffect } from 'react';
import { HeaderEventSource } from './sse.ts';
import { useApi } from './useApi.ts';

export type Topic = 'items' | 'list' | 'recipes' | 'stores' | 'layouts';

/**
 * One live stream per device (Server-Sent Events, read with fetch so the token and any Cloudflare Access headers can be sent). The server only says
 * "this topic changed"; screens reload that topic. When the stream drops (a tunnel hiccup, the phone sleeping) it reconnects, and every screen
 * reloads once, so nothing missed is lost.
 */
const subs = new Map<Topic, Set<() => void>>();
const notify = (t: Topic) => subs.get(t)?.forEach((fn) => fn());
const notifyAll = () => (['items', 'list', 'recipes', 'stores', 'layouts'] as Topic[]).forEach(notify);

export function subscribe(topic: Topic, fn: () => void): () => void {
  let set = subs.get(topic);
  if (!set) subs.set(topic, (set = new Set()));
  set.add(fn);
  return () => { set!.delete(fn); };
}

/** Keeps the stream open while this component is mounted and a token is set. Put it once near the top of the app. */
export function useLiveConnection() {
  const api = useApi();
  const { url, headers } = api.eventsRequest();
  const authed = !!headers.authorization;
  useEffect(() => {
    if (!authed) return;
    let es: HeaderEventSource | null = null, timer: number | undefined, stopped = false, tries = 0, wasUp = false;
    const open = () => {
      es = new HeaderEventSource(url, headers);
      es.onopen = () => { tries = 0; if (wasUp) notifyAll(); wasUp = true; };
      for (const t of ['items', 'list', 'recipes', 'stores', 'layouts'] as Topic[]) es.addEventListener(t, () => notify(t));
      es.onerror = () => { if (stopped) return; timer = window.setTimeout(open, Math.min(30_000, 1000 * 2 ** Math.min(tries++, 5))); };
    };
    open();
    const wake = () => { if (document.visibilityState === 'visible') notifyAll(); }; // coming back to the app: catch up
    document.addEventListener('visibilitychange', wake);
    return () => { stopped = true; window.clearTimeout(timer); es?.close(); document.removeEventListener('visibilitychange', wake); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, authed, JSON.stringify(headers)]);
}
