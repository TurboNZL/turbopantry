import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { CornerDownLeft, Delete, Send, X } from 'lucide-react';
import { useApi } from '../lib/useApi.ts';
import type { InstagramLiveEvent, InstagramLiveStatus } from '../lib/api.ts';

/**
 * The live login window: a picture of a browser on the SERVER showing Instagram's own login page. The owner taps and types here, the events go to the
 * server, and the next picture comes back. The password therefore goes from the owner's keys into Instagram's page and never through a TurboPantry
 * form. Plain requests only (no WebSocket), so it works through a Cloudflare Tunnel: one request in flight for pictures (the server holds it up to
 * ~1.5 s until the page changes) and one for input, so nothing piles up. UNVERIFIED against the real Instagram (see server/src/import/instagram-session.ts).
 */
const NAMED_KEYS = new Set(['Backspace', 'Enter', 'Tab', 'Escape', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
const WAIT_MS = 1500;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function InstagramLive({ onLoggedIn, onClose }: { onLoggedIn: (username: string | undefined) => void; onClose: () => void }) {
  const api = useApi();
  const box = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const alive = useRef(true);
  const doneRef = useRef(onLoggedIn);
  doneRef.current = onLoggedIn;
  const idRef = useRef<string | null>(null);
  const size = useRef({ w: 0, h: 0 });
  const queue = useRef<InstagramLiveEvent[]>([]);
  const sending = useRef(false);
  const [phase, setPhase] = useState<'starting' | 'open' | 'logged-in' | 'ended'>('starting');
  const [message, setMessage] = useState('Opening Instagram’s login page…');
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<{ seen?: string; notice?: string }>({});
  const [left, setLeft] = useState<number | null>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [marker, setMarker] = useState<{ x: number; y: number; k: number } | null>(null);
  const [text, setText] = useState('');
  const [secret, setSecret] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // ---- send input: one request at a time, scroll events merged, at most 50 per request
  const flush = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      while (queue.current.length && idRef.current && alive.current) {
        const batch = queue.current.splice(0, 50);
        try { await api.instagramLiveInput(idRef.current, batch); }
        catch (e) { if (alive.current) setError((e as Error).message); }
      }
    } finally { sending.current = false; }
  }, [api]);
  const send = useCallback((e: InstagramLiveEvent) => {
    const last = queue.current[queue.current.length - 1];
    if (e.type === 'wheel' && last?.type === 'wheel') { last.dy = Math.max(-3000, Math.min(3000, last.dy + e.dy)); last.x = e.x; last.y = e.y; }
    else queue.current.push(e);
    void flush();
  }, [flush]);

  // ---- start, then fetch pictures and the status until the window ends
  useEffect(() => {
    alive.current = true;
    const ctl = new AbortController();
    let shown: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function run() {
      const width = Math.round(Math.max(280, Math.min(box.current?.clientWidth ?? 340, 480)));
      const height = Math.round(Math.max(360, Math.min(width * 1.55, 640)));
      let started: { id: string; w: number; h: number };
      try { started = await api.instagramLiveStart({ width, height, dpr: Math.min(window.devicePixelRatio || 1, 2) }); }
      catch (e) { if (alive.current) { setPhase('ended'); setError((e as Error).message); setMessage('The login window could not be opened.'); } return; }
      if (!alive.current) { void api.instagramLiveCancel(started.id).catch(() => null); return; }
      idRef.current = started.id; size.current = { w: started.w, h: started.h };
      setDims({ w: started.w, h: started.h }); setPhase('open'); setMessage('Waiting for you to log in…');

      let seq = -1, fails = 0, lastStatus = 0;
      const status = async () => {
        lastStatus = Date.now();
        const s: InstagramLiveStatus = await api.instagramLiveStatus(started.id);
        if (!alive.current) return true;
        setLeft(s.secondsLeft); setSeen({ seen: s.seen, notice: s.notice });
        if (s.state === 'logged-in') { setPhase('logged-in'); setMessage(s.message || 'Logged in. The login is saved.'); doneRef.current(s.username); return true; }
        if (s.state === 'closed') { setPhase('ended'); setMessage(s.message || 'The login window was closed.'); return true; }
        setMessage(s.message || 'Waiting for you to log in…');
        return false;
      };
      while (alive.current) {
        if (document.hidden) { await new Promise<void>((r) => { const f = () => { if (!document.hidden) { document.removeEventListener('visibilitychange', f); r(); } }; document.addEventListener('visibilitychange', f); timer = setTimeout(() => { document.removeEventListener('visibilitychange', f); r(); }, 30_000); }); continue; }
        try {
          const f = await api.instagramLiveFrame(started.id, seq, WAIT_MS, ctl.signal);
          fails = 0;
          if (f.closed) { await status(); return; }
          if (f.image) {
            seq = f.seq;
            const url = URL.createObjectURL(f.image);
            if (img.current) img.current.src = url;
            if (shown) URL.revokeObjectURL(shown);
            shown = url; setHasFrame(true);
            await new Promise((r) => setTimeout(r, 90)); // a pause between two pictures even while the page keeps changing
          }
          if (Date.now() - lastStatus > 2000 && (await status())) return;
        } catch (e) {
          if (!alive.current) return;
          if (++fails >= 5) { setPhase('ended'); setError((e as Error).message); setMessage('Lost the connection to the server.'); return; }
          await new Promise((r) => setTimeout(r, 800 * fails));
        }
      }
    }
    const t = setTimeout(() => { void run(); }, 0); // after StrictMode's first mount/unmount, so the window is opened once
    return () => {
      alive.current = false; clearTimeout(t); clearTimeout(timer); ctl.abort();
      if (shown) URL.revokeObjectURL(shown);
      const id = idRef.current; idRef.current = null; // leaving the page closes the browser on the server
      if (id) void api.instagramLiveCancel(id).catch(() => null);
    };
  }, [api, attempt]);

  // ---- pointer: a tap clicks, a drag scrolls
  const drag = useRef<{ x: number; y: number; lx: number; ly: number; moved: boolean } | null>(null);
  const toPage = (cx: number, cy: number) => {
    const r = view.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(size.current.w, ((cx - r.left) / r.width) * size.current.w)), y: Math.max(0, Math.min(size.current.h, ((cy - r.top) / r.height) * size.current.h)) };
  };
  function down(e: PointerEvent) {
    if (phase !== 'open') return;
    view.current?.focus({ preventScroll: true });
    view.current?.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
  }
  function move(e: PointerEvent) {
    const d = drag.current; if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) d.moved = true;
    if (!d.moved) return;
    const r = view.current!.getBoundingClientRect(), k = size.current.w / r.width;
    const p = toPage(e.clientX, e.clientY);
    send({ type: 'wheel', x: p.x, y: p.y, dx: Math.round((d.lx - e.clientX) * k), dy: Math.round((d.ly - e.clientY) * k) });
    d.lx = e.clientX; d.ly = e.clientY;
  }
  function up(e: PointerEvent) {
    const d = drag.current; drag.current = null;
    if (!d || d.moved || phase !== 'open') return;
    const p = toPage(e.clientX, e.clientY);
    send({ type: 'tap', x: p.x, y: p.y });
    setMarker({ x: (p.x / size.current.w) * 100, y: (p.y / size.current.h) * 100, k: Date.now() });
  }
  // the mouse wheel scrolls the page, not ours (needs a non-passive listener to stop the card scrolling too)
  useEffect(() => {
    const el = view.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (phase !== 'open') return;
      e.preventDefault();
      const p = toPage(e.clientX, e.clientY);
      send({ type: 'wheel', x: p.x, y: p.y, dx: Math.round(e.deltaX), dy: Math.round(e.deltaY) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
  function key(e: KeyboardEvent) {
    if (phase !== 'open' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (NAMED_KEYS.has(e.key)) { e.preventDefault(); send({ type: 'key', key: e.key }); }
    else if ([...e.key].length === 1) { e.preventDefault(); send({ type: 'key', key: e.key === ' ' ? ' ' : e.key }); }
  }

  const sendText = () => { if (!text) return; for (let i = 0; i < text.length; i += 200) send({ type: 'text', text: text.slice(i, i + 200) }); setText(''); };
  const press = (k: string) => send({ type: 'key', key: k });
  const cancel = async () => {
    const id = idRef.current; idRef.current = null; alive.current = false;
    if (id) await api.instagramLiveCancel(id).catch(() => null);
    onClose();
  };

  const open = phase === 'open';
  return (
    <div className="space-y-3" ref={box}>
      <p className="text-sm" role="status" aria-live="polite">
        {message}{open && left !== null && left > 0 ? <span className="text-muted"> Closes in {fmt(left)}.</span> : null}
      </p>
      {dims && (
        <div
          ref={view}
          tabIndex={0}
          role="application"
          aria-label="Instagram login page. Tap a field, then type below."
          className="relative mx-auto w-full select-none overflow-hidden rounded-lg border border-line bg-white outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent,#3ddc97)]"
          style={{ aspectRatio: `${dims.w} / ${dims.h}`, maxWidth: dims.w, touchAction: 'none' }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }} onKeyDown={key}
        >
          <img ref={img} alt="" draggable={false} className="pointer-events-none block h-full w-full" />
          {!hasFrame && phase === 'open' && <p className="absolute inset-0 grid place-items-center text-sm text-neutral-500">Loading the page…</p>}
          {marker && <span key={marker.k} className="pointer-events-none absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-sky-500/50" style={{ left: `${marker.x}%`, top: `${marker.y}%`, animationIterationCount: 1, animationDuration: '600ms' }} />}
          {!open && <div className="absolute inset-0 bg-white/60" />}
        </div>
      )}

      {open && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              className="input h-11 min-w-0 flex-1" aria-label="Type here" placeholder="Type here, then Send" type={secret ? 'password' : 'text'}
              autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="send" maxLength={200}
              value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendText(); } }}
            />
            <button type="button" className="btn btn-accent h-11 min-w-[5rem]" onClick={sendText} disabled={!text}><Send size={16} className="mr-1.5 inline" />Send</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn h-11 min-w-[3rem]" aria-label="Backspace" onClick={() => press('Backspace')}><Delete size={16} className="mr-1.5 inline" />Backspace</button>
            <button type="button" className="btn h-11 min-w-[3rem]" onClick={() => press('Tab')}>Tab</button>
            <button type="button" className="btn h-11 min-w-[3rem]" onClick={() => press('Enter')}><CornerDownLeft size={16} className="mr-1.5 inline" />Enter</button>
            <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={secret} onChange={(e) => setSecret(e.target.checked)} />Hide while typing</label>
          </div>
          <p className="text-xs text-muted">Tap a field on the page above, type here, press Send. What you type goes straight into Instagram’s page: TurboPantry never keeps it. Drag the page to scroll.</p>
        </div>
      )}

      {seen.notice && <p className="text-sm text-bad" role="alert">{seen.notice}</p>}
      {seen.seen && <details className="text-xs text-muted"><summary className="min-h-[44px] cursor-pointer py-3">What the server sees (to report a problem)</summary><p className="break-words">{seen.seen}</p></details>}
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {phase === 'ended' && <button type="button" className="btn btn-accent h-11" onClick={() => { setError(null); setHasFrame(false); setDims(null); setPhase('starting'); setMessage('Opening Instagram’s login page…'); setAttempt((n) => n + 1); }}>Try again</button>}
        {phase !== 'logged-in' && <button type="button" className="btn h-11" onClick={() => void cancel()}><X size={16} className="mr-1.5 inline" />{phase === 'ended' ? 'Close' : 'Cancel'}</button>}
      </div>
    </div>
  );
}
