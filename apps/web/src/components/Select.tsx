import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn.ts';

export interface SelectOption { value: string; label: string; /** Options with the same group sit under one heading. */ group?: string }

interface Props {
  value: string;
  onChange(value: string): void;
  options: SelectOption[];
  /** Shown while `value` matches no option (for a "Put in…" style menu that always starts empty). */
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * A drop-down drawn by the app, in the theme's own `.input` and `.bt-menu` look. The browser's built-in <select> menu is painted by the operating
 * system (square, white, a different font), which ignores the chosen theme, so nothing in the app uses it. Keyboard: arrows, Home/End, Enter,
 * Escape, and typing the first letters. The list is drawn in a portal so a sheet or card cannot clip it.
 */
export function Select({ value, onChange, options, placeholder, className, disabled, 'aria-label': ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<CSSProperties>({});
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const id = useId();
  const current = options.find((o) => o.value === value);

  const place = () => {
    const r = btn.current?.getBoundingClientRect(); if (!r) return;
    const below = window.innerHeight - r.bottom, above = r.top, up = below < 220 && above > below;
    const room = Math.max(120, Math.min(up ? above : below, window.innerHeight * 0.6) - 12);
    setBox({ left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 8)), minWidth: Math.max(r.width, 180), maxHeight: room, ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
  };
  const show = () => { if (disabled) return; place(); setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen(true); };
  const close = (refocus = true) => { setOpen(false); if (refocus) btn.current?.focus(); };
  const choose = (o: SelectOption) => { close(); if (o.value !== value) onChange(o.value); };

  useLayoutEffect(() => { if (open) list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { const t = e.target as Node; if (!list.current?.contains(t) && !btn.current?.contains(t)) setOpen(false); };
    const scrolled = (e: Event) => { if (!list.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away); window.addEventListener('resize', place); window.addEventListener('scroll', scrolled, true);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('resize', place); window.removeEventListener('scroll', scrolled, true); };
  }, [open]);

  function key(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { if (open) { e.stopPropagation(); close(); } return; } // a sheet around the menu stays open
    if (e.key === 'Tab') { setOpen(false); return; }
    if (!open) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); } return; }
    if (e.key === 'ArrowDown') setActive((a) => Math.min(options.length - 1, a + 1));
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(options.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') { const o = options[active]; if (o) choose(o); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const now = Date.now(), t = typed.current;
      t.text = now - t.at > 700 ? e.key.toLowerCase() : t.text + e.key.toLowerCase(); t.at = now;
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(t.text));
      if (hit >= 0) setActive(hit);
      return;
    } else return;
    e.preventDefault();
  }

  let group: string | undefined;
  return (
    <>
      <button ref={btn} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} aria-label={ariaLabel} disabled={disabled}
        className={cn('input flex items-center justify-between gap-2 text-left', !current && 'text-muted', className)} onClick={() => (open ? close() : show())} onKeyDown={key}>
        <span className="min-w-0 truncate">{current?.label ?? placeholder ?? ''}</span>
        <ChevronDown size={16} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && createPortal(
        <div ref={list} id={`${id}-list`} role="listbox" aria-label={ariaLabel} className="bt-menu fixed z-[90] overflow-y-auto overscroll-contain shadow-xl" style={box}>
          {options.map((o, i) => {
            const head = o.group && o.group !== group ? <div key={`g-${o.group}`} className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted" role="presentation">{o.group}</div> : null;
            group = o.group;
            return [head, (
              <button key={o.value} type="button" role="option" aria-selected={o.value === value} data-active={i === active} tabIndex={-1}
                className={cn('flex min-h-[2.75rem] w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm', i === active && 'bg-accent/15', o.value === value && 'font-semibold')}
                onPointerEnter={() => setActive(i)} onClick={() => choose(o)}>
                <span className="min-w-0">{o.label}</span>{o.value === value && <Check size={16} className="shrink-0 text-accent" aria-hidden />}
              </button>
            )];
          })}
        </div>, document.body)}
    </>
  );
}
