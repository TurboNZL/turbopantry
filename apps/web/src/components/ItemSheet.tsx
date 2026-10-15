import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { CATEGORIES, PLACES, defaultsForUnit, type Item } from '@turbopantry/shared';
import { Sheet } from './Sheet.tsx';
import { Stepper } from './Stepper.tsx';
import { useApi } from '../lib/useApi.ts';
import { toast } from '../lib/toast.ts';

export const UNITS: [string, string][] = [['', 'each'], ['g', 'g'], ['kg', 'kg'], ['ml', 'ml'], ['l', 'l'], ['cup', 'cups'], ['tbsp', 'tbsp'], ['tsp', 'tsp'], ['clove', 'cloves'], ['can', 'cans'], ['jar', 'jars'], ['packet', 'packets'], ['bunch', 'bunches'], ['slice', 'slices'], ['piece', 'pieces']];

const num = (s: string, fallback: number) => { const n = Number(s.replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : fallback; };

/** An item's settings. The two that matter most for a thumb: how much one tap changes it, and how much is added by default. */
export function ItemSheet({ item, onClose, onSaved }: { item: Item; onClose(): void; onSaved(): void }) {
  const api = useApi();
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [unit, setUnit] = useState(item.unit ?? '');
  const [qty, setQty] = useState(item.qty);
  const [step, setStep] = useState(String(item.step));
  const [defaultQty, setDefaultQty] = useState(String(item.defaultQty));
  const [minQty, setMinQty] = useState(item.minQty);
  const [staple, setStaple] = useState(item.staple);
  const [place, setPlace] = useState(item.place ?? '');
  const [aliases, setAliases] = useState(item.aliases);
  const [alias, setAlias] = useState('');
  const [gpc, setGpc] = useState(item.gramsPerCup ? String(item.gramsPerCup) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setError(null);
    const extra = alias.trim() ? [...aliases, alias.trim()] : aliases;
    try {
      await api.updateItem(item.id, { name: name.trim(), category, unit: unit || null, qty, step: Math.max(0.001, num(step, item.step)), defaultQty: num(defaultQty, item.defaultQty), minQty, staple, place: place || null, aliases: extra, gramsPerCup: gpc.trim() ? num(gpc, 0) || null : null });
      onSaved(); onClose();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Delete “${item.name}”? Recipes keep their wording but lose the link.`)) return;
    try { await api.deleteItem(item.id); toast(`Deleted ${item.name}`); onSaved(); onClose(); } catch (e) { setError((e as Error).message); }
  }
  const lab = 'mb-1 block text-sm font-medium';
  const field = 'input h-11';
  return (
    <Sheet title="Item settings" onClose={onClose} footer={<div className="flex gap-2"><button className="btn h-11 !px-3" onClick={() => void remove()} aria-label="Delete item"><Trash2 size={18} /></button><button className="btn btn-accent h-11 flex-1" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button></div>}>
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
      <label className="block"><span className={lab}>Name</span><input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></label>
      <div className="flex items-center justify-between gap-3"><span className={lab}>In stock</span><Stepper label="stock" value={qty} step={num(step, item.step) || 1} unit={unit || null} onChange={setQty} /></div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className={lab}>Counted in</span>
          <select className={field} value={unit} onChange={(e) => { setUnit(e.target.value); const d = defaultsForUnit(e.target.value || null); setStep(String(d.step)); setDefaultQty(String(d.defaultQty)); }}>
            {UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></label>
        <label className="block"><span className={lab}>Aisle</span><select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className={lab}>Each tap changes it by</span><input className={field} inputMode="decimal" value={step} onChange={(e) => setStep(e.target.value)} /></label>
        <label className="block"><span className={lab}>Add this much by default</span><input className={field} inputMode="decimal" value={defaultQty} onChange={(e) => setDefaultQty(e.target.value)} /></label>
      </div>
      <div className="flex items-center justify-between gap-3"><span className={lab}>Keep at least <span className="font-normal text-muted">(0 = don't track)</span></span><Stepper label="minimum" value={minQty} step={num(step, item.step) || 1} unit={unit || null} onChange={setMinQty} /></div>
      <label className="flex min-h-[2.75rem] items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={staple} onChange={(e) => setStaple(e.target.checked)} /><span><span className="font-medium">Always have it</span><span className="block text-sm text-muted">Salt, oil: never added to the list.</span></span></label>
      <label className="block"><span className={lab}>Kept in</span><select className={field} value={place} onChange={(e) => setPlace(e.target.value)}><option value="">Not set</option>{PLACES.map((p) => <option key={p}>{p}</option>)}</select></label>
      <div><span className={lab}>Also written as</span>
        <p className="mb-2 text-sm text-muted">Recipes that use these words are linked to this item.</p>
        <div className="flex flex-wrap gap-2">{aliases.map((a) => <span key={a} className="chip inline-flex items-center gap-1 !py-1.5">{a}<button type="button" aria-label={`Remove ${a}`} onClick={() => setAliases(aliases.filter((x) => x !== a))}><X size={14} /></button></span>)}</div>
        <input className={`${field} mt-2`} placeholder="Add another wording, then Save" value={alias} onChange={(e) => setAlias(e.target.value)} />
      </div>
      <label className="block"><span className={lab}>Grams in a cup <span className="font-normal text-muted">(optional)</span></span><input className={field} inputMode="decimal" value={gpc} onChange={(e) => setGpc(e.target.value)} placeholder="e.g. 125 for plain flour" /></label>
    </Sheet>
  );
}
