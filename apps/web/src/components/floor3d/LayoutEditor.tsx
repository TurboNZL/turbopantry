import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Copy, Footprints, Plus, Redo2, RotateCw, Trash2, Undo2 } from 'lucide-react';
import { BLOCK_COLORS, GROUP_SECTIONS, MAX_BLOCKS, MAX_HEIGHT, MAX_LABEL, MAX_SIDE, blockFromPreset, canPlace, clampBlock, duplicateBlock, footprint, holdsThings, presetsFor, uniqueLabel, type Block, type Layout, type LayoutKind, FLOOR } from '@turbopantry/shared';
import { cn } from '../../lib/cn.ts';
import { toast } from '../../lib/toast.ts';
import { Sheet } from '../Sheet.tsx';
import { Stepper } from '../Stepper.tsx';
import { CameraPad, HoldButton } from './CameraPad.tsx';
import { screenStep, type CameraApi } from './camera.ts';
import { Scene3D, type BlockInfo } from './Scene3D.tsx';

const HISTORY = 50;

/** Renumber the walking order 1..n so there are never gaps. */
function renumber(blocks: Block[]): Block[] {
  const order = blocks.filter((b) => b.walk !== undefined).sort((a, b) => a.walk! - b.walk!).map((b) => b.id);
  return blocks.map((b) => { if (b.walk === undefined) return b; return { ...b, walk: order.indexOf(b.id) + 1 }; });
}

