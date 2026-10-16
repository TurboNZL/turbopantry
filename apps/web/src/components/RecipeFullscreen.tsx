import { useEffect, useState } from 'react';
import { Check, Minimize2, Minus, Plus } from 'lucide-react';
import { displayAmount, formatQuantity, highlightStep, titleCase, type Item, type Recipe } from '@turbopantry/shared';
import { cn } from '../lib/cn.ts';

type Mode = 'original' | 'metric-cups' | 'metric-grams';

/**
 * The recipe, full screen, for cooking: big text, the screen stays awake, tap an ingredient to tick it and a step to mark it done. It asks the browser
 * for real full screen where that exists (phones' Safari only allows it for video, so there it simply fills the page).
 */
export function RecipeFullscreen({ r, factor, shown, known, onServings, showQuantities, mode, byId, onClose }: {
  r: Recipe; factor: number; shown: number; known: boolean; onServings(v: number): void; showQuantities: boolean; mode: Mode; byId: Map<number, Item>; onClose(): void;
}) {
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [done, setDone] = useState<Set<number>>(new Set());
  const flip = (set: Set<number>, i: number) => { const n = new Set(set); if (n.has(i)) n.delete(i); else n.add(i); return n; };

  useEffect(() => {
    const el = document.documentElement;
    let lock: { release(): Promise<void> } | null = null;
    void (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? Promise.resolve()).catch(() => undefined);
    const wake = () => { (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen').then((l) => { lock = l; }, () => undefined); };
    wake();
    const again = () => { if (document.visibilityState === 'visible') wake(); }; // the lock is dropped when the page is hidden
    const onFs = () => { if (!document.fullscreenElement) onClose(); };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('visibilitychange', again); document.addEventListener('fullscreenchange', onFs); window.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('visibilitychange', again); document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('keydown', key);
      void lock?.release(); if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [onClose]);

  const step = known ? 1 : 0.5;
  let section: string | null | undefined;
  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-bg text-fg" role="dialog" aria-modal="true" aria-label={`${r.title}, full screen`}>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/95 px-3 py-2 backdrop-blur">
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{r.title}</h1>
        <div className="flex items-center gap-1" role="group" aria-label="Servings">
          <button className="btn btn-ghost flex h-11 w-11 items-center justify-center !p-0" aria-label="Fewer servings" onClick={() => onServings(Math.max(step, shown - step))}><Minus size={18} /></button>
          <span className="min-w-[4.5rem] text-center text-sm tabular-nums">{known ? `${shown} ${shown === 1 ? 'serving' : 'servings'}` : `${formatQuantity(shown)}× batch`}</span>
          <button className="btn btn-ghost flex h-11 w-11 items-center justify-center !p-0" aria-label="More servings" onClick={() => onServings(shown + step)}><Plus size={18} /></button>
        </div>
        <button className="btn h-11" onClick={onClose} aria-label="Leave full screen"><Minimize2 size={18} /><span className="hidden sm:inline">Exit</span></button>
      </div>
      <div className="mx-auto grid max-w-6xl gap-8 p-4 pb-24 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:p-8">
        <section aria-label="Ingredients">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">Ingredients</h2>
          <ul className="space-y-1">
            {r.ingredients.map((it, i) => {
              const head = it.section !== section && it.section ? <li key={`h${i}`} className="pt-4 text-xs font-semibold uppercase tracking-wider text-muted">{it.section}</li> : null;
              section = it.section;
              const amount = showQuantities ? displayAmount(it, factor, mode, (it.itemId ? byId.get(it.itemId) : undefined)?.gramsPerCup ?? null).amount : '';
              return [head, (
                <li key={i}><button type="button" className={cn('flex min-h-[3rem] w-full items-start gap-3 py-2 text-left text-xl leading-snug', ticked.has(i) && 'text-muted line-through')} aria-pressed={ticked.has(i)} onClick={() => setTicked(flip(ticked, i))}>
                  <span className={cn('mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2', ticked.has(i) ? 'border-good bg-good text-white' : 'border-line')}>{ticked.has(i) && <Check size={14} strokeWidth={3} />}</span>
                  <span>{amount && <strong className="font-semibold tabular-nums">{amount} </strong>}{it.quantity === null ? it.raw : titleCase(it.name).toLowerCase()}{it.quantity !== null && it.note && <span className="text-muted">, {it.note}</span>}</span>
                </button></li>
              )];
            })}
          </ul>
        </section>
        <section aria-label="Method">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">Method</h2>
          {r.steps.length ? <ol className="space-y-5">{r.steps.map((s, i) => (
            <li key={i}><button type="button" className={cn('flex w-full gap-4 text-left text-2xl leading-snug', done.has(i) && 'text-muted opacity-60')} aria-pressed={done.has(i)} onClick={() => setDone(flip(done, i))}>
              <span className={cn('mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold', done.has(i) ? 'bg-good text-white' : 'bg-accent text-accent-fg')}>{done.has(i) ? <Check size={18} strokeWidth={3} /> : i + 1}</span>
              <span>{highlightStep(s, r.ingredients, { hideQuantities: !showQuantities, factor }).map((seg, k) => (seg.bold ? <strong key={k} className="font-semibold">{seg.text}</strong> : <span key={k}>{seg.text}</span>))}</span>
            </button></li>))}</ol> : <p className="text-muted">No method written down.</p>}
        </section>
      </div>
    </div>
  );
}
