import { AppError } from '@vibebyte/vibe3d-protocol';
import type { JobRecord, JobResult, JobStore } from './store';

export interface JobHooks {
  progress?: (job: JobRecord) => void;
  done?: (job: JobRecord) => void;
  failed?: (job: JobRecord) => void;
  cancelled?: (job: JobRecord) => void;
}

export type JobReport = (pct: number, phase?: string) => void;
export type JobRunner = (job: JobRecord, report: JobReport) => Promise<JobResult>;

interface Pending {
  job: JobRecord;
  run: JobRunner;
}

export const MAX_QUEUED = 64;
export const DEFAULT_CONCURRENCY = 2;

export class JobQueue {
  private readonly pending: Pending[] = [];
  private readonly active = new Map<string, string>();
  private readonly idleWaiters: Array<() => void> = [];

  constructor(
    private readonly store: JobStore,
    private readonly hooks: JobHooks = {},
    private readonly limit = MAX_QUEUED,
    private readonly concurrency = DEFAULT_CONCURRENCY,
  ) {}

  get depth(): number {
    return this.pending.length;
  }

  get running(): string | undefined {
    return this.active.keys().next().value;
  }

  get runningCount(): number {
    return this.active.size;
  }

  enqueue(job: JobRecord, run: JobRunner): JobRecord {
    if (this.pending.length + this.active.size >= this.limit) {
      throw new AppError('E_BUSY', `任务队列已满（上限 ${this.limit}），请稍后重试`);
    }
    this.pending.push({ job, run });
    this.pump();
    return job;
  }

  cancel(jobId: string): JobRecord | undefined {
    const index = this.pending.findIndex((item) => item.job.id === jobId);
    if (index !== -1) {
      this.pending.splice(index, 1);
      const job = this.store.cancel(jobId);
      this.settle();
      return job;
    }
    const job = this.store.get(jobId);
    if (!job) return undefined;
    return this.store.cancel(jobId);
  }

  idle(): Promise<void> {
    if (this.active.size === 0 && this.pending.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private pump(): void {
    while (this.active.size < this.concurrency) {
      const index = this.pending.findIndex((item) => !this.busyRooms().has(item.job.roomId));
      if (index === -1) break;
      const [next] = this.pending.splice(index, 1);
      if (next) this.dispatch(next);
    }
    if (this.active.size === 0) this.settle();
  }

  private busyRooms(): Set<string> {
    return new Set(this.active.values());
  }

  private dispatch(next: Pending): void {
    const job = this.store.start(next.job.id);
    this.active.set(job.id, job.roomId);
    const record = this.store.get(job.id) ?? job;
    const report: JobReport = (pct, phase) => {
      const live = this.store.report(job.id, pct, phase);
      if (live) this.hooks.progress?.(live);
    };
    void next
      .run(record, report)
      .then((result) => {
        this.active.delete(job.id);
        const finished = this.store.done(job.id, result);
        if (finished?.state === 'done') this.hooks.done?.(finished);
        else if (finished?.state === 'cancelled') this.hooks.cancelled?.(finished);
        this.pump();
      })
      .catch((err: unknown) => {
        this.active.delete(job.id);
        const known = err instanceof AppError;
        const finished = this.store.fail(job.id, {
          code: known ? err.code : 'E_INTERNAL',
          message: err instanceof Error ? err.message : String(err),
        });
        if (finished?.state === 'failed') this.hooks.failed?.(finished);
        else if (finished?.state === 'cancelled') this.hooks.cancelled?.(finished);
        this.pump();
      });
  }

  private settle(): void {
    if (this.active.size > 0 || this.pending.length > 0) return;
    while (this.idleWaiters.length > 0) this.idleWaiters.shift()?.();
  }
}
