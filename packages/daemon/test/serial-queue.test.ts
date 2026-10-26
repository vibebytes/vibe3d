import type { AppError } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { SerialQueue } from '../src/render/serial-queue';

const gate = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('SerialQueue 深度上限', () => {
  it('在队超过上限时立即拒绝 E_RENDER_UNAVAILABLE(queue_full)', async () => {
    const q = new SerialQueue(3);
    const gates = [gate(), gate(), gate()];
    let seq = 0;
    const jobs = gates.map((g) =>
      q.run(async () => {
        await g.promise;
        return seq++;
      }),
    );
    let caught: unknown;
    try {
      await q.run(async () => 'never');
    } catch (e) {
      caught = e;
    }
    const err = caught as AppError;
    expect(err.code).toBe('E_RENDER_UNAVAILABLE');
    expect(err.data).toMatchObject({ reason: 'queue_full', depth: 3, limit: 3 });
    expect(err.retryable).toBe(true);
    for (const g of gates) g.resolve();
    expect(await Promise.all(jobs)).toEqual([0, 1, 2]);
    await expect(q.run(async () => 'ok')).resolves.toBe('ok');
  });

  it('任务失败也释放名额', async () => {
    const q = new SerialQueue(1);
    await expect(
      q.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(q.run(async () => 'ok')).resolves.toBe('ok');
  });

  it('不同 key 的队列互不影响', async () => {
    const q = new SerialQueue(1);
    const a = gate();
    const p1 = q.run(async () => {
      await a.promise;
      return 'a1';
    }, 'a');
    await expect(q.run(async () => 'b', 'b')).resolves.toBe('b');
    a.resolve();
    await expect(p1).resolves.toBe('a1');
  });
});
