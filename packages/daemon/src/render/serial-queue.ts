import { AppError } from '@vibebyte/vibe3d-protocol';

export class SerialQueue {
  private chains = new Map<string, Promise<unknown>>();
  private depths = new Map<string, number>();

  constructor(private readonly limit: number) {}

  run<T>(task: () => Promise<T>, key = ''): Promise<T> {
    const depth = this.depths.get(key) ?? 0;
    if (depth >= this.limit) {
      throw new AppError('E_RENDER_UNAVAILABLE', `渲染队列已满（${depth} 个在队），稍后重试`, {
        reason: 'queue_full',
        depth,
        limit: this.limit,
      });
    }
    this.depths.set(key, depth + 1);
    const prev = this.chains.get(key) ?? Promise.resolve();
    const run = prev.then(task, task);
    const tail = run.catch(() => undefined);
    this.chains.set(key, tail);
    void tail.then(() => {
      this.depths.set(key, Math.max(0, (this.depths.get(key) ?? 1) - 1));
      if (this.chains.get(key) === tail) this.chains.delete(key);
    });
    return run;
  }
}
