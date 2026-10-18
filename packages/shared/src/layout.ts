/**
 * Floor plans for the faux-3D views: a kitchen (pantry places) and one per shop (aisles). A plan is a list of boxes ("blocks") on a square grid.
 * Everything here is pure so the server, the builder and the tests share one set of rules.
 */
import { GROUPS } from './items.ts';

export type LayoutKind = 'pantry' | 'store';

export interface Block {
  id: string;
  /** What it was made from ("fridge", "aisle", "wall"). Decides whether things can be kept in it. */
  kind: string;
  /** Top-left corner on the floor, in grid cells, AFTER turning (the box always sits inside the floor). */
  x: number;
  y: number;
  /** How many steps up its underside is: blocks rest on whatever is below them (`settle`), so stacking is just dropping one on another. */
  z?: number;
  /** Size before turning: width, depth (cells) and height (steps). */
  w: number;
  d: number;
  h: number;
  /** Which way its front faces, in degrees. 90 and 270 swap width and depth. */
  rot: 0 | 90 | 180 | 270;
  label: string;
  color: string;
  /** Pantry: the place name, when it should differ from the label. */
  place?: string;
  /** Store: the shopping groups found here. */
  groups?: string[];
  /** Store: the order the shop is walked in (1 = first). */
  walk?: number;
}

export interface Layout { blocks: Block[] }

export const MAX_BLOCKS = 120;
/** Cells along each side of the floor (a shop is much bigger than a kitchen). */
export const FLOOR: Record<LayoutKind, number> = { pantry: 24, store: 64 };
export const MAX_SIDE = 64;
export const MAX_HEIGHT = 12;
/** How high a stack of blocks may go, in steps. */
export const MAX_STACK = 24;
export const MAX_LABEL = 30;

export const BLOCK_COLORS = ['#c9d6e2', '#8fb8de', '#7fd1b9', '#e8c170', '#e39a8f', '#b9a0de', '#a4a4a4', '#6c7a89'];

/** There is one kind of block. Give it a name and things can be kept in it (a kitchen) or shopping groups put in it (a shop). */
export const NEW_BLOCK = { kind: 'block', label: '', w: 2, d: 2, h: 3, color: '#8fb8de' } as const;

/** Every block can hold things (older plans had walls and doorways that could not; they can now). A kitchen block is a place once it has a name (`placeOf`). */
export const holdsThings = (_kind: string): boolean => true;

export const newId = (): string => Math.random().toString(36).slice(2, 10).padEnd(8, '0');

/** One grid cell per step: dragging snaps to whole cells. */
export const snap = (v: number): number => Math.round(v);

const clampInt = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));

/** The footprint on the floor after turning. */
export const footprint = (b: Pick<Block, 'w' | 'd' | 'rot'>): { w: number; d: number } => (b.rot === 90 || b.rot === 270 ? { w: b.d, d: b.w } : { w: b.w, d: b.d });

/** Sizes bounded, turning normalised, and the box pulled back inside the floor. */
export function clampBlock(b: Block, size: number): Block {
  const w = clampInt(b.w, 1, Math.min(MAX_SIDE, size)), d = clampInt(b.d, 1, Math.min(MAX_SIDE, size));
  const rot = ([0, 90, 180, 270].includes(b.rot) ? b.rot : 0) as Block['rot'];
  const f = footprint({ w, d, rot });
  return { ...b, w, d, rot, h: clampInt(b.h, 1, MAX_HEIGHT), x: clampInt(b.x, 0, size - f.w), y: clampInt(b.y, 0, size - f.d) };
}

export function overlaps(a: Block, b: Block): boolean {
  const fa = footprint(a), fb = footprint(b);
  return a.x < b.x + fb.w && b.x < a.x + fa.w && a.y < b.y + fb.d && b.y < a.y + fa.d;
}

/**
 * Lets every block rest on whatever is below it: its level is the top of the highest block it overlaps on the floor (0 when it overlaps none).
 * Blocks are taken from the bottom up, so an existing stack keeps its order; `top` is a block that was just dropped, which always lands on top of what it overlaps.
 */