function GroupSheet({ block, onChange, onClose }: { block: Block; onChange(groups: string[]): void; onClose(): void }) {
  const has = new Set(block.groups ?? []);
  const toggle = (g: string) => onChange(has.has(g) ? [...has].filter((x) => x !== g) : [...has, g]);
  return (
    <Sheet title={`Groups in ${block.label || 'this block'}`} onClose={onClose} footer={<button className="btn btn-accent h-11 w-full" onClick={onClose}>Done</button>}>
      <p className="text-sm text-muted">Tick what this part of the shop sells. Your shopping list shows these here.</p>
      {GROUP_SECTIONS.map((s) => (
        <div key={s.section} className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{s.section}</h3>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {s.groups.map((g) => (
              <label key={g} className={cn('flex min-h-[2.75rem] cursor-pointer items-center gap-2 rounded-theme border px-3 text-sm', has.has(g) ? 'border-accent bg-accent/10' : 'border-line')}>
                <input type="checkbox" checked={has.has(g)} onChange={() => toggle(g)} />{g}
              </label>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

/**
 * The base layout builder: add blocks from presets, drag them on the floor (snapping, no overlaps), nudge with arrows, turn, resize, rename, colour,
 * duplicate, delete, undo and redo. Changes are saved a moment after the last one, and when you press Done.
 */
export function LayoutEditor({ kind, layout, onSave, onDone, cam }: { kind: LayoutKind; layout: Layout; onSave(l: Layout): void; onDone(): void; cam: CameraApi }) {
  const size = FLOOR[kind];
  const [blocks, setBlocks] = useState<Block[]>(layout.blocks);
  const [past, setPast] = useState<Block[][]>([]);
  const [future, setFuture] = useState<Block[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'add' | 'edit'>('add');
  const [walkMode, setWalkMode] = useState(false);
  const [groupsFor, setGroupsFor] = useState(false);
  const blocksRef = useRef(blocks); blocksRef.current = blocks;
  const dragBase = useRef<Block[] | null>(null);
  const lastKey = useRef<{ key: string; at: number } | null>(null);
  const dirty = useRef(false);
  const saveRef = useRef(onSave); saveRef.current = onSave;
  const sel = blocks.find((b) => b.id === selectedId) ?? null;

  // save a moment after the last change, and for sure when leaving
  useEffect(() => {
    if (!dirty.current) return;
    const t = window.setTimeout(() => { dirty.current = false; saveRef.current({ blocks }); }, 500);
    return () => window.clearTimeout(t);
  }, [blocks]);
  useEffect(() => () => { if (dirty.current) { dirty.current = false; saveRef.current({ blocks: blocksRef.current }); } }, []);

  const apply = useCallback((next: Block[]) => { dirty.current = true; setBlocks(next); }, []);
  const commit = useCallback((next: Block[], key?: string) => {
    const now = Date.now();
    const merge = !!key && lastKey.current?.key === key && now - lastKey.current.at < 1200;
    lastKey.current = key ? { key, at: now } : null;
    if (!merge) setPast((p) => [...p.slice(-(HISTORY - 1)), blocksRef.current]);
    setFuture([]);
    apply(next);
  }, [apply]);
  const undo = () => { const p = past[past.length - 1]; if (!p) return; setPast(past.slice(0, -1)); setFuture((f) => [blocksRef.current, ...f]); lastKey.current = null; apply(p); if (selectedId && !p.some((b) => b.id === selectedId)) setSelectedId(null); };
  const redo = () => { const n = future[0]; if (!n) return; setFuture(future.slice(1)); setPast((p) => [...p, blocksRef.current]); lastKey.current = null; apply(n); };

  const change = (id: string, patch: Partial<Block>, key?: string, quiet = false) => {
    const cur = blocksRef.current.find((b) => b.id === id); if (!cur) return;
    const next = clampBlock({ ...cur, ...patch }, size);
    if (!canPlace(blocksRef.current, next, size)) { if (!quiet) toast('Something is in the way there.'); return; }
    commit(blocksRef.current.map((b) => (b.id === id ? next : b)), key);
  };
  const nudge = (sx: number, sy: number) => { if (!sel) return; const s = screenStep(cam.ref.current, sx, sy); change(sel.id, { x: sel.x + s.x, y: sel.y + s.y }, undefined, true); };
  const remove = () => { if (!sel) return; commit(renumber(blocks.filter((b) => b.id !== sel.id))); setSelectedId(null); setTab('add'); };
  const add = (i: number) => {
    if (blocks.length >= MAX_BLOCKS) { toast(`That is the most blocks a plan can have (${MAX_BLOCKS}).`); return; }
    const b = blockFromPreset(blocks, presetsFor(kind)[i]!, size, { x: size / 2, y: size / 2 });
    if (!b) { toast('There is no free space left on the floor. Make something smaller or delete a block.'); return; }
    commit([...blocks, b]); setSelectedId(b.id); setTab('edit');
  };
  const dup = () => { if (!sel) return; const c = duplicateBlock(blocks, sel, size); if (!c) { toast('There is no free space left on the floor.'); return; } commit([...blocks, c]); setSelectedId(c.id); };
  const rotate = () => { if (!sel) return; const rot = ((sel.rot + 90) % 360) as Block['rot']; const f = footprint({ ...sel, rot }); change(sel.id, { rot, x: Math.min(sel.x, size - f.w), y: Math.min(sel.y, size - f.d) }); };

  const tap = (id: string | null) => {
    if (walkMode) {
      if (!id) return;
      const b = blocksRef.current.find((x) => x.id === id); if (!b || !holdsThings(b.kind)) return;
      const cur = blocksRef.current;
      commit(b.walk !== undefined
        ? renumber(cur.map((x) => { if (x.id !== id) return x; const { walk: _w, ...r } = x; return r; }))
        : cur.map((x) => (x.id === id ? { ...x, walk: Math.max(0, ...cur.map((y) => y.walk ?? 0)) + 1 } : x)));
      setSelectedId(id); return;
    }
    setSelectedId(id); if (id) setTab('edit');
  };

  const onKey = (e: React.KeyboardEvent): boolean => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.shiftKey ? redo() : undo(); return true; }
    if (mod && e.key.toLowerCase() === 'y') { redo(); return true; }
    if (e.key === 'Escape' && selectedId) { setSelectedId(null); return true; }
    if (!sel) return false;
    if (e.key === 'Delete' || e.key === 'Backspace') { remove(); return true; }
    if (e.shiftKey) return false;
    const d: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const v = d[e.key]; if (!v) return false;
    nudge(v[0], v[1]); return true;
  };

  const info = useMemo(() => {
    const m = new Map<string, BlockInfo>();
    for (const b of blocks) if (b.walk !== undefined) m.set(b.id, { badge: b.walk, tone: 'walk' });
    return m;
  }, [blocks]);

  const presets = presetsFor(kind);
  return (
    <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-5 lg:space-y-0">
      <div className="z-20 -mx-1 space-y-2 bg-bg px-1 pb-2 pt-1 top-14 md:top-16 [@media(min-height:700px)]:sticky">
        <div className="flex items-center gap-2">
          <button className="btn flex h-11 w-11 items-center justify-center !p-0" onClick={undo} disabled={!past.length} aria-label="Undo"><Undo2 size={18} /></button>
          <button className="btn flex h-11 w-11 items-center justify-center !p-0" onClick={redo} disabled={!future.length} aria-label="Redo"><Redo2 size={18} /></button>
          {kind === 'store' && <button className={cn('btn flex h-11 items-center gap-1.5 whitespace-nowrap px-3', walkMode && 'btn-accent')} aria-pressed={walkMode} onClick={() => { setWalkMode(!walkMode); }}><Footprints size={18} />Walk order</button>}
          <span className="flex-1" />
          <button className="btn btn-accent flex h-11 items-center gap-1.5 px-4" onClick={() => { if (dirty.current) { dirty.current = false; onSave({ blocks: blocksRef.current }); } onDone(); }}><Check size={18} />Done</button>
        </div>
        {walkMode && (
          <div className="flex items-center gap-2 rounded-theme border border-accent bg-accent/10 p-2 text-sm">
            <span className="flex-1">Tap the aisles in the order you walk the shop. Tap a number again to take it off.</span>
            <button className="btn h-9 px-3" onClick={() => commit(blocks.map(({ walk: _w, ...r }) => r as Block))} disabled={!blocks.some((b) => b.walk !== undefined)}>Clear</button>
          </div>
        )}
        <Scene3D cam={cam} size={size} blocks={blocks} selectedId={selectedId} editable={!walkMode} info={info} compact
          label={kind === 'pantry' ? 'Kitchen layout builder' : 'Shop layout builder'}
          onTap={tap} onDragStart={(id) => { dragBase.current = blocksRef.current; setSelectedId(id); }}
          onMove={(id, x, y) => apply(blocksRef.current.map((b) => (b.id === id ? { ...b, x, y } : b)))}
          onDragEnd={() => { const base = dragBase.current; dragBase.current = null; if (base && base !== blocksRef.current) { setPast((p) => [...p.slice(-(HISTORY - 1)), base]); setFuture([]); lastKey.current = null; } }}
          onKey={onKey} />
        <CameraPad cam={cam} />
      </div>

      <div className="space-y-3">

      <div role="tablist" aria-label="Builder" className="grid grid-cols-2 gap-1 rounded-theme border border-line bg-raised p-1">
        {(['add', 'edit'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn('min-h-[2.75rem] rounded-theme px-2 text-sm font-medium', tab === t ? 'bg-accent text-accent-fg shadow-sm' : 'text-muted')}>{t === 'add' ? 'Add a block' : sel ? `Edit ${sel.label || 'block'}` : 'Edit block'}</button>
        ))}
      </div>

      {tab === 'add' && (
        <div className="card space-y-2 p-3">
          <p className="text-sm text-muted">Tap one to put it on the floor, then drag it where it goes. {blocks.length}/{MAX_BLOCKS} blocks.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {presets.map((p, i) => (
              <button key={p.kind} className="btn flex h-12 items-center justify-center gap-2 px-2 text-sm" onClick={() => add(i)}>
                <span className="h-3 w-3 shrink-0 rounded-sm border border-black/30" style={{ background: p.color }} aria-hidden /><Plus size={14} className="shrink-0" /><span className="truncate">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'edit' && (sel ? (
        <div className="card space-y-3 p-3">
          <label className="block text-sm"><span className="mb-1 block font-medium">Name</span>
            <input className="input h-11 w-full" value={sel.label} maxLength={MAX_LABEL} aria-label="Block name"
              onChange={(e) => change(sel.id, { label: e.target.value }, `label:${sel.id}`)}
              onBlur={() => { const l = sel.label.trim(); const u = l ? uniqueLabel(blocks, l, sel.id) : sel.label; if (u !== sel.label) change(sel.id, { label: u }); }} />
          </label>
          {kind === 'pantry' && holdsThings(sel.kind) && <p className="-mt-1 text-xs text-muted">Items kept here use this name as their place.</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn flex h-11 items-center gap-1.5 px-3" onClick={rotate}><RotateCw size={18} />Turn 90°</button>
            <button className="btn flex h-11 items-center gap-1.5 px-3" onClick={dup}><Copy size={18} />Duplicate</button>
            <button className="btn flex h-11 items-center gap-1.5 px-3 text-bad" onClick={remove}><Trash2 size={18} />Delete</button>
          </div>
          <div className="flex items-center gap-3">
            <div className="grid grid-cols-3 gap-1" role="group" aria-label="Nudge block">
              <span /><HoldButton label="Nudge up" onAct={() => nudge(0, -1)} className="btn-ghost border border-line"><ArrowUp size={20} /></HoldButton><span />
              <HoldButton label="Nudge left" onAct={() => nudge(-1, 0)} className="border border-line"><ArrowLeft size={20} /></HoldButton>
              <span className="flex h-11 w-11 items-center justify-center text-[10px] text-muted">Nudge</span>
              <HoldButton label="Nudge right" onAct={() => nudge(1, 0)} className="border border-line"><ArrowRight size={20} /></HoldButton>
              <span /><HoldButton label="Nudge down" onAct={() => nudge(0, 1)} className="border border-line"><ArrowDown size={20} /></HoldButton><span />
            </div>
            <p className="min-w-0 flex-1 text-xs text-muted">Or drag the block on the floor. The arrows follow the screen, however you have turned the view.</p>
          </div>
          <div className="space-y-1">
            {([['Width', 'w', MAX_SIDE], ['Depth', 'd', MAX_SIDE], ['Height', 'h', MAX_HEIGHT]] as const).map(([l, k, max]) => (
              <div key={k} className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{l}</span>
                <Stepper compact label={l} value={sel[k]} step={1} unit={null} min={1} max={max} onChange={(v) => change(sel.id, { [k]: v } as Partial<Block>)} /></div>
            ))}
          </div>
          <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-1">
            {BLOCK_COLORS.map((c) => (
              <button key={c} role="radio" aria-checked={sel.color === c} aria-label={`Colour ${c}`} onClick={() => change(sel.id, { color: c })}
                className={cn('flex h-11 w-11 items-center justify-center rounded-theme border-2', sel.color === c ? 'border-accent' : 'border-line')}><span className="block h-7 w-7 rounded-md border border-black/20" style={{ background: c }} /></button>
            ))}
          </div>
          {kind === 'store' && holdsThings(sel.kind) && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Shopping groups here</div>
              <div className="flex flex-wrap gap-1.5">{(sel.groups ?? []).length ? sel.groups!.map((g) => <span key={g} className="chip px-2 py-1 text-xs">{g}</span>) : <span className="text-sm text-muted">None yet.</span>}</div>
              <button className="btn h-11 px-3" onClick={() => setGroupsFor(true)}>Choose groups</button>
            </div>
          )}
        </div>
      ) : <div className="card p-6 text-center text-sm text-muted">Tap a block on the floor to change it.</div>)}

      </div>

      {groupsFor && sel && <GroupSheet block={sel} onChange={(groups) => change(sel.id, { groups }, `groups:${sel.id}`)} onClose={() => setGroupsFor(false)} />}
    </div>
  );
}
