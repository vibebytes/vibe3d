import { create } from 'zustand';

export type ConnStatus = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline';

interface ConnStore {
  status: ConnStatus;
  latency: number | null;
  lastError: string | null;
  retries: number;
  setStatus(status: ConnStatus): void;
  online(): void;
  retry(error?: string): void;
  setLatency(ms: number): void;
  fail(error: string): void;
  reset(): void;
}

export const useConn = create<ConnStore>((set) => ({
  status: 'idle',
  latency: null,
  lastError: null,
  retries: 0,

  setStatus(status) {
    set({ status });
  },

  online() {
    set({ status: 'online', retries: 0, lastError: null });
  },

  retry(error) {
    set((s) => ({ status: 'reconnecting', retries: s.retries + 1, lastError: error ?? s.lastError }));
  },

  setLatency(ms) {
    set({ latency: ms });
  },

  fail(error) {
    set({ status: 'offline', lastError: error });
  },

  reset() {
    set({ status: 'idle', latency: null, lastError: null, retries: 0 });
  },
}));

export const backoffMs = (retries: number): number => Math.min(8000, 500 * 2 ** Math.max(0, retries - 1));
