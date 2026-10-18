import { formatQuantity, unitLabel } from './ingredient.ts';
import type { Ingredient } from './recipe.ts';

export type Dimension = 'mass' | 'volume' | 'count';
export type UnitMode = 'original' | 'metric-cups' | 'metric-grams';

// grams and millilitres per unit. The cup is the 250 ml metric cup (NZ and Australia), the tablespoon 15 ml (NZ), not the US ones.
const MASS_G: Record<string, number> = { mg: 0.001, g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
const VOL_ML: Record<string, number> = { ml: 1, l: 1000, tsp: 5, tbsp: 15, cup: 250, 'fl oz': 29.5735, pint: 473.176, quart: 946.353, gallon: 3785.41 };
export const CUP_ML = 250;

export function dimensionOf(unit: string | null): Dimension {
  if (unit && unit in MASS_G) return 'mass';
  if (unit && unit in VOL_ML) return 'volume';
  return 'count';
}

/**
 * Grams per metric cup for foods people weigh. Only those with figures that agree across sources (plain flour 125, caster sugar 220,
 * butter 250, rolled oats 90); everything else is left alone rather than guessed. A pantry item can carry its own figure (gramsPerCup).
 */
const GRAMS_PER_CUP: { words: string[]; g: number }[] = [
  { words: ['flour'], g: 125 },
  { words: ['caster', 'sugar'], g: 220 },
  { words: ['white', 'sugar'], g: 220 },
  { words: ['sugar'], g: 220 },
  { words: ['butter'], g: 250 },
  { words: ['rolled', 'oats'], g: 90 },
  { words: ['oats'], g: 90 },
];
export function gramsPerCupFor(name: string, override?: number | null): number | null {
  if (override && override > 0) return override;
  const w = name.toLowerCase().split(/[^a-z]+/);
  for (const row of GRAMS_PER_CUP) if (row.words.every((x) => w.includes(x))) return row.g;
  return null;
}

/**
 * Converts an amount between units. Inside one kind it is exact (g <-> kg <-> oz, ml <-> cup <-> tsp). Weight <-> volume only when the
 * food's grams-per-cup is known. Counts (eggs, cloves, cans) only match the same word, or a bare count. Otherwise null: "cannot tell".
 */
export function convertAmount(qty: number, from: string | null, to: string | null, gramsPerCup: number | null = null): number | null {
  if (from === to) return qty;
  const a = dimensionOf(from), b = dimensionOf(to);
  if (a === 'count' || b === 'count') return null;
  if (a === b) return a === 'mass' ? (qty * MASS_G[from!]!) / MASS_G[to!]! : (qty * VOL_ML[from!]!) / VOL_ML[to!]!;
  if (!gramsPerCup) return null;
  const gPerMl = gramsPerCup / CUP_ML;
  if (a === 'volume') return (qty * VOL_ML[from!]! * gPerMl) / MASS_G[to!]!;
  return (qty * MASS_G[from!]!) / gPerMl / VOL_ML[to!]!;
}

/** Kitchen rounding of a converted amount: whole numbers under 20, steps of 5 under 200, then of 25 (453.6 g is 450 g, 227 g is 225 g). */
export function roundNice(n: number): number {
  if (n < 20) return Math.round(n);
  if (n < 200) return Math.round(n / 5) * 5;
  return Math.round(n / 25) * 25;
}

const trim = (n: number) => String(Math.round(n * 100) / 100);
function metricMass(g: number): string { return g >= 1000 ? `${trim(g / 1000)} kg` : `${roundNice(g)} g`; }
function metricVolume(ml: number): string { return ml >= 1000 ? `${trim(ml / 1000)} l` : `${roundNice(ml)} ml`; }

/**
 * The amount of an ingredient line for a display mode:
 *  original      as written
 *  metric-cups   ounces, pounds and fluid ounces/pints become g, kg, ml, l; cups, tablespoons and teaspoons stay
 *  metric-grams  the same, and a cup (a quarter cup or more) of a food people weigh (flour, sugar, butter, oats) becomes grams;
 *                tablespoons and teaspoons stay, as do cups of anything without a known weight
 */
export function displayAmount(i: Ingredient, factor = 1, mode: UnitMode = 'original', gramsPerCup: number | null = null): { amount: string; converted: boolean } {
  if (i.quantity === null) return { amount: '', converted: false };
  const lo = i.quantity * factor, hi = i.quantityMax === null ? null : i.quantityMax * factor;
  const orig = () => ({ amount: [formatQuantity(lo) + (hi !== null ? `–${formatQuantity(hi)}` : ''), unitLabel(i.unit, hi ?? lo)].filter(Boolean).join(' '), converted: false });
  if (mode === 'original' || !i.unit) return orig();

  const dim = dimensionOf(i.unit);
  let to: 'g' | 'ml' | null = null;
  if (dim === 'mass' && i.unit !== 'g' && i.unit !== 'kg' && i.unit !== 'mg') to = 'g';
  else if (dim === 'volume' && ['fl oz', 'pint', 'quart', 'gallon'].includes(i.unit)) to = 'ml';
  const grams = mode === 'metric-grams' && i.unit === 'cup' && lo >= 0.25 ? gramsPerCupFor(i.name, gramsPerCup) : null;
  if (grams) to = 'g';
  if (!to) return orig();

  const conv = (n: number) => (grams ? n * grams : convertAmount(n, i.unit, to)!);
  const fmt = (n: number) => (to === 'g' ? metricMass(conv(n)) : metricVolume(conv(n)));
  if (hi === null) return { amount: fmt(lo), converted: true };
  const a = fmt(lo), b = fmt(hi), au = a.split(' ').pop(), bu = b.split(' ').pop();
  return { amount: au === bu ? `${a.slice(0, a.lastIndexOf(' '))}–${b}` : `${a}–${b}`, converted: true };
}

export const UNIT_MODES: { id: UnitMode; label: string }[] = [
  { id: 'original', label: 'As written' },
  { id: 'metric-cups', label: 'Metric + cups' },
  { id: 'metric-grams', label: 'Metric + grams' },
];
