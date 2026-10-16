import type { Item, ListEntry, Store } from '@turbopantry/shared';

export interface Kitchen3DProps {
  /** Every pantry item (tracked ones are drawn). */
  items: Item[];
  /** Set an item's amount (the pantry's own stock change). */
  onChange(item: Item, qty: number): void;
  /** Mark an item as out (the pantry's own "mark as out", with its Undo). */
  onOut(item: Item): void;
  /** Put an item on the shopping list. */
  onList(item: Item): void;
}

export interface StoreMap3DProps {
  store: Store;
  /** The shopping list lines (ticked ones are ignored). */
  entries: ListEntry[];
  items: Item[];
}
