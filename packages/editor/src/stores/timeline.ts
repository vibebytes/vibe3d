import { create } from 'zustand';
import { rpc } from '../lib/rpc';
import { useDoc } from './doc';

export interface TimelineEntry {
  revision: number;
  summary: string;
  ops: number;
  opId?: string;
  author?: string;
}

interface TimelineStore {
  entries: TimelineEntry[];
  revision: number | null;
  running: boolean;
  error: string | null;
  run(limit?: number): Promise<void>;
  undoTo(opId: string): Promise<void>;
  clear(): void;
}

export const useTimeline = create<TimelineStore>((set) => ({
  entries: [],
  revision: null,
  running: false,
  error: null,

  async run(limit = 20) {
    const roomId = useDoc.getState().roomId;
    if (!roomId) return;
    set({ running: true, error: null });
    try {
      const res = await rpc('room.timeline', { limit }, roomId);
      set({ entries: res.entries, revision: res.revision });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ running: false });
    }
  },

  async undoTo(opId) {
    const roomId = useDoc.getState().roomId;
    if (!roomId) return;
    set({ error: null });
    try {
      await rpc('scene.undo', { opId }, roomId);
      await useDoc.getState().refresh();
      await useTimeline.getState().run();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  clear() {
    set({ entries: [], revision: null, running: false, error: null });
  },
}));
