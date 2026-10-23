import { create } from 'zustand';

export type JobKind = 'export' | 'snapshot' | 'import';
export type JobStatus = 'running' | 'done' | 'error';

export interface JobState {
  id: string;
  kind: JobKind;
  label: string;
  status: JobStatus;
  progress: number | null;
  message?: string;
  startedAt: number;
  endedAt?: number;
}

interface JobsStore {
  jobs: Record<string, JobState>;
  start(kind: JobKind, label: string): string;
  progress(id: string, value: number): void;
  finish(id: string, message?: string): void;
  fail(id: string, message: string): void;
  clear(id: string): void;
  clearFinished(): void;
}

let seq = 0;

export const useJobs = create<JobsStore>((set, get) => ({
  jobs: {},

  start(kind, label) {
    seq += 1;
    const id = `${kind}-${Date.now().toString(36)}-${seq}`;
    set({
      jobs: {
        ...get().jobs,
        [id]: { id, kind, label, status: 'running', progress: null, startedAt: Date.now() },
      },
    });
    return id;
  },

  progress(id, value) {
    const job = get().jobs[id];
    if (!job) return;
    set({ jobs: { ...get().jobs, [id]: { ...job, progress: Math.max(0, Math.min(1, value)) } } });
  },

  finish(id, message) {
    const job = get().jobs[id];
    if (!job) return;
    set({
      jobs: { ...get().jobs, [id]: { ...job, status: 'done', progress: 1, message, endedAt: Date.now() } },
    });
  },

  fail(id, message) {
    const job = get().jobs[id];
    if (!job) return;
    set({ jobs: { ...get().jobs, [id]: { ...job, status: 'error', message, endedAt: Date.now() } } });
  },

  clear(id) {
    const { [id]: _drop, ...rest } = get().jobs;
    set({ jobs: rest });
  },

  clearFinished() {
    const jobs = Object.fromEntries(Object.entries(get().jobs).filter(([, j]) => j.status === 'running'));
    set({ jobs });
  },
}));

export const activeJobs = (jobs: Record<string, JobState>): JobState[] =>
  Object.values(jobs).filter((j) => j.status === 'running');
