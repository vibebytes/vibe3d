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

export class JobQueue {
  private readonly pending: Pending[] = [];
  private active?: string;
  private readonly idleWaiters: Array<() => void> = [];

  constructor(
    private readonly store: JobStore,
    private readonly hooks: JobHooks = {},
    private readonly limit = MAX_QUEUED,
  ) {}

  get depth(): number {
    return this.pending.length;
  }

  get running(): string | undefined {
    return this.active;
  }

  enqueue(job: JobRecord, run: JobRunner): JobRecord {
    if (this.pending.length + (this.active ? 1 : 0) >= this.limit) {
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
    if (!this.active && this.pending.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private pump(): void {
    if (this.active) return;
    this.runNext();
  }

  private runNext(): void {
    if (this.active) return;
    const next = this.pending.shift();
    if (!next) {
      this.settle();
      return;
    }
    const job = this.store.start(next.job.id);
    this.active = job.id;
    const report: JobReport = (pct, phase) => {
      const live = this.store.report(job.id, pct, phase);
      if (live) this.hooks.progress?.(live);
    };
    void Promise.resolve()
      .then(() => next.run(job, report))
      .then((result) => {
        this.active = undefined;
        const finished = this.store.done(job.id, result);
        if (finished?.state === 'done') this.hooks.done?.(finished);
        else if (finished?.state === 'cancelled') this.hooks.cancelled?.(finished);
        this.pump();
      })
      .catch((err: unknown) => {
        this.active = undefined;
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
    if (this.active || this.pending.length > 0) return;
    while (this.idleWaiters.length > 0) this.idleWaiters.shift()?.();
  }
}
