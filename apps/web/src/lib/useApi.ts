import { useCallback, useEffect, useMemo, useState } from 'react';
import { Api } from './api.ts';
import { useStore } from './store.ts';

/** The API client for this device's server settings. */
export function useApi(): Api {
  const serverUrl = useStore((s) => s.settings.serverUrl);
  const token = useStore((s) => s.settings.token);
  const cfAccessId = useStore((s) => s.settings.cfAccessId);
  const cfAccessSecret = useStore((s) => s.settings.cfAccessSecret);
  return useMemo(() => new Api({ serverUrl, token, cfAccessId, cfAccessSecret }), [serverUrl, token, cfAccessId, cfAccessSecret]);
}

export interface Loaded<T> { data: T | null; error: Error | null; loading: boolean; reload(): void }

/** Runs `load` when `deps` change; shows the latest result only (an older, slower answer never overwrites a newer one). */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: Error | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    run().then((data) => alive && setState({ data, error: null, loading: false }), (error: Error) => alive && setState({ data: null, error, loading: false }));
    return () => { alive = false; };
  }, [run, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
