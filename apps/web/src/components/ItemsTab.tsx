import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Trash2, X } from 'lucide-react';
import { GROUP_SECTIONS, PLACES, formatStock, searchItems, titleCase, type CountMode, type Item } from '@turbopantry/shared';
import { Segmented } from './Segmented.tsx';
import { Stepper } from './Stepper.tsx';
import { MODE_OPTIONS, patchForMode } from './ItemSheet.tsx';
import { useItems } from '../lib/data.ts';
import { toast } from '../lib/toast.ts';
import { useApi } from '../lib/useApi.ts';
import { cn } from '../lib/cn.ts';

const COUNT_UNITS: [string, string][] = [['', 'each'], ['can', 'cans'], ['jar', 'jars'], ['packet', 'packets'], ['bunch', 'bunches'], ['clove', 'cloves'], ['slice', 'slices'], ['piece', 'pieces']];
const WEIGHT_UNITS: [string, string][] = [['g', 'grams'], ['kg', 'kilograms'], ['ml', 'millilitres'], ['l', 'litres']];
const lab = 'mb-1 block text-sm font-medium';
const field = 'input h-11';

/** Every setting of one item. The name shows in Title Case; "View real capitalisation" shows (and lets you edit) the name exactly as it was typed. */
function ItemEditor({ item, onSaved, onGone }: { item: Item; onSaved(): void; onGone(): void }) {
  const api = useApi();
  const [real, setReal] = useState(false);
  const [name, setName] = useState(titleCase(item.name));
  const [d, setD] = useState({ mode: item.mode, unit: item.unit, step: item.step, defaultQty: item.defaultQty, minQty: item.minQty, category: item.category, place: item.place ?? '', gpc: item.gramsPerCup ? String(item.gramsPerCup) : '' });
  const [aliases, setAliases] = useState(item.aliases);
  const [alias, setAlias] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(real ? item.name : titleCase(item.name)), [real, item.name]);
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));

  async function save() {
    setBusy(true); setError(null);
    const extra = alias.trim() ? [...aliases, alias.trim()] : aliases;
    const shown = real ? item.name : titleCase(item.name);
    try {
      await api.updateItem(item.id, {
        ...(name.trim() !== shown ? { name: name.trim() } : {}), mode: d.mode, unit: d.unit, step: d.step, defaultQty: d.defaultQty, minQty: d.minQty, category: d.category, place: (d.place || null) as Item['place'],
        aliases: extra, gramsPerCup: Number(d.gpc) > 0 ? Number(d.gpc) : null,
      });
      setAlias(''); toast('Saved'); onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Delete “${titleCase(item.name)}”? Recipes keep their wording but lose the link.`)) return;
    try { await api.deleteItem(item.id); toast(`Deleted ${titleCase(item.name)}`); onSaved(); onGone(); } catch (e) { setError((e as Error).message); }
  }
  return (
    <div className="card space-y-4 p-4">
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
      <div>
        <div className="mb-1 flex items-center justify-between"><span className="text-sm font-medium">Name</span>
          <button type="button" className="inline-flex min-h-[2.25rem] items-center gap-1.5 text-sm text-accent" aria-pressed={real} onClick={() => setReal(!real)}>{real ? <EyeOff size={15} /> : <Eye size={15} />}{real ? 'Show Title Case' : 'View real capitalisation'}</button></div>
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} aria-label="Name" />
      </div>
      <div><span className={lab}>How is it counted?</span>
        <Segmented label="How it is counted" value={d.mode} options={MODE_OPTIONS} onChange={(m: CountMode) => setD((x) => ({ ...x, ...patchForMode({ unit: x.unit }, m) }))} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className={lab}>Unit</span>
          <select className={field} value={d.unit ?? ''} onChange={(e) => set('unit', e.target.value || null)}>{(d.mode === 'amount' ? COUNT_UNITS : WEIGHT_UNITS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="block"><span className={lab}>Shop group</span>
          <select className={field} value={d.category} onChange={(e) => set('category', e.target.value)}>{GROUP_SECTIONS.map((s) => <optgroup key={s.section} label={s.section}>{s.groups.map((g) => <option key={g}>{g}</option>)}</optgroup>)}</select></label>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">{d.mode === 'chunks' ? 'One chunk is' : 'Each tap changes it by'}</span><Stepper label="step" value={d.step} step={d.unit === 'g' || d.unit === 'ml' ? 25 : d.unit === 'kg' || d.unit === 'l' ? 0.25 : 1} unit={d.unit} min={0.001} onChange={(v) => set('step', v)} /></div>
        <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Add this much by default</span><Stepper label="default amount" value={d.defaultQty} step={d.step} unit={d.unit} onChange={(v) => set('defaultQty', v)} /></div>
        <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Keep at least <span className="font-normal text-muted">(0 = don't watch)</span></span><Stepper label="minimum" value={d.minQty} step={d.step} unit={d.unit} onChange={(v) => set('minQty', v)} /></div>
      </div>
      <label className="block"><span className={lab}>Kept in</span><select className={field} value={d.place} onChange={(e) => set('place', e.target.value)}><option value="">Not set</option>{PLACES.map((p) => <option key={p}>{p}</option>)}</select></label>
      <div><span className={lab}>Also written as</span>
        <p className="mb-2 text-sm text-muted">Recipes that use these words are linked to this item.</p>
        <div className="flex flex-wrap gap-2">{aliases.map((a) => <span key={a} className="chip inline-flex items-center gap-1 !py-1.5">{a}<button type="button" aria-label={`Remove ${a}`} onClick={() => setAliases(aliases.filter((x) => x !== a))}><X size={14} /></button></span>)}</div>
        <input className={`${field} mt-2`} placeholder="Another wording, then Save" value={alias} onChange={(e) => setAlias(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && alias.trim()) { e.preventDefault(); setAliases([...aliases, alias.trim()]); setAlias(''); } }} />
      </div>
      <label className="block"><span className={lab}>Grams in a cup <span className="font-normal text-muted">(optional)</span></span><input className={field} inputMode="decimal" value={d.gpc} onChange={(e) => set('gpc', e.target.value)} placeholder="e.g. 125 for plain flour" /></label>
      <div className="flex gap-2 border-t border-line pt-4">
        <button className="btn h-11 !px-3" onClick={() => void remove()} aria-label="Delete item"><Trash2 size={18} /></button>
        <button className="btn btn-accent h-11 flex-1" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

/** Settings > Items: search every item on the left, change it on the right (on a phone the list and the editor take turns). */
export function ItemsTab() {
  const { items, reload } = useItems();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const selected = items.find((i) => i.id === Number(params.get('item')));
  const shown = useMemo(() => (q.trim() ? searchItems(items, q, 60) : items), [items, q]);
  const pick = (id: number | null) => { const p = new URLSearchParams(params); if (id) p.set('item', String(id)); else p.delete('item'); setParams(p, { replace: true }); };
  return (
    <div className="grid gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
      <div className={cn('space-y-2', selected && 'hidden md:block')}>
        <input className="input h-11" placeholder="Search items" aria-label="Search items" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="card max-h-[70vh] divide-y divide-line overflow-y-auto" role="listbox" aria-label="Items">
          {shown.map((it) => (
            <button key={it.id} role="option" aria-selected={it.id === selected?.id} className={cn('flex min-h-[3rem] w-full items-center justify-between gap-2 px-3 text-left', it.id === selected?.id && 'bg-raised')} onClick={() => pick(it.id)}>
              <span className="min-w-0 truncate">{titleCase(it.name)}</span><span className="shrink-0 text-sm text-muted">{it.tracked ? formatStock(it.qty, it.unit) : ''}</span>
            </button>
          ))}
          {!shown.length && <p className="p-4 text-sm text-muted">{items.length ? 'Nothing matches.' : 'No items yet. Add some in the pantry or the shopping list.'}</p>}
        </div>
      </div>
      <div className={cn(!selected && 'hidden md:block')}>
        {selected
          ? <div className="space-y-3"><button className="inline-flex min-h-[2.5rem] items-center gap-1.5 text-sm text-muted md:hidden" onClick={() => pick(null)}><ArrowLeft size={16} />All items</button><ItemEditor key={selected.id + selected.name} item={selected} onSaved={reload} onGone={() => pick(null)} /></div>
          : <div className="card p-8 text-center text-sm text-muted">Pick an item to change how it is counted, its shop group, other wordings and more.</div>}
      </div>
    </div>
  );
}
