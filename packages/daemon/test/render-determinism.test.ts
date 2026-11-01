import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DispatchContext, SnapshotOptions } from '../src/context';
import { JobQueue } from '../src/jobs/queue';
import { JobStore } from '../src/jobs/store';
import { type Harness, call, makeHarness } from './helpers/harness';
import { makePng } from './helpers/png';

const md5 = (base64: string): string => createHash('md5').update(Buffer.from(base64, 'base64')).digest('hex');

function animatedPng(at: number | undefined): string {
  const t = at ?? 0;
  const x = Math.round(20 + 60 * Math.abs(Math.sin(t)));
  return makePng(96, 72, (px) => (px < x ? [220, 60, 40, 255] : [30, 40, 60, 255])).toString('base64');
}

function deterministicRenderer(seen: SnapshotOptions[]) {
  return {
    name: 'fake',
    ready: true,
    available: () => true,
    snapshot: async (_input: unknown, opts: SnapshotOptions = {}) => {
      seen.push(structuredClone(opts));
      return {
        mime: 'image/png',
        base64: animatedPng(opts.at),
        width: opts.width ?? 1280,
        height: opts.height ?? 720,
      };
    },
    exportGlb: async () => ({ jobId: 'j', url: '/exports/j.glb', bytes: 1 }),
  };
}

async function animatedRoom(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '确定性' });
  const roomId = body.result.roomId;
  const created = await call(
    h,
    'node.create',
    { roomId, kind: 'mesh', shape: 'box', size: [1, 1, 1], transform: { p: [0, 1, 0] } },
    roomId,
  );
  await call(
    h,
    'animation.define',
    {
      roomId,
      nodeId: created.body.result.nodeId,
      clip: {
        type: 'keyframes',
        tracks: [
          {
            path: 'position',
            keys: [
              { t: 0, v: [0, 1, 0] },
              { t: 2, v: [4, 1, 0] },
            ],
          },
        ],
      },
    },
    roomId,
  );
  return roomId;
}

describe('渲染确定性', () => {
  it('同一 at 连续 5 次 snapshot 字节一致', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = deterministicRenderer(seen) as unknown as DispatchContext['renderer'];
    const roomId = await animatedRoom(h);

    const hashes: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const { body } = await call(h, 'render.snapshot', { roomId, at: 0.4, width: 96, height: 72 }, roomId);
      expect(body.error).toBeUndefined();
      hashes.push(md5(body.result.base64));
    }
    expect(new Set(hashes).size).toBe(1);
    for (const opts of seen) expect(opts.at).toBe(0.4);
  });

  it('sequence 相邻帧不同，且每帧都带 at', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = deterministicRenderer(seen) as unknown as DispatchContext['renderer'];
    const store = new JobStore();
    const queue = new JobQueue(store);
    h.ctx.jobs = { store, queue };
    const roomId = await animatedRoom(h);

    const started = await call(
      h,
      'render.sequence',
      { roomId, from: 0, to: 1, fps: 4, width: 96, height: 72 },
      roomId,
    );
    expect(started.body.error).toBeUndefined();
    const jobId = started.body.result.jobId as string;
    await queue.idle();
    const done = await call(h, 'job.get', { jobId });
    expect(done.body.result.state).toBe('done');

    const manifest = JSON.parse(readFileSync(join(h.dirs.exports, `${jobId}.json`), 'utf8'));
    const hashes = manifest.frames.map((f: { file: string }) =>
      md5(readFileSync(join(h.dirs.exports, f.file)).toString('base64')),
    );
    expect(new Set(hashes).size).toBeGreaterThan(1);
    expect(manifest.frames.map((f: { at: number }) => f.at)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(manifest.warning).toBeUndefined();
  });

  it('sequence 每帧至少 settle 两帧时长', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = deterministicRenderer(seen) as unknown as DispatchContext['renderer'];
    const store = new JobStore();
    const queue = new JobQueue(store);
    h.ctx.jobs = { store, queue };
    const roomId = await animatedRoom(h);

    const started = await call(
      h,
      'render.sequence',
      { roomId, from: 0, to: 0.5, fps: 10, width: 96, height: 72 },
      roomId,
    );
    await queue.idle();
    const jobId = started.body.result.jobId as string;
    const manifest = JSON.parse(readFileSync(join(h.dirs.exports, `${jobId}.json`), 'utf8'));
    expect(manifest.settleMs).toBe(200);
    for (const opts of seen) expect(opts.settleMs).toBe(200);
  });
});
