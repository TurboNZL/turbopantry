import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BookOpen, Package, Search, Settings, ShoppingCart } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { effectiveUi } from 'turbothemes';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/cn.ts';
import { useStore } from '../lib/store.ts';
import { useListEntries } from '../lib/data.ts';
import { useLiveConnection } from '../lib/live.ts';
import { Toasts } from './Toasts.tsx';
import { ContextMenuHost } from '../lib/contextMenu.tsx';

const NAV = [
  { to: '/recipes', label: 'Recipes', icon: BookOpen },
  { to: '/pantry', label: 'Pantry', icon: Package },
  { to: '/shopping', label: 'Shopping', icon: ShoppingCart },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/**
 * Keeps the CSS variables --ind-x/-y/-w/-h at the active link's box, for the `.bt-ind` element that some UI styles slide
 * across (Liquid Glass: the lit pill; Windows 11: the accent bar). The first placement does not animate.
 */
function useIndicator<T extends HTMLElement>(key: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const place = () => {
      const a = box.querySelector<HTMLElement>('[aria-current="page"]');
      box.style.setProperty('--ind-o', a ? '1' : '0');
      if (!a) return;
      box.style.setProperty('--ind-x', `${a.offsetLeft}px`); box.style.setProperty('--ind-y', `${a.offsetTop}px`);
      box.style.setProperty('--ind-w', `${a.offsetWidth}px`); box.style.setProperty('--ind-h', `${a.offsetHeight}px`);
    };
    place();
    const raf = requestAnimationFrame(() => box.setAttribute('data-ind-ready', ''));
    const ro = new ResizeObserver(place);
    ro.observe(box);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [key]);
  return ref;
}

/** The gradients the Marshmallow style strokes its navigation icons with (a glossy candy look): light lip, bright body, deeper base. Only drawn for that style. */
const CANDY = ['#ff7aa8', '#ffa24d', '#ffd23f', '#5fd08b', '#4cc9e8', '#6f8cff', '#b67cff'];
const shade = (hex: string, to: number) => { const n = parseInt(hex.slice(1), 16), m = (c: number) => Math.round(c + (to < 0 ? c * to : (255 - c) * to)); return `rgb(${m((n >> 16) & 255)} ${m((n >> 8) & 255)} ${m(n & 255)})`; };
function CandyDefs() {
  return (
    <svg width="0" height="0" aria-hidden focusable="false" style={{ position: 'absolute' }}>
      <defs>{CANDY.map((c, i) => (
        <linearGradient key={c} id={`mm-g${i + 1}`} gradientUnits="userSpaceOnUse" x1="0" y1="1" x2="0" y2="23">
          <stop offset="0" stopColor={shade(c, 0.7)} /><stop offset="0.34" stopColor={shade(c, 0.25)} /><stop offset="0.52" stopColor={c} /><stop offset="1" stopColor={shade(c, -0.28)} />
        </linearGradient>))}
      </defs>
    </svg>
  );
}


/**
 * The shell. Markup carries the themes' hook classes (bt-side, bt-top, bt-nav, bt-tabbar ...); where the pages are listed is the user's
 * layout choice (lib/layout.ts, layouts.css): side bar, icon rail, top tabs or a bottom dock. The phone always gets the bottom bar.
 */
export function Layout() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  useLiveConnection(); // one live stream per device: pantry, list and recipes update on every phone at once
  const open = useListEntries().entries.filter((e) => !e.checked).length;
  const badge = (to: string, big = false) => (to === '/shopping' && open > 0 ? <span className={cn('inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold leading-5 text-accent-fg', big ? 'ml-1' : 'absolute right-1/4 top-0.5')} aria-label={`${open} on the list`}>{open}</span> : null);
  const onRecipes = pathname.startsWith('/recipes') || pathname === '/';
  const sideRef = useIndicator<HTMLElement>(pathname);
  const tabRef = useIndicator<HTMLElement>(pathname);
  const [q, setQ] = useState('');
  const ui = useStore((s) => s.settings.ui);
  const layout = useStore((s) => s.settings.layout);
  const topbar = layout === 'topbar', dock = layout === 'dock';
  const noSide = topbar || dock; // these layouts have no side bar at all
  const logo = '/icon.svg';
  return (
    <div className="flex h-full flex-col">
      {effectiveUi(ui) === 'lgux' && <CandyDefs />}
      <div className="bt-scrim" aria-hidden />
      <div className="flex min-h-0 flex-1">
        {!noSide && <aside ref={sideRef} className="bt-side bt-shell relative hidden w-56 shrink-0 flex-col gap-1 p-3 md:flex">
          <span className="bt-ind" aria-hidden />
          <div className="bt-brand mb-3 flex items-center gap-2.5 px-3 pt-1 text-lg font-bold tracking-tight"><img src={logo} alt="" width={26} height={26} className="h-[26px] w-[26px] shrink-0" draggable={false} /><span className="bt-label-text">TurboPantry</span></div>
          {NAV.map(({ to, label, icon: Icon, ...rest }) => (
            <NavLink key={to} to={to} end={'end' in rest} title={label} className="bt-nav flex items-center gap-3 px-3 py-2 text-sm font-medium">
              <Icon size={18} className="shrink-0" /><span className="bt-label-text">{label}</span>{badge(to, true)}
            </NavLink>
          ))}
        </aside>}
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          <form className="bt-top bt-shell sticky top-0 z-10 p-3 backdrop-blur" onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/recipes?q=${encodeURIComponent(q.trim())}`); }}>
            <div className="bt-topin relative mx-auto flex max-w-3xl items-center gap-3">
              <div className={cn('flex shrink-0 items-center gap-2 font-bold', !noSide && 'md:hidden')}><img src={logo} alt="TurboPantry" width={28} height={28} className="h-7 w-7 shrink-0" draggable={false} />{topbar && <span className="hidden md:inline">TurboPantry</span>}</div>
              {topbar && <nav className="bt-toplinks hidden min-w-0 items-center gap-6 overflow-x-auto md:flex" aria-label="Pages">
                {NAV.map(({ to, label, ...rest }) => <NavLink key={to} to={to} end={'end' in rest} className="bt-toplink whitespace-nowrap">{label}{badge(to, true)}</NavLink>)}
              </nav>}
              {onRecipes ? <div className="bt-search relative flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted" />
                <input className="input pl-9" placeholder="Search recipes" aria-label="Search recipes" value={q} onChange={(e) => setQ(e.target.value)} />
              </div> : <div className="flex-1" />}
            </div>
          </form>
          <div className="bt-content mx-auto max-w-6xl p-4 md:p-6"><div key={pathname} className="bt-page"><Outlet /></div></div>
        </main>
      </div>
      <nav ref={tabRef} className={cn('bt-tabbar bt-shell relative flex', !dock && 'md:hidden')}>
        <span className="bt-ind" aria-hidden />
        {NAV.map(({ to, label, icon: Icon, ...rest }) => (
          <NavLink key={to} to={to} end={'end' in rest} className="bt-tab relative flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px]"><Icon size={22} />{label}{badge(to)}</NavLink>
        ))}
      </nav>
      <Toasts />
      <ContextMenuHost />
    </div>
  );
}
