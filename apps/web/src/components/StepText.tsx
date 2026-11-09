import { Timer } from 'lucide-react';
import { findTimes, highlightStep, type Ingredient } from '@turbopantry/shared';
import { askToNotify, spoken, useTimers } from '../lib/timers.ts';

/**
 * One method step: the recipe's own ingredients are highlighted (and bold), and every time period ("20 minutes") is a button that starts a countdown.
 * Amounts that sit before an ingredient follow the servings and "amounts on/off", as before.
 */
export function StepText({ step, ingredients, hideQuantities, factor, label }: { step: string; ingredients: Ingredient[]; hideQuantities: boolean; factor: number; label: string }) {
  const start = useTimers((s) => s.start);
  const parts = highlightStep(step, ingredients, { hideQuantities, factor }).flatMap((seg, k): React.ReactNode[] => {
    if (seg.bold) return [<mark key={`b${k}`} className="rounded bg-accent/20 px-0.5 font-semibold text-inherit">{seg.text}</mark>];
    const times = findTimes(seg.text), out: React.ReactNode[] = [];
    let at = 0;
    times.forEach((t, j) => {
      if (t.start > at) out.push(<span key={`${k}t${j}a`}>{seg.text.slice(at, t.start)}</span>);
      out.push(<button key={`${k}t${j}`} type="button" className="mx-0.5 inline-flex items-center gap-1 rounded-full border border-accent/50 bg-accent/10 px-2 py-0.5 align-baseline text-[0.92em] font-semibold text-inherit hover:bg-accent/20" title={`Start a ${spoken(t.seconds)} timer`} aria-label={`Start a ${spoken(t.seconds)} timer`} onClick={() => { askToNotify(); start(`${label}: ${spoken(t.seconds)}`, t.seconds); }}><Timer size={13} aria-hidden />{seg.text.slice(t.start, t.end)}</button>);
      at = t.end;
    });
    if (at < seg.text.length) out.push(<span key={`${k}z`}>{seg.text.slice(at)}</span>);
    return out;
  });
  return <>{parts}</>;
}