export function settle(blocks: Block[], top?: string): Block[] {
  const order = blocks.map((b, i) => ({ b, i })).sort((p, q) => (p.b.id === top ? 1 : 0) - (q.b.id === top ? 1 : 0) || (p.b.z ?? 0) - (q.b.z ?? 0) || p.i - q.i);
  const placed: Block[] = [];
  const out = new Map<string, Block>();
  for (const { b } of order) {
    let z = 0;
    for (const o of placed) if (overlaps(b, o)) z = Math.max(z, (o.z ?? 0) + o.h);
    const nb = { ...b, z };
    placed.push(nb); out.set(b.id, nb);
  }
  return blocks.map((b) => out.get(b.id)!);
}

/** Whether `b` fits inside the floor and the stack it would make is not too high. It may sit on other blocks. */
export function canPlace(blocks: Block[], b: Block, size: number): boolean {
  const f = footprint(b);
  if (b.x < 0 || b.y < 0 || b.x + f.w > size || b.y + f.d > size) return false;
  return settle([...blocks.filter((o) => o.id !== b.id), b], b.id).every((o) => (o.z ?? 0) + o.h <= MAX_STACK);
}

/** The free spot nearest to `near` (default the top-left corner) where a box of this size fits on the floor, or null when the floor is full. */
export function freeSpot(blocks: Block[], w: number, d: number, size: number, rot: Block['rot'] = 0, near: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } | null {
  const probe: Block = { id: '', kind: '', x: 0, y: 0, w, d, h: 1, rot, label: '', color: '' };
  const f = footprint(probe);
  let best: { x: number; y: number } | null = null, bestDist = Infinity;
  for (let y = 0; y + f.d <= size; y++) for (let x = 0; x + f.w <= size; x++) {
    const dist = (x + f.w / 2 - near.x) ** 2 + (y + f.d / 2 - near.y) ** 2;
    if (dist < bestDist && !blocks.some((o) => overlaps({ ...probe, x, y }, o))) { best = { x, y }; bestDist = dist; }
  }
  return best;
}

