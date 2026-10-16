import { useState, type ReactNode } from 'react';
import { PackageMinus, PackagePlus, Equal } from 'lucide-react';
import { formatStock, plentyInStock, titleCase, type Item } from '@turbopantry/shared';
import { Sheet } from './Sheet.tsx';
import { toast } from '../lib/toast.ts';
import { useApi } from '../lib/useApi.ts';

interface Ask { item: Item; qty?: number | null; unit?: string | null }

/**
 * Adding to the list from anywhere. When the pantry already holds plenty of the item (more than two steps of it) there is a question first:
 * are you getting more, are you out of it (the count goes to zero now), or should buying it leave the count alone? Otherwise it is one tap.
 * Render `node` once in the page.
 */
export function useAddToList(after?: () => void): { add(item: Item, qty?: number | null, unit?: string | null): Promise<void>; node: ReactNode } {
  const api = useApi();
  const [ask, setAsk] = useState<Ask | null>(null);
  async function go(item: Item, qty: number | null | undefined, unit: string | null | undefined, stock?: 'more' | 'out' | 'keep') {
    try {
      await api.addToList({ itemId: item.id, ...(qty !== undefined ? { qty } : {}), ...(unit !== undefined ? { unit } : {}), ...(stock ? { stock } : {}) });
      toast(`${titleCase(item.name)} is on the list${stock === 'out' ? ' · pantry set to none' : stock === 'keep' ? ' · pantry count stays' : ''}`);
      after?.();
    } catch (e) { toast((e as Error).message); }
  }
  const add = async (item: Item, qty?: number | null, unit?: string | null) => { if (plentyInStock(item)) setAsk({ item, qty, unit }); else await go(item, qty, unit); };
  const choose = (stock: 'more' | 'out' | 'keep') => { const a = ask!; setAsk(null); void go(a.item, a.qty, a.unit, stock); };
  const big = 'flex min-h-[4rem] w-full items-center gap-3 rounded-theme border border-line bg-raised px-4 text-left hover:border-accent';
  const node = ask && (
    <Sheet title={`Add ${titleCase(ask.item.name)}?`} onClose={() => setAsk(null)}>
      <p className="text-sm">You have <strong>{formatStock(ask.item.qty, ask.item.unit)}</strong> in the pantry. Is this because…</p>
      <button className={big} onClick={() => choose('more')}><PackagePlus size={22} className="shrink-0 text-accent" /><span><span className="block font-medium">I'm getting more</span><span className="block text-sm text-muted">What you buy is added to the {formatStock(ask.item.qty, ask.item.unit)}.</span></span></button>
      <button className={big} onClick={() => choose('out')}><PackageMinus size={22} className="shrink-0 text-warn" /><span><span className="block font-medium">I'm out of it</span><span className="block text-sm text-muted">The pantry goes to none now, then what you buy is added.</span></span></button>
      <button className={big} onClick={() => choose('keep')}><Equal size={22} className="shrink-0 text-muted" /><span><span className="block font-medium">Don't change the count</span><span className="block text-sm text-muted">Buying it leaves the pantry as it is.</span></span></button>
    </Sheet>
  );
  return { add, node };
}
