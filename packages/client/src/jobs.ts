import { Vibe3DError } from './errors';
import type { CapResult } from './room';
import type { Transport } from './transport';

export type JobView = CapResult<'job.get'>;

export interface WaitOptions {
  timeoutMs?: number;
  pollMs?: number;
  onProgress?: (job: JobView) => void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class JobHandle {
  readonly id: string;
  private readonly client: Transport;

  constructor(client: Transport, id: string) {
    this.client = client;
    this.id = id;
  }

  get(): Promise<JobView> {
    return this.client.call<JobView>('job.get', { jobId: this.id });
  }

  cancel(): Promise<JobView> {
    return this.client.call<JobView>('job.cancel', { jobId: this.id });
  }

  async wait(opts: WaitOptions = {}): Promise<JobView> {
    const timeoutMs = opts.timeoutMs ?? 600_000;
    const pollMs = opts.pollMs ?? 1_000;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const job = await this.get();
      opts.onProgress?.(job);
      if (job.state === 'done') return job;
      if (job.state === 'failed') {
        throw new Vibe3DError(
          (job.error?.code as Vibe3DError['code']) ?? 'E_INTERNAL',
          job.error?.message ?? '导出任务失败',
          job,
        );
      }
      if (job.state === 'cancelled') throw new Vibe3DError('E_INTERNAL', '导出任务已取消', job);
      if (Date.now() >= deadline) {
        throw new Vibe3DError('E_TIMEOUT', `任务 ${this.id} 等待超时（${timeoutMs} ms）`, job);
      }
      await sleep(pollMs);
    }
  }
}