/** "Cupboard" -> "Cupboard 2" when the name is taken, so every place name is unique. */
export function uniqueLabel(blocks: Block[], label: string, exceptId?: string): string {
  const taken = new Set(blocks.filter((b) => b.id !== exceptId).map((b) => b.label.trim().toLowerCase()));
  if (!taken.has(label.trim().toLowerCase())) return label;
  const base = label.replace(/\s+\d+$/, '');
  for (let n = 2; n < 100; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
  return label;
}

/** A new block with the given name, in the free floor spot nearest `near`, or null when there is no room. */
export function newBlock(blocks: Block[], label: string, size: number, near?: { x: number; y: number }): Block | null {
  const spot = freeSpot(blocks, NEW_BLOCK.w, NEW_BLOCK.d, size, 0, near);
  if (!spot) return null;
  const name = label.trim().slice(0, MAX_LABEL);
  return settle([...blocks, { id: newId(), kind: NEW_BLOCK.kind, ...spot, w: NEW_BLOCK.w, d: NEW_BLOCK.d, h: NEW_BLOCK.h, rot: 0, label: name ? uniqueLabel(blocks, name) : '', color: NEW_BLOCK.color }]).at(-1)!;
}

/** A copy next to the original (or in any free spot). */
export function duplicateBlock(blocks: Block[], src: Block, size: number): Block | null {
  const spot = freeSpot(blocks, footprint(src).w, footprint(src).d, size, src.rot);
  if (!spot) return null;
  const { walk: _walk, ...rest } = src;
  const copy: Block = { ...rest, id: newId(), ...spot, z: 0, label: src.label ? uniqueLabel(blocks, src.label) : '' };
  if (src.groups) copy.groups = [...src.groups];
  return copy;
}

/** The kitchen offered to someone with an empty plan: a fridge, a freezer and a few shelves, all named so they are places. */
export function starterKitchen(): Layout {
  const at = (label: string, x: number, y: number, w: number, d: number, h: number, color: string, rot: Block['rot'] = 0): Block => ({ id: newId(), kind: NEW_BLOCK.kind, x, y, w, d, h, rot, label, color });
  return { blocks: settle([at('Fridge', 0, 0, 2, 2, 6, '#c9d6e2'), at('Freezer', 11, 0, 2, 2, 5, '#8fb8de'), at('Pantry', 0, 5, 3, 1, 7, '#e8c170', 90), at('Cupboard', 4, 1, 3, 1, 4, '#b9a0de'), at('Bench', 4, 3, 5, 2, 3, '#a4a4a4'), at('Island', 5, 8, 4, 2, 3, '#7fd1b9')]) };
}

/** The place name of a block: its explicit place, else its label. Null while the block has no name (a block you name is a place things can be kept in). */
export const placeOf = (b: Block): string | null => b.place?.trim() || b.label.trim() || null;

/**
 * The shopping groups in the order the shop is walked: the groups of block 1, then block 2, ... then every group nothing claimed, in `rest`'s
 * order. A group on two blocks counts at its first one.
 */
export function walkOrder(blocks: Block[], rest: string[] = GROUPS): string[] {
  const out: string[] = [];
  for (const b of [...blocks].filter((x) => x.walk !== undefined && x.groups?.length).sort((a, b2) => a.walk! - b2.walk!)) for (const g of b.groups!) if (GROUPS.includes(g) && !out.includes(g)) out.push(g);
  for (const g of rest) if (GROUPS.includes(g) && !out.includes(g)) out.push(g);
  for (const g of GROUPS) if (!out.includes(g)) out.push(g);
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const HEX = /^#[0-9a-fA-F]{6}$/;
const KIND = /^[a-z][a-z0-9-]{0,23}$/;

/** Checks and cleans a plan from outside (unknown keys dropped, numbers bounded, strings trimmed). Returns a message when it cannot be used. */
export function sanitizeLayout(raw: unknown, kind: LayoutKind): Layout | string {
  if (!isObj(raw) || !Array.isArray(raw.blocks)) return 'Send a plan as { "blocks": [...] }.';
  if (raw.blocks.length > MAX_BLOCKS) return `A plan can have at most ${MAX_BLOCKS} blocks.`;
  const size = FLOOR[kind], seen = new Set<string>(), blocks: Block[] = [];
  for (const r of raw.blocks) {
    if (!isObj(r)) return 'Every block must be an object.';
    const id = typeof r.id === 'string' ? r.id.trim().slice(0, 24) : '';
    if (!/^[A-Za-z0-9_-]{1,24}$/.test(id)) return 'Every block needs a short id.';
    if (seen.has(id)) return 'Block ids must be unique.';
    seen.add(id);
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 1);
    const k = typeof r.kind === 'string' && KIND.test(r.kind) ? r.kind : 'block';
    let b: Block = clampBlock({
      id, kind: k, x: num(r.x), y: num(r.y), w: num(r.w), d: num(r.d), h: num(r.h), rot: (typeof r.rot === 'number' ? ((((Math.round(r.rot / 90) % 4) + 4) % 4) * 90) : 0) as Block['rot'],
      label: typeof r.label === 'string' ? r.label.trim().slice(0, MAX_LABEL) : '', color: typeof r.color === 'string' && HEX.test(r.color) ? r.color : BLOCK_COLORS[0]!,
    }, size);
    if (typeof r.z === 'number' && Number.isFinite(r.z)) b = { ...b, z: clampInt(r.z, 0, MAX_STACK) };
    if (typeof r.place === 'string' && r.place.trim()) b = { ...b, place: r.place.trim().slice(0, MAX_LABEL) };
    if (Array.isArray(r.groups)) b = { ...b, groups: [...new Set(r.groups.filter((g): g is string => typeof g === 'string' && GROUPS.includes(g)))] };
    if (typeof r.walk === 'number' && Number.isFinite(r.walk)) b = { ...b, walk: clampInt(r.walk, 1, MAX_BLOCKS) };
    blocks.push(b);
  }
  return { blocks: settle(blocks) };
}
