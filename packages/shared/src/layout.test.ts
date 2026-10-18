import { describe, expect, it } from 'vitest';
import { GROUPS } from './items.ts';
import { FLOOR, MAX_STACK, canPlace, clampBlock, duplicateBlock, footprint, freeSpot, newBlock, placeOf, sanitizeLayout, settle, snap, starterKitchen, uniqueLabel, walkOrder, type Block } from './layout.ts';

const blk = (o: Partial<Block> = {}): Block => ({ id: 'a', kind: 'block', x: 0, y: 0, w: 2, d: 3, h: 2, rot: 0, label: 'Bench', color: '#c9d6e2', ...o });

describe('layout geometry', () => {
  it('swaps width and depth when turned', () => {
    expect(footprint(blk({ rot: 90 }))).toEqual({ w: 3, d: 2 });
    expect(footprint(blk({ rot: 180 }))).toEqual({ w: 2, d: 3 });
  });
  it('snaps to whole cells', () => { expect(snap(2.4)).toBe(2); expect(snap(2.6)).toBe(3); expect(snap(-0.4)).toBe(-0); });
  it('clamps sizes and pulls the box back onto the floor', () => {
    const c = clampBlock(blk({ x: 99, y: -4, w: 99, d: 0, h: 99, rot: 90 }), 16);
    expect(c.w).toBe(16); expect(c.d).toBe(1); expect(c.h).toBe(12);
    expect(c.x).toBe(15); expect(c.y).toBe(0); // turned: footprint is 1 wide, 16 deep
  });
  it('a shop floor is much bigger than a kitchen', () => { expect(FLOOR.store).toBeGreaterThan(FLOOR.pantry); expect(FLOOR.store).toBeGreaterThanOrEqual(64); });
  it('blocks stack: one dropped on another rests on top of it, and falls when the one below goes', () => {
    const a = blk({ id: 'a', h: 3 }), b = blk({ id: 'b', x: 1, y: 1, h: 2 });
    const s = settle([a, b], 'b');
    expect(s.find((x) => x.id === 'b')!.z).toBe(3);
    expect(settle([a, b]).map((x) => x.z)).toEqual([0, 3]);
    expect(settle([s[1]!])[0]!.z).toBe(0);                         // the one below was removed
    expect(settle([a, blk({ id: 'c', x: 5 })]).map((x) => x.z)).toEqual([0, 0]); // apart: both on the floor
  });
  it('allows stacking, refuses leaving the floor and stacks that are too high', () => {
    const a = blk({ h: 12 });
    expect(canPlace([a], blk({ id: 'b', x: 1, y: 1 }), 16)).toBe(true);
    expect(canPlace([], blk({ x: 15 }), 16)).toBe(false);
    expect(canPlace([a, blk({ id: 'b', h: 12 })], blk({ id: 'c', h: 3 }), 16)).toBe(false);
    expect(MAX_STACK).toBe(24);
  });
  it('finds a free floor spot and reports a full floor', () => {
    expect(freeSpot([blk()], 2, 2, 16)).toEqual({ x: 2, y: 0 });
    expect(freeSpot([blk({ w: 4, d: 4 })], 4, 4, 4)).toBeNull();
    expect(freeSpot([], 2, 2, 16, 0, { x: 8, y: 8 })).toEqual({ x: 7, y: 7 });
  });
  it('makes one kind of block, named or not, numbers repeated names, and duplicates', () => {
    let blocks: Block[] = [];
    for (const n of ['Cupboard', 'Cupboard', 'cupboard', '']) blocks = [...blocks, newBlock(blocks, n, 16)!];
    expect(blocks.map((b) => b.label)).toEqual(['Cupboard', 'Cupboard 2', 'cupboard 3', '']);
    expect(blocks.every((b) => b.kind === 'block')).toBe(true);
    expect(new Set(blocks.map((b) => `${b.x},${b.y}`)).size).toBe(4);
    const copy = duplicateBlock(blocks, blocks[0]!, 16)!;
    expect(copy.id).not.toBe(blocks[0]!.id); expect(copy.label).toBe('Cupboard 4');
    expect(uniqueLabel([blk()], 'bench')).toBe('bench 2');
  });
  it('the starter kitchen is made of named blocks, so every one is a place', () => {
    const { blocks } = starterKitchen();
    expect(blocks.map(placeOf)).toEqual(expect.arrayContaining(['Fridge', 'Freezer', 'Pantry', 'Cupboard']));
    for (const b of blocks) expect(canPlace(blocks, b, 24)).toBe(true);
  });
  it('a place name is the explicit place, else the label; a block with no name is not a place', () => {
    expect(placeOf(blk({ place: 'Back bench' }))).toBe('Back bench');
    expect(placeOf(blk({ label: ' Bench ' }))).toBe('Bench');
    expect(placeOf(blk({ label: '' }))).toBeNull();
  });
});

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
    expect(r).toEqual({ blocks: [{ id: 'x1', kind: 'block', x: 0, y: 0, w: 64, d: 2, h: 1, rot: 90, label: 'Big fridge', color: '#c9d6e2', z: 0, place: 'Fridge', groups: ['Milk & cream'], walk: 3 }] });
  });
  it('rejects bad shapes, duplicate ids and too many blocks', () => {
    expect(typeof sanitizeLayout(null, 'pantry')).toBe('string');
    expect(typeof sanitizeLayout({ blocks: [{ id: 'a' }, { id: 'a' }] }, 'pantry')).toBe('string');
    expect(typeof sanitizeLayout({ blocks: [{ id: '' }] }, 'pantry')).toBe('string');
    expect(typeof sanitizeLayout({ blocks: Array.from({ length: 121 }, (_, i) => ({ id: `b${i}` })) }, 'pantry')).toBe('string');
    expect(sanitizeLayout({ blocks: Array.from({ length: 120 }, (_, i) => ({ id: `b${i}` })) }, 'pantry')).toMatchObject({ blocks: expect.any(Array) });
  });
});
