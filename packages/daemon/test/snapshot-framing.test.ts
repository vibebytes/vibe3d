import { frameCamera } from '@vibebyte/vibe3d-scene';
import { describe, expect, it } from 'vitest';
import type { DispatchContext, SnapshotOptions } from '../src/context';
import { type Harness, call, makeHarness } from './helpers/harness';
import { makePng } from './helpers/png';

const tinyPng = () => makePng(8, 8, () => [128, 128, 128, 255]);

function recordingRenderer() {
  const shots: SnapshotOptions[] = [];
  const renderer = {
    name: 'fake',
    ready: true,
    available: () => true,
    snapshot: async (_input: unknown, opts: SnapshotOptions = {}) => {
      shots.push(opts);
      return {
        mime: 'image/png',
        base64: tinyPng().toString('base64'),
        width: opts.width ?? 1280,
        height: opts.height ?? 720,
      };
    },
    exportGlb: async () => ({ jobId: 'j', url: '/exports/j.glb', bytes: 1 }),
  };
  return { renderer: renderer as unknown as DispatchContext['renderer'], shots };
}

async function roomWithBox(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '取景' });
  const roomId = body.result.roomId as string;
  await call(h, 'node.create', { kind: 'box', size: [1, 1, 1], name: 'box' }, roomId);
  await call(
    h,
    'camera.set',
    { camera: { mode: 'persp', p: [10, 10, 10], target: [0, 0, 0], fov: 35 } },
    roomId,
  );
  return roomId;
}

describe('render.snapshot 默认取景语义（V2-01）', () => {
  it('不传 camera/framing：尊重 doc 当前机位，framing.source=camera', async () => {
    const h = makeHarness();
    const { renderer, shots } = recordingRenderer();
    h.ctx.renderer = renderer;
    const roomId = await roomWithBox(h);

    const { body } = await call(h, 'render.snapshot', {}, roomId);
    expect(body.error).toBeUndefined();
    expect(shots[0]?.camera).toBeUndefined();
    expect(body.result.framing.source).toBe('camera');
  });

  it('framing:"scene"：按场景 bbox 自动取景，回显 framing 元信息', async () => {
    const h = makeHarness();
    const { renderer, shots } = recordingRenderer();
    h.ctx.renderer = renderer;
    const roomId = await roomWithBox(h);

    const { body } = await call(h, 'render.snapshot', { framing: 'scene' }, roomId);
    expect(body.error).toBeUndefined();
    const expected = frameCamera(h.rooms.get(roomId).doc, 'fit');
    expect(shots[0]?.camera?.p).toEqual(expected.p);
    expect(shots[0]?.camera?.target).toEqual(expected.target);
    const framing = body.result.framing;
    expect(framing.source).toBe('scene');
    expect(framing.center).toEqual([0, 0, 0]);
    expect(typeof framing.fov).toBe('number');
  });

  it('显式 camera 优先于 framing:"scene"', async () => {
    const h = makeHarness();
    const { renderer, shots } = recordingRenderer();
    h.ctx.renderer = renderer;
    const roomId = await roomWithBox(h);

    const { body } = await call(
      h,
      'render.snapshot',
      { framing: 'scene', camera: { position: [1, 2, 3], target: [0, 0, 0], fov: 40 } },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(shots[0]?.camera?.p).toEqual([1, 2, 3]);
    expect(body.result.framing.source).toBe('camera');
  });

  it('camera.p 别名与 position 等价', async () => {
    const h = makeHarness();
    const { renderer, shots } = recordingRenderer();
    h.ctx.renderer = renderer;
    const roomId = await roomWithBox(h);

    const { body } = await call(
      h,
      'render.snapshot',
      { camera: { p: [1, 2, 3], target: [0, 0, 0] } },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(shots[0]?.camera?.p).toEqual([1, 2, 3]);
  });
});
