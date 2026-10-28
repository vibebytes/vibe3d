import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const near = (a: number[], b: number[]) => {
  expect(a).toHaveLength(b.length);
  a.forEach((v, i) => expect(Math.abs(v - b[i]!)).toBeLessThan(1e-6));
};

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

const codeOf = (body: any): string | undefined => body?.error?.data?.code ?? body?.error?.code;

async function mesh(
  h: Harness,
  roomId: string,
  p: [number, number, number],
  size: [number, number, number],
  parent?: string,
) {
  const res = await call(
    h,
    'node.create',
    {
      roomId,
      kind: 'mesh',
      name: '盒',
      shape: 'box',
      size,
      transform: { p },
      ...(parent ? { parent } : {}),
    },
    roomId,
  );
  return res.body.result.nodeId as string;
}

async function createRoom(h: Harness, name: string) {
  return (await call(h, 'room.create', { name })).body.result.roomId as string;
}

describe('node.attach', () => {
  it('snaps a node onto the target top face and reports the resulting world box', async () => {
    const h = await makeHarness();
    const roomId = await createRoom(h, '桌面吸附');
    const table = await mesh(h, roomId, [0, 1, 0], [2, 0.2, 2]);
    const cup = await mesh(h, roomId, [5, 5, 5], [0.4, 0.4, 0.4]);
    const res = await call(h, 'node.attach', { roomId, id: cup, targetId: table, face: 'top' }, roomId);
    expect(res.status).toBe(200);
    expect(res.body.result.revision).toBeGreaterThan(0);
    close(res.body.result.box.max[1], 1.5);
    close(res.body.result.box.min[0], -0.2);
    close(res.body.result.box.max[2], 0.2);
  });

  it('keeps the world position correct under a rotated parent', async () => {
    const h = await makeHarness();
    const roomId = await createRoom(h, '旋转父级吸附');
    const table = await mesh(h, roomId, [0, 1, 0], [2, 0.2, 2]);
    const group = (
      await call(
        h,
        'node.create',
        { roomId, kind: 'group', name: '组', transform: { p: [3, 0, 0], r: [0, Math.PI / 2, 0] } },
        roomId,
      )
    ).body.result.nodeId as string;
    const cup = await mesh(h, roomId, [1, 5, 0], [0.4, 0.4, 0.4], group);
    const res = await call(
      h,
      'node.attach',
      { roomId, id: cup, targetId: table, face: 'top', gap: 0.05 },
      roomId,
    );
    expect(res.status).toBe(200);
    close(res.body.result.box.min[1], 1.15);
    close(res.body.result.box.min[0], -0.2);
    close(res.body.result.box.max[2], 0.2);
  });

  it('uses the corner anchor on side faces', async () => {
    const h = await makeHarness();
    const roomId = await createRoom(h, '侧面角吸附');
    const wall = await mesh(h, roomId, [0, 1, 0], [4, 2, 0.2]);
    const shelf = await mesh(h, roomId, [0, 0, 5], [1, 0.3, 0.5]);
    const res = await call(
      h,
      'node.attach',
      { roomId, id: shelf, targetId: wall, face: 'front', corner: 'min-min', gap: 0.1 },
      roomId,
    );
    expect(res.status).toBe(200);
    close(res.body.result.box.min[2], 0.2);
    close(res.body.result.box.min[0], -2);
    close(res.body.result.box.min[1], 0);
  });

  it('rejects a missing target without bumping the revision', async () => {
    const h = await makeHarness();
    const roomId = await createRoom(h, '缺目标');
    const cup = await mesh(h, roomId, [0, 1, 0], [1, 1, 1]);
    const before = (await call(h, 'room.get', { roomId }, roomId)).body.result.revision;
    const res = await call(
      h,
      'node.attach',
      { roomId, id: cup, targetId: 'n_ffffffff', face: 'top' },
      roomId,
    );
    expect(codeOf(res.body)).toBe('E_NODE_NOT_FOUND');
    const after = (await call(h, 'room.get', { roomId }, roomId)).body.result.revision;
    expect(after).toBe(before);
  });

  it('rejects an unknown face', async () => {
    const h = await makeHarness();
    const roomId = await createRoom(h, '非法面');
    const table = await mesh(h, roomId, [0, 1, 0], [2, 0.2, 2]);
    const cup = await mesh(h, roomId, [0, 5, 0], [0.4, 0.4, 0.4]);
    const res = await call(h, 'node.attach', { roomId, id: cup, targetId: table, face: 'inside' }, roomId);
    expect(codeOf(res.body)).toBe('E_INVALID_PARAMS');
  });
});
