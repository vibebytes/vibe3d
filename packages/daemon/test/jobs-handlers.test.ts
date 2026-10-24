import { describe, expect, it } from 'vitest';
import type { Renderer } from '../src/context';
import { JobQueue } from '../src/jobs/queue';
import { JobStore } from '../src/jobs/store';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

function fakeRenderer(): Renderer {
  return {
    name: 'fake',
    ready: true,
    available: () => true,
    snapshot: async () => ({ mime: 'image/png', base64: '', width: 1, height: 1 }),
    exportGlb: async () => ({ jobId: 'internal', url: '/exports/fake.glb?exp=1&sig=x', bytes: 128 }),
  };
}

async function room(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '任务场景' });
  return body.result.roomId;
}

describe('handlers: jobs', () => {
  it('export.glb 入队后可通过 job.get/list 观察完成', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const store = new JobStore();
    const queue = new JobQueue(store);
    h.ctx.renderer = fakeRenderer();
    h.ctx.jobs = { store, queue };

    const started = await call(h, 'export.glb', { roomId }, roomId);
    expect(['queued', 'running']).toContain(started.body.result.state);
    const jobId = started.body.result.jobId as string;

    const running = await call(h, 'job.get', { jobId });
    expect(['queued', 'running', 'done']).toContain(running.body.result.state);

    await queue.idle();
    const done = await call(h, 'job.get', { jobId });
    expect(done.body.result.state).toBe('done');
    expect(done.body.result.pct).toBe(1);
    expect(done.body.result.bytes).toBe(128);
    expect(done.body.result.url).toContain('/exports/');

    const listed = await call(h, 'job.list', {}, roomId);
    expect(listed.body.result.items.map((job: any) => job.jobId)).toEqual([jobId]);
  });

  it('job.get / job.cancel 对未知任务返回 E_JOB_NOT_FOUND', async () => {
    const h = makeHarness();
    const store = new JobStore();
    h.ctx.renderer = fakeRenderer();
    h.ctx.jobs = { store, queue: new JobQueue(store) };

    const missing = await call(h, 'job.get', { jobId: 'nope' });
    expect(codeOf(missing.body)).toBe('E_JOB_NOT_FOUND');
    const cancel = await call(h, 'job.cancel', { jobId: 'nope' });
    expect(codeOf(cancel.body)).toBe('E_JOB_NOT_FOUND');
  });
});
