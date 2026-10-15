import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribe, type Topic } from './live.ts';

const CACHE = 'turbopantry.cache.';
const readCache = <T,>(key: string): T | null => { try { const v = localStorage.getItem(CACHE + key); return v ? (JSON.parse(v) as T) : null; } catch { return null; } };
const writeCache = (key: string, v: unknown) => { try { localStorage.setItem(CACHE + key, JSON.stringify(v)); } catch { /* full or private mode: just no cache */ } };

export interface Synced<T> { data: T | null; error: Error | null; loading: boolean; reload(): void; set(next: T | ((cur: T | null) => T | null)): void }

/**
 * Data that is shown at once from the last copy on this device (so a screen is never blank on a bad connection), refreshed from the server, and
 * reloaded whenever the live stream says its topic changed. `set` is for optimistic edits: change the screen now, and the reload that follows
 * (or the error path) puts the truth back.
 */
export function useSynced<T>(key: string, topic: Topic, fetcher: () => Promise<T>, deps: unknown[]): Synced<T> {
  const [data, setData] = useState<T | null>(() => readCache<T>(key));
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fetcher, deps);

  const reload = useCallback(() => {
    const mine = ++seq.current;
    run().then((v) => { if (mine !== seq.current) return; setData(v); setError(null); setLoading(false); writeCache(key, v); },
      (e: Error) => { if (mine !== seq.current) return; setError(e); setLoading(false); });
  }, [run, key]);

  useEffect(() => { reload(); return subscribe(topic, reload); }, [reload, topic]);
  const set = useCallback((next: T | ((cur: T | null) => T | null)) => { seq.current++; setData((cur) => { const v = typeof next === 'function' ? (next as (c: T | null) => T | null)(cur) : next; if (v !== null) writeCache(key, v); return v; }); }, [key]);
  return { data, error, loading, reload, set };
}
