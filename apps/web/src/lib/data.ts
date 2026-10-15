import { useMemo } from 'react';
import type { Item, ListEntry } from '@turbopantry/shared';
import { useApi } from './useApi.ts';
import { useSynced } from './synced.ts';

/** Every pantry item (also those only made by linking a recipe), live. */
export function useItems() {
  const api = useApi();
  const s = useSynced<Item[]>('items', 'items', () => api.listItems(), [api]);
  const byId = useMemo(() => new Map((s.data ?? []).map((i) => [i.id, i])), [s.data]);
  return { ...s, items: s.data ?? [], byId };
}

export function useListEntries() {
  const api = useApi();
  const s = useSynced<ListEntry[]>('list', 'list', () => api.listEntries(), [api]);
  return { ...s, entries: s.data ?? [] };
}
