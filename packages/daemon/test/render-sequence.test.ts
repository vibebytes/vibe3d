import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Renderer } from '../src/context';
import { JobQueue } from '../src/jobs/queue';
import { JobStore } from '../src/jobs/store';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

function frameRenderer(ats: number[]): Renderer {
  return {
    name: 'fake',
    ready: true,
    available: () => true,
    snapshot: async (_input, opts) => {
      ats.push(opts?.at ?? Number.NaN);
      return { mime: 'image/png', base64: 'QUJD', width: opts?.width ?? 1, height: opts?.height ?? 1 };
    },
    exportGlb: async () => ({ jobId: 'x', url: '/exports/x.glb', bytes: 1 }),
  };
}

async function room(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '序列帧' });
  return body.result.roomId;
}

describe('render.sequence', () => {
  it('按 fps 采样成帧序列并产出 manifest', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const ats: number[] = [];
    const store = new JobStore();
    const queue = new JobQueue(store);
    h.ctx.renderer = frameRenderer(ats);
    h.ctx.jobs = { store, queue };

    const started = await call(
      h,
      'render.sequence',
      { roomId, from: 0, to: 2, fps: 2, width: 160, height: 90 },
      roomId,
    );
    expect(started.body.error).toBeUndefined();
    const jobId = started.body.result.jobId as string;

    await queue.idle();
    const done = await call(h, 'job.get', { jobId });
    expect(done.body.result.state).toBe('done');
    expect(done.body.result.kind).toBe('render.sequence');
    expect(done.body.result.bytes).toBeGreaterThan(0);
    expect(done.body.result.url).toContain(`${jobId}.json`);

    expect(ats).toEqual([0, 0.5, 1, 1.5, 2]);
    const manifestPath = join(h.dirs.exports, `${jobId}.json`);
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.status).toBe('done');
    expect(manifest.expectedFrames).toBe(5);
    expect(manifest.fps).toBe(2);
    expect(manifest.frames).toHaveLength(5);
    expect(manifest.frames[3].at).toBe(1.5);
    expect(existsSync(join(h.dirs.exports, manifest.frames[3].file))).toBe(true);
    expect(done.body.result.frames).toBe(5);
  });

  it('writes a failed manifest and reports the error when a frame throws', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const store = new JobStore();
    const queue = new JobQueue(store);
    let n = 0;
    h.ctx.renderer = {
      ...frameRenderer([]),
      snapshot: async () => {
        n += 1;
        if (n === 2) throw new Error('gpu lost');
        return { mime: 'image/png', base64: 'QUJD', width: 160, height: 90 };
      },
    };
    h.ctx.jobs = { store, queue };

    const started = await call(
      h,
      'render.sequence',
      { roomId, from: 0, to: 2, fps: 2, width: 160, height: 90 },
      roomId,
    );
    const jobId = started.body.result.jobId as string;
    await queue.idle();

    const failed = await call(h, 'job.get', { jobId });
    expect(failed.body.result.state).toBe('failed');
    expect(failed.body.result.error.message).toContain('gpu lost');

    const manifestPath = join(h.dirs.exports, `${jobId}.json`);
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.status).toBe('failed');
    expect(manifest.expectedFrames).toBe(5);
    expect(manifest.frames).toHaveLength(1);
    expect(manifest.error.message).toContain('gpu lost');
  });

  it('writes a cancelled manifest when the job is cancelled mid-run', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const store = new JobStore();
    const queue = new JobQueue(store);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    h.ctx.renderer = {
      ...frameRenderer([]),
      snapshot: async () => {
        if (first) {
          first = false;
          await gate;
        }
        return { mime: 'image/png', base64: 'QUJD', width: 160, height: 90 };
      },
    };
    h.ctx.jobs = { store, queue };

    const started = await call(
      h,
      'render.sequence',
      { roomId, from: 0, to: 2, fps: 2, width: 160, height: 90 },
      roomId,
    );
    const jobId = started.body.result.jobId as string;
    await call(h, 'job.cancel', { jobId });
    release();
    await queue.idle();

    const done = await call(h, 'job.get', { jobId });
    expect(done.body.result.state).toBe('cancelled');

    const manifestPath = join(h.dirs.exports, `${jobId}.json`);
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.status).toBe('cancelled');
    expect(manifest.frames).toHaveLength(1);
  });

  it('fps 越界时报 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    h.ctx.renderer = frameRenderer([]);
    const bad = await call(h, 'render.sequence', { roomId, from: 0, to: 1, fps: 0 }, roomId);
    expect(codeOf(bad.body)).toBe('E_INVALID_PARAMS');
  });

  it('to 小于 from 时报 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    h.ctx.renderer = frameRenderer([]);
    const bad = await call(h, 'render.sequence', { roomId, from: 2, to: 1, fps: 12 }, roomId);
    expect(codeOf(bad.body)).toBe('E_INVALID_PARAMS');
  });
});
