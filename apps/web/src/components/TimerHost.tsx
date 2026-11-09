import { useEffect, useState } from 'react';
import { Pause, Play, Plus, X } from 'lucide-react';
import { alarm, clock, useTimers } from '../lib/timers.ts';
import { cn } from '../lib/cn.ts';

/** The running countdowns, stacked at the top right of the page (above the full-screen cooking view too). Mounted once in the layout. */
export function TimerHost() {
  const { timers, pause, resume, remove, add, ring } = useTimers();
  const [, tick] = useState(0);
  const running = timers.some((t) => t.endsAt);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      tick((n) => n + 1);
      for (const t of useTimers.getState().timers) if (t.endsAt && !t.rang && t.endsAt <= Date.now()) { ring(t.id); alarm(t.label); }
    }, 500);
    return () => window.clearInterval(id);
  }, [running, ring]);
  if (!timers.length) return null;
  return (
    <div className="pointer-events-none fixed right-2 top-16 z-[80] flex w-[min(18rem,calc(100vw-1rem))] flex-col gap-2" aria-label="Timers">
      {timers.map((t) => {
        const left = t.endsAt ? (t.endsAt - Date.now()) / 1000 : t.left, done = t.rang;
        return (
          <div key={t.id} className={cn('pointer-events-auto flex items-center gap-1 rounded-theme border bg-surface px-2 py-1.5 shadow-lg', done ? 'animate-pulse border-bad' : 'border-line')} role="timer" aria-label={`${t.label}, ${clock(left)} left`}>
            <div className="min-w-0 flex-1 px-1"><div className="truncate text-xs text-muted">{t.label}</div><div className={cn('text-lg font-bold tabular-nums leading-tight', done && 'text-bad')}>{done ? 'Done' : clock(left)}</div></div>
            {!done && <button className="btn btn-ghost flex h-10 w-10 items-center justify-center !p-0" aria-label={t.endsAt ? 'Pause' : 'Resume'} onClick={() => (t.endsAt ? pause(t.id) : resume(t.id))}>{t.endsAt ? <Pause size={18} /> : <Play size={18} />}</button>}
            <button className="btn btn-ghost flex h-10 items-center gap-0.5 px-2 text-xs" aria-label="Add a minute" onClick={() => add(t.id, 60)}><Plus size={14} />1 min</button>
            <button className="btn btn-ghost flex h-10 w-10 items-center justify-center !p-0" aria-label="Stop this timer" onClick={() => remove(t.id)}><X size={18} /></button>
          </div>);
      })}
    </div>
  );
}
