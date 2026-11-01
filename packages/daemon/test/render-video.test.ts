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
  const { body } = await call(h, 'room.create', { name: '视频' });
  return body.result.roomId;
}

describe('render.video', () => {
  it('按 fps 采样并调用 ffmpeg 编码出 mp4', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const ats: number[] = [];
    const store = new JobStore();
    const queue = new JobQueue(store);
    h.ctx.renderer = frameRenderer(ats);
    h.ctx.jobs = { store, queue };
    const calls: { args: string[]; cwd: string }[] = [];
    h.ctx.ffmpeg = {
      available: async () => true,
      run: async (args, cwd) => {
        calls.push({ args, cwd });
      },
    };

    const started = await call(
      h,
      'render.video',
      { roomId, from: 0, to: 1, fps: 2, width: 160, height: 90 },
      roomId,
    );
    expect(started.body.error).toBeUndefined();
    const jobId = started.body.result.jobId as string;
    await queue.idle();

    const done = await call(h, 'job.get', { jobId });
    expect(done.body.result.state).toBe('done');
    expect(done.body.result.kind).toBe('render.video');
    expect(done.body.result.url).toContain(`${jobId}.mp4`);
    expect(ats).toEqual([0, 0.5, 1]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args.join(' ')).toContain('-framerate 2');
    expect(calls[0]?.args.join(' ')).toContain(`${jobId}.mp4`);
    expect(existsSync(join(h.dirs.exports, `${jobId}.json`))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(h.dirs.exports, `${jobId}.json`), 'utf8'));
    expect(manifest.status).toBe('done');
    expect(manifest.frames).toHaveLength(3);
    expect(manifest.video).toBe(`${jobId}.mp4`);
  });

  it('ffmpeg 不可用时任务失败并给出 E_FFMPEG_MISSING', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const store = new JobStore();
    const queue = new JobQueue(store);
    h.ctx.renderer = frameRenderer([]);
    h.ctx.jobs = { store, queue };
    h.ctx.ffmpeg = { available: async () => false, run: async () => {} };

    const started = await call(h, 'render.video', { roomId, from: 0, to: 1, fps: 2 }, roomId);
    const jobId = started.body.result.jobId as string;
    await queue.idle();

    const done = await call(h, 'job.get', { jobId });
    expect(done.body.result.state).toBe('failed');
    expect(done.body.result.error.code).toBe('E_FFMPEG_MISSING');
  });

  it('帧数超上限时报 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    h.ctx.renderer = frameRenderer([]);
    const bad = await call(h, 'render.video', { roomId, from: 0, to: 60, fps: 60 }, roomId);
    expect(codeOf(bad.body)).toBe('E_INVALID_PARAMS');
  });
});
