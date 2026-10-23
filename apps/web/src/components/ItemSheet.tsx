import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SlidersHorizontal, Trash2 } from 'lucide-react';
import { COUNT_MODE_LABELS, COUNT_MODES, defaultsForUnit, titleCase, type CountMode, type Item } from '@turbopantry/shared';
import { Segmented } from './Segmented.tsx';
import { Select } from './Select.tsx';
import { Sheet } from './Sheet.tsx';
import { Stepper } from './Stepper.tsx';
import { useApi } from '../lib/useApi.ts';
import { toast } from '../lib/toast.ts';

const WEIGHT_UNITS = ['g', 'kg', 'ml', 'l'];

/** What changing the way an item is counted does to its unit, step and default: the one rule used by the sheet and by the full editor. */
export function patchForMode(item: Pick<Item, 'unit'>, mode: CountMode): { mode: CountMode; unit: string | null; step: number; defaultQty: number } {
  const unit = mode === 'amount' ? null : item.unit && WEIGHT_UNITS.includes(item.unit) ? item.unit : 'g';
  return { mode, unit, ...defaultsForUnit(unit, mode) };
}

export const COUNT_UNIT_OPTIONS: [string, string][] = [['', 'each'], ['bag', 'bags'], ['bottle', 'bottles'], ['box', 'boxes'], ['can', 'cans'], ['jar', 'jars'], ['packet', 'packets'], ['bunch', 'bunches'], ['clove', 'cloves'], ['slice', 'slices'], ['piece', 'pieces']];
export const WEIGHT_UNIT_OPTIONS: [string, string][] = [['g', 'grams'], ['kg', 'kg'], ['ml', 'ml'], ['l', 'litres']];
export const MODE_OPTIONS = COUNT_MODES.map((m) => ({ value: m, label: COUNT_MODE_LABELS[m] }));

/**
 * The few settings a person needs: the name, how it is counted (a switch, not a dropdown), the chunk size when it is bought in chunks, and how
 * low it may get. Everything else is one tap away in Settings > Items.
 */
export function ItemSheet({ item, onClose, onSaved }: { item: Item; onClose(): void; onSaved(): void }) {
  const api = useApi();
  const [name, setName] = useState(titleCase(item.name));
  const [mode, setMode] = useState<CountMode>(item.mode);
  const [unit, setUnit] = useState(item.unit);
  const [step, setStep] = useState(item.step);
  const [defaultQty, setDefaultQty] = useState(item.defaultQty);
  const [essential, setEssential] = useState(item.essential);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pick(m: CountMode) { const p = patchForMode({ unit }, m); setMode(m); setUnit(p.unit); setStep(p.step); setDefaultQty(p.defaultQty); }
  async function save() {
    setBusy(true); setError(null);
    try {
      const renamed = name.trim() !== titleCase(item.name); // an untouched name keeps its real capitalisation
      await api.updateItem(item.id, { ...(renamed ? { name: name.trim() } : {}), mode, unit, step, defaultQty, essential });
      onSaved(); onClose();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Delete “${titleCase(item.name)}”? Recipes keep their wording but lose the link.`)) return;
    try { await api.deleteItem(item.id); toast(`Deleted ${titleCase(item.name)}`); onSaved(); onClose(); } catch (e) { setError((e as Error).message); }
  }
  const lab = 'mb-1 block text-sm font-medium';
  return (
    <Sheet title="Item" onClose={onClose} footer={<div className="flex gap-2"><button className="btn h-11 !px-3" onClick={() => void remove()} aria-label="Delete item"><Trash2 size={18} /></button><button className="btn btn-accent h-11 flex-1" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button></div>}>
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
      <label className="block"><span className={lab}>Name</span><input className="input h-11" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></label>
      <div><span className={lab}>How is it counted?</span><Segmented label="How it is counted" value={mode} options={MODE_OPTIONS} onChange={pick} /></div>
      {mode === 'chunks' && <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">One chunk is</span><Stepper label="chunk" value={step} step={unit === 'kg' || unit === 'l' ? 0.25 : 50} unit={unit} min={0.001} onChange={(v) => { setStep(v); setDefaultQty(v); }} /></div>}
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm font-medium">Usual amount to buy</span>
        <span className="flex items-center gap-1">
          <Stepper compact label="usual amount" value={defaultQty} step={step} unit={null} onChange={setDefaultQty} />
          <Select className="h-10 min-w-[7rem] !py-0 text-sm" aria-label="Measured in" value={unit ?? ''} onChange={(v) => setUnit(v || null)} options={(mode === 'amount' ? COUNT_UNIT_OPTIONS : WEIGHT_UNIT_OPTIONS).map(([value, label]) => ({ value, label }))} />
        </span></div>
      <label className="flex min-h-[2.75rem] cursor-pointer items-start gap-3"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={essential} onChange={(e) => setEssential(e.target.checked)} />
        <span><span className="block text-sm font-medium">Can't run out</span><span className="block text-xs text-muted">When it is out, or at or below “keep at least”, it goes on the shopping list by itself.</span></span></label>
      <p className="text-sm"><Link to={`/settings?tab=items&item=${item.id}`} onClick={onClose} className="inline-flex min-h-[2.75rem] items-center gap-2 text-accent underline-offset-2 hover:underline"><SlidersHorizontal size={16} />More settings: keep at least, aliases, shop group…</Link></p>
    </Sheet>
  );
}
