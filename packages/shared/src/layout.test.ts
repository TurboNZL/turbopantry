import { describe, expect, it } from 'vitest';
import { GROUPS } from './items.ts';
import { KITCHEN_PRESETS, STORE_PRESETS, blockFromPreset, canPlace, clampBlock, duplicateBlock, footprint, freeSpot, placeOf, sanitizeLayout, snap, starterKitchen, uniqueLabel, walkOrder, type Block } from './layout.ts';

const blk = (o: Partial<Block> = {}): Block => ({ id: 'a', kind: 'bench', x: 0, y: 0, w: 2, d: 3, h: 2, rot: 0, label: 'Bench', color: '#c9d6e2', ...o });

describe('layout geometry', () => {
  it('swaps width and depth when turned', () => {
    expect(footprint(blk({ rot: 90 }))).toEqual({ w: 3, d: 2 });
    expect(footprint(blk({ rot: 180 }))).toEqual({ w: 2, d: 3 });
  });
  it('snaps to whole cells', () => { expect(snap(2.4)).toBe(2); expect(snap(2.6)).toBe(3); expect(snap(-0.4)).toBe(-0); });
  it('clamps sizes and pulls the box back onto the floor', () => {
    const c = clampBlock(blk({ x: 99, y: -4, w: 50, d: 0, h: 99, rot: 90 }), 16);
    expect(c.w).toBe(16); expect(c.d).toBe(1); expect(c.h).toBe(12);
    expect(c.x).toBe(15); expect(c.y).toBe(0); // turned: footprint is 1 wide, 16 deep
  });
  it('refuses overlaps and leaving the floor, but not touching edges', () => {
    const a = blk(), b = blk({ id: 'b', x: 2, y: 0 });
    expect(canPlace([a], b, 16)).toBe(true);
    expect(canPlace([a], blk({ id: 'b', x: 1, y: 1 }), 16)).toBe(false);
    expect(canPlace([], blk({ x: 15 }), 16)).toBe(false);
    expect(canPlace([a], { ...a, x: 1 }, 16)).toBe(true); // itself is ignored
  });
  it('finds a free spot and reports a full floor', () => {
    expect(freeSpot([blk()], 2, 2, 16)).toEqual({ x: 2, y: 0 });
    expect(freeSpot([blk({ w: 4, d: 4 })], 4, 4, 4)).toBeNull();
  });
  it('can look for the free spot nearest a point', () => {
    expect(freeSpot([], 2, 2, 16, 0, { x: 8, y: 8 })).toEqual({ x: 7, y: 7 });
    expect(freeSpot([blk({ x: 7, y: 7, w: 2, d: 2 })], 2, 2, 16, 0, { x: 8, y: 8 })).not.toEqual({ x: 7, y: 7 });
  });
  it('places presets without overlap, numbers repeated names, and duplicates', () => {
    let blocks: Block[] = [];
    for (let i = 0; i < 3; i++) { const b = blockFromPreset(blocks, KITCHEN_PRESETS.find((p) => p.kind === 'cupboard')!, 16)!; blocks = [...blocks, b]; }
    expect(blocks.map((b) => b.label)).toEqual(['Cupboard', 'Cupboard 2', 'Cupboard 3']);
    expect(new Set(blocks.map((b) => `${b.x},${b.y}`)).size).toBe(3);
    const copy = duplicateBlock(blocks, blocks[0]!, 16)!;
    expect(copy.id).not.toBe(blocks[0]!.id); expect(copy.label).toBe('Cupboard 4'); expect(canPlace(blocks, copy, 16)).toBe(true);
    expect(uniqueLabel([blk()], 'bench')).toBe('bench 2');
  });
  it('the starter kitchen has no overlaps and its places match the pantry places', () => {
    const { blocks } = starterKitchen();
    for (const b of blocks) expect(canPlace(blocks, b, 16)).toBe(true);
    expect(blocks.map(placeOf).filter(Boolean)).toEqual(expect.arrayContaining(['Fridge', 'Freezer', 'Pantry', 'Cupboard']));
    expect(placeOf(blocks.find((b) => b.kind === 'wall')!)).toBeNull();
  });
  it('a place name is the explicit place, else the label', () => {
    expect(placeOf(blk({ place: 'Back bench' }))).toBe('Back bench');
    expect(placeOf(blk({ label: ' Bench ' }))).toBe('Bench');
  });
});

it('every preset group is a real shopping group', () => { for (const p of STORE_PRESETS) for (const g of p.groups ?? []) expect(GROUPS).toContain(g); });

describe('walking order', () => {
  it('lists the groups of the numbered blocks first, then the rest', () => {
    const blocks = [blk({ id: 'a', walk: 2, groups: ['Milk & cream'] }), blk({ id: 'b', walk: 1, groups: ['Fruit', 'Vegetables'] }), blk({ id: 'c', groups: ['Bread'] })];
    const o = walkOrder(blocks);
    expect(o.slice(0, 3)).toEqual(['Fruit', 'Vegetables', 'Milk & cream']);
    expect(o.length).toBe(GROUPS.length); expect(new Set(o).size).toBe(GROUPS.length);
  });
  it('keeps the previous order for what nobody claimed', () => {
    const o = walkOrder([blk({ walk: 1, groups: ['Milk & cream'] })], ['Bread', 'Milk & cream', 'Eggs']);
    expect(o.slice(0, 3)).toEqual(['Milk & cream', 'Bread', 'Eggs']);
  });
});

describe('sanitizeLayout', () => {
  it('cleans a plan: bounded numbers, trimmed text, known keys only', () => {
    const r = sanitizeLayout({ blocks: [{ id: 'x1', kind: 'Fridge!', x: -5, y: 3.4, w: 99, d: 2, h: 0, rot: 450, label: '  Big fridge  ', color: 'red', place: ' Fridge ', groups: ['Milk & cream', 'Nope', 'Milk & cream'], walk: 3, evil: 1 }] }, 'store');
    expect(r).toEqual({ blocks: [{ id: 'x1', kind: 'block', x: 0, y: 0, w: 24, d: 2, h: 1, rot: 90, label: 'Big fridge', color: '#c9d6e2', place: 'Fridge', groups: ['Milk & cream'], walk: 3 }] });
  });
  it('rejects bad shapes, duplicate ids and too many blocks', () => {
    expect(typeof sanitizeLayout(null, 'pantry')).toBe('string');
    expect(typeof sanitizeLayout({ blocks: [{ id: 'a' }, { id: 'a' }] }, 'pantry')).toBe('string');
    expect(typeof sanitizeLayout({ blocks: [{ id: '' }] }, 'pantry')).toBe('string');
    expect(typeof sanitizeLayout({ blocks: Array.from({ length: 81 }, (_, i) => ({ id: `b${i}` })) }, 'pantry')).toBe('string');
    expect(sanitizeLayout({ blocks: Array.from({ length: 80 }, (_, i) => ({ id: `b${i}` })) }, 'pantry')).toMatchObject({ blocks: expect.any(Array) });
  });
});
