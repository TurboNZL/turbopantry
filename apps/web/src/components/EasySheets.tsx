import { Check, Minus, Package, PackageX, Plus, Settings2, ShoppingCart, Trash2 } from 'lucide-react';
import { formatStock, titleCase, unitLabel, formatQuantity, type Item, type ListEntry } from '@turbopantry/shared';
import { Sheet } from './Sheet.tsx';

/** A big − amount + for easy mode: 56 px buttons, the number large, the unit spelled out under it. */
export function BigStepper({ value, step, unit, onChange, label }: { value: number; step: number; unit: string | null; onChange(v: number): void; label: string }) {
  const clamp = (v: number) => Math.max(0, Math.round(v * 1000) / 1000);
  const u = unitLabel(unit, value);
  return (
    <div className="flex items-center justify-center gap-5" role="group" aria-label={label}>
      <button type="button" className="btn flex h-14 w-14 items-center justify-center !p-0" aria-label={`Less ${label}`} disabled={value <= 0} onClick={() => onChange(clamp(value - step))}><Minus size={26} /></button>
      <div className="min-w-[6rem] text-center"><div className="text-4xl font-bold tabular-nums">{formatQuantity(value) || '0'}</div>{u && <div className="text-sm text-muted">{u}</div>}</div>
      <button type="button" className="btn flex h-14 w-14 items-center justify-center !p-0" aria-label={`More ${label}`} onClick={() => onChange(clamp(value + step))}><Plus size={26} /></button>
    </div>
  );
}

/** A pantry item in easy mode: what you have, then three big things you can do. */
export function EasyItemSheet({ item, onClose, onChange, onOut, onList, onMore }: { item: Item; onClose(): void; onChange(qty: number): void; onOut(): void; onList(): void; onMore(): void }) {
  const out = item.qty <= 0;
  return (
    <Sheet title={titleCase(item.name)} onClose={onClose}>
      <p className="text-center text-base text-muted">{out ? 'You are out of this.' : `You have ${formatStock(item.qty, item.unit)}.`}</p>
      <BigStepper label={titleCase(item.name)} value={item.qty} step={item.step} unit={item.unit} onChange={onChange} />
      <div className="space-y-2.5 pt-1">
        <button className="btn btn-accent easy-action" onClick={() => { onList(); onClose(); }}><ShoppingCart size={22} />Add to the shopping list</button>
        {!out && <button className="btn easy-action" onClick={() => { onOut(); onClose(); }}><PackageX size={22} />I have run out</button>}
        <button className="btn btn-ghost easy-action text-muted" onClick={() => { onClose(); onMore(); }}><Settings2 size={20} />More about this item</button>
      </div>
    </Sheet>
  );
}

/** A shopping line in easy mode: how much, then three big things you can do. */
export function EasyLineSheet({ entry, canOut, onClose, onQty, onBuy, onRemove, onView }: { entry: ListEntry; canOut: boolean; onClose(): void; onQty(v: number): void; onBuy(): void; onRemove(): void; onView(): void }) {
  void canOut;
  return (
    <Sheet title={titleCase(entry.name)} onClose={onClose}>
      {entry.qty !== null && <BigStepper label={titleCase(entry.name)} value={entry.qty} step={entry.step} unit={entry.unit} onChange={onQty} />}
      <div className="space-y-2.5 pt-1">
        <button className="btn btn-accent easy-action" onClick={() => { onBuy(); onClose(); }}><Check size={22} />Got it</button>
        <button className="btn easy-action" onClick={() => { onRemove(); onClose(); }}><Trash2 size={22} />Take it off the list</button>
        <button className="btn btn-ghost easy-action text-muted" onClick={() => { onClose(); onView(); }}><Package size={20} />See it in the pantry</button>
      </div>
    </Sheet>
  );
}
