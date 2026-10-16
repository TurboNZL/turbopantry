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

export const MAX_BLOCKS = 80;
/** Cells along each side of the floor. */
export const FLOOR: Record<LayoutKind, number> = { pantry: 16, store: 24 };
export const MAX_SIDE = 24;
export const MAX_HEIGHT = 12;
export const MAX_LABEL = 30;

export const BLOCK_COLORS = ['#c9d6e2', '#8fb8de', '#7fd1b9', '#e8c170', '#e39a8f', '#b9a0de', '#a4a4a4', '#6c7a89'];

export interface Preset { kind: string; label: string; w: number; d: number; h: number; color: string; groups?: string[] }

export const KITCHEN_PRESETS: Preset[] = [
  { kind: 'fridge', label: 'Fridge', w: 2, d: 2, h: 6, color: '#c9d6e2' },
  { kind: 'freezer', label: 'Freezer', w: 2, d: 2, h: 5, color: '#8fb8de' },
  { kind: 'shelf', label: 'Pantry', w: 3, d: 1, h: 7, color: '#e8c170' },
  { kind: 'cupboard', label: 'Cupboard', w: 3, d: 1, h: 4, color: '#b9a0de' },
  { kind: 'bench', label: 'Bench', w: 5, d: 2, h: 3, color: '#a4a4a4' },
  { kind: 'island', label: 'Island', w: 4, d: 2, h: 3, color: '#7fd1b9' },
  { kind: 'table', label: 'Table', w: 4, d: 3, h: 2, color: '#e39a8f' },
  { kind: 'wall', label: 'Wall', w: 6, d: 1, h: 8, color: '#6c7a89' },
];

export const STORE_PRESETS: Preset[] = [
  { kind: 'aisle', label: 'Aisle', w: 2, d: 8, h: 4, color: '#8fb8de' },
  { kind: 'produce', label: 'Fresh produce', w: 6, d: 3, h: 3, color: '#7fd1b9', groups: ['Fruit', 'Vegetables', 'Salad & greens', 'Herbs & aromatics'] },
  { kind: 'chilled', label: 'Chilled wall', w: 8, d: 1, h: 5, color: '#c9d6e2', groups: ['Milk & cream', 'Cheese', 'Yoghurt', 'Butter & spreads', 'Eggs'] },
  { kind: 'freezer', label: 'Freezers', w: 2, d: 6, h: 3, color: '#b9a0de', groups: ['Frozen veg & fruit', 'Frozen meals', 'Ice cream & desserts'] },
  { kind: 'deli', label: 'Deli counter', w: 5, d: 2, h: 3, color: '#e39a8f', groups: ['Deli meats'] },
  { kind: 'checkout', label: 'Checkout', w: 2, d: 3, h: 2, color: '#e8c170' },
  { kind: 'entrance', label: 'Entrance', w: 4, d: 1, h: 1, color: '#a4a4a4' },
  { kind: 'wall', label: 'Wall', w: 8, d: 1, h: 8, color: '#6c7a89' },
];

export const presetsFor = (kind: LayoutKind): Preset[] => (kind === 'pantry' ? KITCHEN_PRESETS : STORE_PRESETS);

/** Walls and doorways hold nothing; everything else can hold items (kitchen) or groups (shop). */
export const holdsThings = (kind: string): boolean => kind !== 'wall' && kind !== 'entrance';

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

/** Whether `b` fits inside the floor without sitting on any other block. */
export function canPlace(blocks: Block[], b: Block, size: number): boolean {
  const f = footprint(b);
  if (b.x < 0 || b.y < 0 || b.x + f.w > size || b.y + f.d > size) return false;
  return !blocks.some((o) => o.id !== b.id && overlaps(o, b));
}

/** The first free spot (scanning row by row) where a box of this size fits, or null when the floor is full. */
export function freeSpot(blocks: Block[], w: number, d: number, size: number, rot: Block['rot'] = 0): { x: number; y: number } | null {
  const probe: Block = { id: '', kind: '', x: 0, y: 0, w, d, h: 1, rot, label: '', color: '' };
  const f = footprint(probe);
  for (let y = 0; y + f.d <= size; y++) for (let x = 0; x + f.w <= size; x++) if (canPlace(blocks, { ...probe, x, y }, size)) return { x, y };
  return null;
}

/** "Cupboard" -> "Cupboard 2" when the name is taken, so every place name is unique. */
export function uniqueLabel(blocks: Block[], label: string, exceptId?: string): string {
  const taken = new Set(blocks.filter((b) => b.id !== exceptId).map((b) => b.label.trim().toLowerCase()));
  if (!taken.has(label.trim().toLowerCase())) return label;
  const base = label.replace(/\s+\d+$/, '');
  for (let n = 2; n < 100; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
  return label;
}

/** A new block from a preset, in the first free spot, or null when there is no room. */
export function blockFromPreset(blocks: Block[], p: Preset, size: number): Block | null {
  const spot = freeSpot(blocks, p.w, p.d, size);
  if (!spot) return null;
  const b: Block = { id: newId(), kind: p.kind, ...spot, w: p.w, d: p.d, h: p.h, rot: 0, label: uniqueLabel(blocks, p.label), color: p.color };
  if (p.groups) b.groups = [...p.groups];
  return b;
}

/** A copy next to the original (or in any free spot). */
export function duplicateBlock(blocks: Block[], src: Block, size: number): Block | null {
  const spot = freeSpot(blocks, footprint(src).w, footprint(src).d, size, src.rot);
  if (!spot) return null;
  const { walk: _walk, ...rest } = src;
  const copy: Block = { ...rest, id: newId(), ...spot, label: uniqueLabel(blocks, src.label) };
  if (src.groups) copy.groups = [...src.groups];
  return copy;
}

/** The kitchen offered to someone with an empty plan: the places the pantry already knows. */
export function starterKitchen(): Layout {
  const at = (kind: string, x: number, y: number, rot: Block['rot'] = 0): Block => {
    const p = KITCHEN_PRESETS.find((q) => q.kind === kind)!;
    return { id: newId(), kind, x, y, w: p.w, d: p.d, h: p.h, rot, label: p.label, color: p.color };
  };
  return { blocks: [at('wall', 5, 0), at('fridge', 0, 0), at('freezer', 11, 0), at('shelf', 0, 5, 90), at('cupboard', 4, 1), at('bench', 4, 3), at('island', 5, 8)] };
}

/** The place name of a block: its explicit place, else its label. Null for walls and doorways. */
export const placeOf = (b: Block): string | null => (holdsThings(b.kind) ? (b.place?.trim() || b.label.trim() || null) : null);

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
    if (typeof r.place === 'string' && r.place.trim()) b = { ...b, place: r.place.trim().slice(0, MAX_LABEL) };
    if (Array.isArray(r.groups)) b = { ...b, groups: [...new Set(r.groups.filter((g): g is string => typeof g === 'string' && GROUPS.includes(g)))] };
    if (typeof r.walk === 'number' && Number.isFinite(r.walk)) b = { ...b, walk: clampInt(r.walk, 1, MAX_BLOCKS) };
    blocks.push(b);
  }
  return { blocks };
}
