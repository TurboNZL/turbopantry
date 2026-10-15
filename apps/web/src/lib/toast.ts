import { create } from 'zustand';

export interface Toast { id: number; text: string; undo?: () => void | Promise<void> }
let next = 1;
export const useToasts = create<{ toasts: Toast[]; push(text: string, undo?: Toast['undo']): void; dismiss(id: number): void }>((set, get) => ({
  toasts: [],
  push(text, undo) {
    const id = next++;
    set({ toasts: [...get().toasts.slice(-1), { id, text, undo }] });
    setTimeout(() => get().dismiss(id), undo ? 8000 : 3500); // an undo stays long enough to be hit with a thumb
  },
  dismiss(id) { set({ toasts: get().toasts.filter((t) => t.id !== id) }); },
}));
export const toast = (text: string, undo?: Toast['undo']) => useToasts.getState().push(text, undo);
