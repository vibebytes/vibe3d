import { describe, expect, it } from 'vitest';
import type { Renderer } from '../src/context';
import { JobQueue } from '../src/jobs/queue';
import { JobStore } from '../src/jobs/store';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

function recorder(seen: unknown[]): Renderer {
  return {
    name: 'fake',
    ready: true,
    available: () => true,
    snapshot: async () => ({ mime: 'image/png', base64: '', width: 1, height: 1 }),
    exportGlb: async (_input, _nodeIds, include) => {
      seen.push(include);
      return { jobId: 'internal', url: '/exports/fake.glb?exp=1&sig=x', bytes: 64 };
    },
  };
}

describe('export.glb include 过滤', () => {
  it('include:[lights] 透传给渲染器', async () => {
    const h = makeHarness();
    const { body } = await call(h, 'room.create', { name: '导出灯光' });
    const roomId = body.result.roomId;
    const seen: unknown[] = [];
    const store = new JobStore();
    const queue = new JobQueue(store);
    h.ctx.renderer = recorder(seen);
    h.ctx.jobs = { store, queue };

    const started = await call(h, 'export.glb', { roomId, include: ['lights'] }, roomId);
    expect(started.body.error).toBeUndefined();
    await queue.idle();
    expect(seen).toEqual([['lights']]);
    const done = await call(h, 'job.get', { jobId: started.body.result.jobId });
    expect(done.body.result.state).toBe('done');
    expect(done.body.result.bytes).toBe(64);
  });

  it('include 缺省时不额外约束', async () => {
    const h = makeHarness();
    const { body } = await call(h, 'room.create', { name: '默认导出' });
    const roomId = body.result.roomId;
    const seen: unknown[] = [];
    const store = new JobStore();
    const queue = new JobQueue(store);
    h.ctx.renderer = recorder(seen);
    h.ctx.jobs = { store, queue };

    await call(h, 'export.glb', { roomId }, roomId);
    await queue.idle();
    expect(seen).toEqual([undefined]);
  });

  it('include 取值非法时报 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const { body } = await call(h, 'room.create', { name: '非法导出' });
    const roomId = body.result.roomId;
    h.ctx.renderer = recorder([]);
    const bad = await call(h, 'export.glb', { roomId, include: ['textures'] }, roomId);
    expect(codeOf(bad.body)).toBe('E_INVALID_PARAMS');
  });
});
