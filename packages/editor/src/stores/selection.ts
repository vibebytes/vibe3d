import { create } from 'zustand';

interface SelectionStore {
  ids: string[];
  primary: string | null;
  hoverId: string | null;
  anchorId: string | null;
  select(id: string | null, opts?: { additive?: boolean }): void;
  set(ids: string[]): void;
  hover(id: string | null): void;
  reset(): void;
}

const last = (ids: string[]): string | null => ids[ids.length - 1] ?? null;

export const useSelection = create<SelectionStore>((set, get) => ({
  ids: [],
  primary: null,
  hoverId: null,
  anchorId: null,

  select(id, opts) {
    if (!id) {
      set({ ids: [], primary: null, anchorId: null });
      return;
    }
    const prev = get().ids;
    if (opts?.additive) {
      const ids = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      set({ ids, primary: last(ids), anchorId: id });
      return;
    }
    set({ ids: [id], primary: id, anchorId: id });
  },

  set(ids) {
    set({ ids, primary: last(ids), anchorId: last(ids) });
  },

  hover(id) {
    set({ hoverId: id });
  },

  reset() {
    set({ ids: [], primary: null, hoverId: null, anchorId: null });
  },
}));

export const selectedIds = (): string[] => useSelection.getState().ids;
