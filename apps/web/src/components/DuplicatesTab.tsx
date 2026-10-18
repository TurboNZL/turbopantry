import { useCallback, useEffect, useState } from 'react';
import { Check, GitMerge } from 'lucide-react';
import { formatStock, titleCase, type DuplicateReason, type Item } from '@turbopantry/shared';
import { subscribe } from '../lib/live.ts';
import { toast } from '../lib/toast.ts';
import { useApi } from '../lib/useApi.ts';

type Pair = { a: Item; b: Item; reason: DuplicateReason };
const WHY: Record<DuplicateReason, string> = { 'less-specific': 'One name is inside the other', spelling: 'Spelled almost the same' };

function Side({ it, picked, onPick }: { it: Item; picked: boolean; onPick(): void }) {
  return (
    <button type="button" aria-pressed={picked} onClick={onPick} className={`min-w-0 flex-1 rounded-theme border-2 p-2 text-left ${picked ? 'border-accent bg-accent/10' : 'border-line'}`}>
      <span className="block truncate font-medium">{titleCase(it.name)}</span>
      <span className="block truncate text-xs text-muted">{it.qty > 0 ? formatStock(it.qty, it.unit) : 'none'}{it.aliases.length ? ` · also “${it.aliases[0]}”${it.aliases.length > 1 ? ` +${it.aliases.length - 1}` : ''}` : ''}</span>
      <span className="mt-1 block text-xs font-semibold text-accent">{picked ? 'Keep this one' : 'Tap to keep this one'}</span>
    </button>
  );
}

/** Settings > Duplicates: items that might be the same thing. Merging keeps one, adds the stock together and re-points the list, recipes and history. Nothing is merged by itself. */
export function DuplicatesTab() {
  const api = useApi();
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [keep, setKeep] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { api.duplicateItems().then(setPairs).catch((e: Error) => { setPairs([]); toast(e.message); }); }, [api]);
  useEffect(load, [load]);
  useEffect(() => subscribe('items', load), [load]);
  const key = (p: Pair) => `${p.a.id}:${p.b.id}`;

  async function merge(p: Pair) {
    const keepId = keep[key(p)] ?? p.a.id, from = keepId === p.a.id ? p.b : p.a, into = keepId === p.a.id ? p.a : p.b;
    if (!window.confirm(`Merge “${titleCase(from.name)}” into “${titleCase(into.name)}”? Their stock is added together and the list and recipes point at “${titleCase(into.name)}”.`)) return;
    setBusy(true);
    try { await api.mergeItems(from.id, into.id); toast(`Merged into ${titleCase(into.name)}`); load(); } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  }
  async function different(p: Pair) { try { await api.dismissDuplicate(p.a.id, p.b.id); setPairs((cur) => (cur ?? []).filter((x) => x !== p)); } catch (e) { toast((e as Error).message); } }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Items that look like they could be the same thing. Pasta and fettuccine are different, so nothing is merged unless you say so. “Different things” hides a pair for good.</p>
      {pairs === null && <p className="text-sm text-muted">Looking…</p>}
      {pairs && !pairs.length && <div className="card flex flex-col items-center gap-2 p-8 text-center"><Check className="text-good" size={26} /><p className="font-medium">No likely duplicates</p><p className="text-sm text-muted">New ones show up here as items are added.</p></div>}
      {pairs?.map((p) => (
        <div key={key(p)} className="card space-y-2 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">{WHY[p.reason]}</div>
          <div className="flex gap-2"><Side it={p.a} picked={(keep[key(p)] ?? p.a.id) === p.a.id} onPick={() => setKeep((k) => ({ ...k, [key(p)]: p.a.id }))} /><Side it={p.b} picked={keep[key(p)] === p.b.id} onPick={() => setKeep((k) => ({ ...k, [key(p)]: p.b.id }))} /></div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-accent flex h-11 items-center gap-1.5 px-4" disabled={busy} onClick={() => void merge(p)}><GitMerge size={16} />Merge into the one I keep</button>
            <button className="btn h-11 px-4" onClick={() => void different(p)}>Different things</button>
          </div>
        </div>
      ))}
    </div>
  );
}
