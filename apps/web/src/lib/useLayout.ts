import { useCallback } from 'react';
import type { Layout, LayoutKind } from '@turbopantry/shared';
import { toast } from './toast.ts';
import { useApi } from './useApi.ts';
import { useSynced } from './synced.ts';

const EMPTY: Layout = { blocks: [] };

/**
 * The floor plan of the kitchen or of one shop, live (a change on another device arrives by itself). `save` shows the change at once and sends it;
 * the reload that follows puts the server's copy back. Give the component using it a `key` that includes the store, so a switch starts clean.
 */
export function useLayout(kind: LayoutKind, storeId?: number | null) {
  const api = useApi();
  const s = useSynced<Layout>(`layout.${kind}.${storeId ?? 0}`, 'layouts', () => api.getLayout(kind, storeId), [api, kind, storeId]);
  const { set, reload } = s;
  const save = useCallback(async (next: Layout) => {
    set(next);
    try { await api.putLayout(kind, storeId, next); } catch (e) { toast((e as Error).message); reload(); }
  }, [api, kind, storeId, set, reload]);
  return { layout: s.data ?? EMPTY, loaded: s.data !== null, loading: s.loading, error: s.error, save };
}
