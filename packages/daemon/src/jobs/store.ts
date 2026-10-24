import { randomUUID } from 'node:crypto';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export type JobKind = 'export.glb';
export type JobState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface JobResult {
  url: string;
  bytes: number;
  revision: number;
}

export interface JobError {
  code: string;
  message: string;
}

export interface JobRecord {
  id: string;
  kind: JobKind;
  roomId: string;
  state: JobState;
  progress: number;
  phase?: string;
  result?: JobResult;
  error?: JobError;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  expiresAt: number;
  cancelRequested: boolean;
}

export interface JobView {
  jobId: string;
  kind: JobKind;
  roomId: string;
  state: JobState;
  pct: number;
  phase?: string;
  url?: string;
  bytes?: number;
  revision?: number;
  error?: JobError;
  createdAt: string;
  expiresAt: string;
}

export const JOB_TTL_MS = 3_600_000;
export const EXPORT_TTL_MS = 600_000;

export function toView(job: JobRecord): JobView {
  return {
    jobId: job.id,
    kind: job.kind,
    roomId: job.roomId,
    state: job.state,
    pct: Math.round(job.progress * 1000) / 1000,
    ...(job.phase === undefined ? {} : { phase: job.phase }),
    ...(job.result ? { url: job.result.url, bytes: job.result.bytes, revision: job.result.revision } : {}),
    ...(job.error ? { error: job.error } : {}),
    createdAt: new Date(job.createdAt).toISOString(),
    expiresAt: new Date(job.expiresAt).toISOString(),
  };
}

export class JobStore {
  private readonly jobs = new Map<string, JobRecord>();

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly ttlMs = JOB_TTL_MS,
  ) {}

  create(kind: JobKind, roomId: string): JobRecord {
    const at = this.now();
    const job: JobRecord = {
      id: randomUUID().replace(/-/g, ''),
      kind,
      roomId,
      state: 'queued',
      progress: 0,
      createdAt: at,
      expiresAt: at + this.ttlMs,
      cancelRequested: false,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }

  list(roomId?: string): JobRecord[] {
    const all = [...this.jobs.values()].filter((job) => !roomId || job.roomId === roomId);
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }

  start(id: string): JobRecord {
    const job = this.jobs.get(id);
    if (!job || job.state !== 'queued') throw new Error(`job ${id} 不在 queued 状态`);
    job.state = 'running';
    job.startedAt = this.now();
    return job;
  }

  report(id: string, progress: number, phase?: string): JobRecord | undefined {
    const job = this.jobs.get(id);
    if (!job || job.state !== 'running') return undefined;
    job.progress = Math.min(1, Math.max(0, progress));
    if (phase !== undefined) job.phase = phase;
    return job;
  }

  done(id: string, result: JobResult): JobRecord | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    if (job.cancelRequested) return this.cancel(id);
    job.state = 'done';
    job.progress = 1;
    job.result = result;
    job.finishedAt = this.now();
    job.expiresAt = job.finishedAt + this.ttlMs;
    return job;
  }

  fail(id: string, error: JobError): JobRecord | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    if (job.cancelRequested) return this.cancel(id);
    job.state = 'failed';
    job.error = error;
    job.finishedAt = this.now();
    job.expiresAt = job.finishedAt + this.ttlMs;
    return job;
  }

  cancel(id: string): JobRecord | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    if (job.state === 'done' || job.state === 'failed' || job.state === 'cancelled') return job;
    job.cancelRequested = true;
    job.state = 'cancelled';
    job.finishedAt = this.now();
    job.expiresAt = job.finishedAt + this.ttlMs;
    return job;
  }

  sweep(): string[] {
    const at = this.now();
    const removed: string[] = [];
    for (const [id, job] of this.jobs) {
      if (job.expiresAt <= at) {
        this.jobs.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }
}

export async function sweepExports(
  dir: string,
  ttlMs = EXPORT_TTL_MS,
  now: () => number = () => Date.now(),
): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const at = now();
  const removed: string[] = [];
  for (const name of names) {
    if (!name.endsWith('.glb')) continue;
    const path = join(dir, name);
    try {
      const info = await stat(path);
      if (at - info.mtimeMs >= ttlMs) {
        await unlink(path);
        removed.push(name);
      }
    } catch {
      // already gone or unreadable
    }
  }
  return removed;
}
