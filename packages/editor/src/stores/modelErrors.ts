import { create } from 'zustand';

export interface ModelLoadError {
  nodeId: string;
  sha: string;
  message: string;
}

interface ModelErrorsState {
  errors: Record<string, ModelLoadError>;
  retries: Record<string, number>;
  report(nodeId: string, sha: string, message: string): void;
  clear(nodeId: string): void;
  retry(nodeId: string): void;
  reset(): void;
}

export const useModelErrors = create<ModelErrorsState>((set) => ({
  errors: {},
  retries: {},

  report(nodeId, sha, message) {
    set((s) => ({ errors: { ...s.errors, [nodeId]: { nodeId, sha, message } } }));
  },

  clear(nodeId) {
    set((s) => {
      if (!(nodeId in s.errors)) return s;
      const errors = { ...s.errors };
      delete errors[nodeId];
      return { errors };
    });
  },

  retry(nodeId) {
    set((s) => ({ retries: { ...s.retries, [nodeId]: (s.retries[nodeId] ?? 0) + 1 } }));
  },

  reset() {
    set({ errors: {}, retries: {} });
  },
}));
