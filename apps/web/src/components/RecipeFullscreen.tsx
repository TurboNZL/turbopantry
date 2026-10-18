import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Minimize2, Minus, PictureInPicture2, Plus } from 'lucide-react';
import { displayAmount, formatQuantity, highlightStep, titleCase, type Item, type Recipe } from '@turbopantry/shared';
import { cn } from '../lib/cn.ts';
import { nativeCook } from '../lib/native.ts';

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
  const [cur, setCur] = useState(0); // the step being cooked: previous / next move it (and tick the one left behind)
  const [pip, setPip] = useState(false); // Android: shrunk into a floating window
  const pipRef = useRef(false); pipRef.current = pip;
  const last = r.steps.length - 1;
  const go = (d: 1 | -1) => setCur((c) => {
    const n = Math.max(0, Math.min(last, c + d));
    if (n !== c) setDone((s) => { const x = new Set(s); if (d === 1) x.add(c); else x.delete(n); return x; });
    return n;
  });
  const goRef = useRef(go); goRef.current = go;
  const flip = (set: Set<number>, i: number) => { const n = new Set(set); if (n.has(i)) n.delete(i); else n.add(i); return n; };

  useEffect(() => {
    const el = document.documentElement;
    let lock: { release(): Promise<void> } | null = null;
    void (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? Promise.resolve()).catch(() => undefined);
    const wake = () => { (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen').then((l) => { lock = l; }, () => undefined); };
    wake();
    const again = () => { if (document.visibilityState === 'visible') wake(); }; // the lock is dropped when the page is hidden
    const onFs = () => { if (!document.fullscreenElement && !pipRef.current) onClose(); }; // shrinking into a floating window can end full screen: the recipe stays
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') goRef.current(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goRef.current(-1);
    };
    nativeCook.setActive(true); // Android: leaving the app now shrinks it into a floating window instead of hiding it
    const offAction = nativeCook.onAction((a) => goRef.current(a === 'next' ? 1 : -1)), offPip = nativeCook.onPip(setPip);
    document.addEventListener('visibilitychange', again); document.addEventListener('fullscreenchange', onFs); window.addEventListener('keydown', key);
    return () => {
      nativeCook.setActive(false); offAction(); offPip();
      document.removeEventListener('visibilitychange', again); document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('keydown', key);
      void lock?.release(); if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [onClose]);

  useEffect(() => { document.getElementById(`cook-step-${cur}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [cur]);

  const step = known ? 1 : 0.5;
  const stepText = (i: number) => highlightStep(r.steps[i] ?? '', r.ingredients, { hideQuantities: !showQuantities, factor }).map((seg, k) => (seg.bold ? <strong key={k} className="font-semibold">{seg.text}</strong> : <span key={k}>{seg.text}</span>));
  if (pip) { // the small floating window: only the step, the buttons are the window's own
    return (
      <div className="fixed inset-0 z-[70] flex flex-col justify-center gap-1 overflow-hidden bg-bg p-3 text-fg" role="status" aria-label="Current step">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">Step {cur + 1} of {r.steps.length}</div>
        <p className="line-clamp-6 text-lg leading-snug">{r.steps.length ? stepText(cur) : r.title}</p>
      </div>
    );
  }
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
        {nativeCook.supported() && <button className="btn h-11" onClick={() => nativeCook.enterPip()} aria-label="Picture in picture" title="Keep the step in a small window"><PictureInPicture2 size={18} /></button>}
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
            <li key={i} id={`cook-step-${i}`} className={cn('rounded-theme', i === cur && 'ring-2 ring-accent ring-offset-4 ring-offset-bg')}><button type="button" className={cn('flex w-full gap-4 text-left text-2xl leading-snug', done.has(i) && 'text-muted opacity-60')} aria-pressed={done.has(i)} aria-current={i === cur ? 'step' : undefined} onClick={() => { setCur(i); setDone(flip(done, i)); }}>
              <span className={cn('mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold', done.has(i) ? 'bg-good text-white' : 'bg-accent text-accent-fg')}>{done.has(i) ? <Check size={18} strokeWidth={3} /> : i + 1}</span>
              <span>{stepText(i)}</span>
            </button></li>))}</ol> : <p className="text-muted">No method written down.</p>}
        </section>
      </div>
      {r.steps.length > 1 && (
        <div className="fixed inset-x-0 bottom-0 z-10 flex items-center gap-2 border-t border-line bg-bg/95 p-2 backdrop-blur" role="group" aria-label="Steps">
          <button className="btn h-14 flex-1" disabled={cur === 0} onClick={() => go(-1)} aria-label="Previous step"><ChevronLeft size={22} />Back</button>
          <span className="min-w-[5.5rem] text-center text-sm tabular-nums text-muted">Step {cur + 1} of {r.steps.length}</span>
          <button className="btn btn-accent h-14 flex-1" disabled={cur === last} onClick={() => go(1)} aria-label="Next step">Next<ChevronRight size={22} /></button>
        </div>
      )}
    </div>
  );
}
