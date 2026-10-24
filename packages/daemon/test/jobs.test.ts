import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JobQueue } from '../src/jobs/queue';
import { EXPORT_TTL_MS, JobStore, sweepExports } from '../src/jobs/store';

function clock(start = 1_000_000) {
  let at = start;
  return {
    now: () => at,
    advance: (ms: number) => {
      at += ms;
    },
  };
}

describe('JobStore', () => {
  it('records lifecycle and expires after TTL', () => {
    const c = clock();
    const store = new JobStore(c.now);
    const job = store.create('export.glb', 'room-1');
    expect(job.state).toBe('queued');
    store.start(job.id);
    store.report(job.id, 0.5, 'pack');
    const done = store.done(job.id, { url: '/exports/a.glb', bytes: 12, revision: 3 });
    expect(done?.state).toBe('done');
    expect(done?.progress).toBe(1);
    expect(store.list('room-1')).toHaveLength(1);
    expect(store.list('room-2')).toHaveLength(0);
    c.advance(3_600_001);
    expect(store.sweep()).toEqual([job.id]);
    expect(store.get(job.id)).toBeUndefined();
  });

  it('cancel on a running job defers to completion', () => {
    const store = new JobStore();
    const job = store.create('export.glb', 'room-1');
    store.start(job.id);
    expect(store.cancel(job.id)?.cancelRequested).toBe(true);
    expect(store.get(job.id)?.state).toBe('cancelled');
    const after = store.done(job.id, { url: 'u', bytes: 1, revision: 1 });
    expect(after?.state).toBe('cancelled');
    expect(after?.result).toBeUndefined();
  });

  it('sweepExports deletes stale glb files only', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vibe3d-exp-'));
    await writeFile(join(dir, 'old.glb'), 'x');
    await writeFile(join(dir, 'keep.txt'), 'x');
    const now = () => Date.now() + EXPORT_TTL_MS + 1_000;
    expect(await sweepExports(dir, EXPORT_TTL_MS, now)).toEqual(['old.glb']);
    expect(await sweepExports(dir, EXPORT_TTL_MS)).toEqual([]);
  });
});

describe('JobQueue', () => {
  it('runs one job at a time in FIFO order', async () => {
    const store = new JobStore();
    const seen: string[] = [];
    const queue = new JobQueue(store);
    const releases: Array<() => void> = [];
    const make = (name: string) => async () => {
      seen.push(`start:${name}`);
      await new Promise<void>((resolve) => releases.push(resolve));
      seen.push(`end:${name}`);
      return { url: name, bytes: 1, revision: 1 };
    };
    const a = store.create('export.glb', 'r1');
    const b = store.create('export.glb', 'r2');
    queue.enqueue(a, make('a'));
    queue.enqueue(b, make('b'));
    await Promise.resolve();
    expect(seen).toEqual(['start:a']);
    expect(queue.running).toBe(a.id);
    releases.shift()?.();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen).toEqual(['start:a', 'end:a', 'start:b']);
    releases.shift()?.();
    await queue.idle();
    expect(store.get(a.id)?.state).toBe('done');
    expect(store.get(b.id)?.state).toBe('done');
    expect(queue.depth).toBe(0);
  });

  it('cancels queued jobs before they start', async () => {
    const store = new JobStore();
    const queue = new JobQueue(store);
    let release: () => void = () => undefined;
    let ran = false;
    const first = store.create('export.glb', 'r1');
    const second = store.create('export.glb', 'r1');
    queue.enqueue(
      first,
      () =>
        new Promise((resolve) => {
          release = () => resolve({ url: 'a', bytes: 1, revision: 1 });
        }),
    );
    queue.enqueue(second, async () => {
      ran = true;
      return { url: 'b', bytes: 1, revision: 1 };
    });
    expect(queue.cancel(second.id)?.state).toBe('cancelled');
    expect(queue.depth).toBe(0);
    await Promise.resolve();
    release();
    await queue.idle();
    expect(ran).toBe(false);
    expect(store.get(second.id)?.state).toBe('cancelled');
  });

  it('discards the result of a cancelled running job', async () => {
    const store = new JobStore();
    const queue = new JobQueue(store);
    let finish: () => void = () => undefined;
    const job = store.create('export.glb', 'r1');
    queue.enqueue(
      job,
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ url: 'a', bytes: 1, revision: 1 });
        }),
    );
    await Promise.resolve();
    queue.cancel(job.id);
    finish();
    await queue.idle();
    const after = store.get(job.id);
    expect(after?.state).toBe('cancelled');
    expect(after?.result).toBeUndefined();
  });

  it('rejects with E_BUSY past the queue limit', async () => {
    const store = new JobStore();
    const queue = new JobQueue(store, {}, 1);
    let release: () => void = () => undefined;
    queue.enqueue(
      store.create('export.glb', 'r1'),
      () =>
        new Promise((resolve) => {
          release = () => resolve({ url: 'a', bytes: 1, revision: 1 });
        }),
    );
    const extra = store.create('export.glb', 'r1');
    expect(() => queue.enqueue(extra, async () => ({ url: 'b', bytes: 1, revision: 1 }))).toThrowError(
      /队列已满/,
    );
    await Promise.resolve();
    release();
    await queue.idle();
  });

  it('reports progress and failure events', async () => {
    const store = new JobStore();
    const events: string[] = [];
    const queue = new JobQueue(store, {
      progress: (job) => events.push(`p:${job.progress}:${job.phase}`),
      done: () => events.push('done'),
      failed: (job) => events.push(`fail:${job.error?.code}`),
    });
    queue.enqueue(store.create('export.glb', 'r1'), async (_job, report) => {
      report(0.5, 'pack');
      throw new Error('boom');
    });
    await queue.idle();
    expect(events).toEqual(['p:0.5:pack', 'fail:E_INTERNAL']);
  });
});
