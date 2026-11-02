import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JobQueue } from '../src/jobs/queue';
import { JobStore } from '../src/jobs/store';
import { call, makeHarness } from './helpers/harness';

describe('/exports serving', () => {
  it('serves mp4 with video/mp4', async () => {
    const h = makeHarness({ token: null });
    const file = `${'cd'.repeat(16)}.mp4`;
    writeFileSync(join(h.dirs.exports, file), 'mp4-bytes');
    const res = await h.app.request(`/exports/${file}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp4');
  });

  it('sequence manifest frames carry a signed url', async () => {
    const h = makeHarness();
    const { body } = await call(h, 'room.create', { name: 'm' });
    const roomId = body.result.roomId;
    const store = new JobStore();
    const queue = new JobQueue(store);
    h.ctx.jobs = { store, queue };
    h.ctx.renderer = {
      name: 'fake',
      ready: true,
      available: () => true,
      snapshot: async () => ({ mime: 'image/png', base64: 'QUJD', width: 1, height: 1 }),
      exportGlb: async () => ({ jobId: 'x', url: '/exports/x.glb', bytes: 1 }),
    } as never;
    const started = await call(h, 'render.sequence', { roomId, from: 0, to: 0.5, fps: 2 }, roomId);
    await queue.idle();
    const manifest = JSON.parse(
      (await import('node:fs')).readFileSync(
        join(h.dirs.exports, `${started.body.result.jobId}.json`),
        'utf8',
      ),
    );
    expect(manifest.frames[0].url).toMatch(
      new RegExp(`^/exports/${manifest.frames[0].file}\\?exp=\\d+&sig=`),
    );
  });
});
