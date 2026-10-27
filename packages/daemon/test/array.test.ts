import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

type Pose = { p: number[]; r: number[] };
const at = (t: Pose[], i: number): Pose => t[i]!;

const near = (a: number[], b: number[]) => {
  expect(a).toHaveLength(b.length);
  a.forEach((v, i) => expect(Math.abs(v - b[i]!)).toBeLessThan(1e-6));
};

const codeOf = (body: any): string | undefined => body?.error?.data?.code ?? body?.error?.code;

async function box(h: Harness, roomId: string, p: [number, number, number]) {
  const res = await call(
    h,
    'node.create',
    { roomId, kind: 'mesh', name: '柱', shape: 'cylinder', radius: 0.2, height: 1, transform: { p } },
    roomId,
  );
  return res.body.result.nodeId as string;
}

async function transforms(h: Harness, roomId: string, ids: string[]): Promise<Pose[]> {
  const doc = (await call(h, 'scene.export', { roomId }, roomId)).body.result.doc;
  return ids.map((id) => doc.nodes[id].transform as Pose);
}

describe('node.array modes', () => {
  it('grid lays copies out in rows and reports every created id', async () => {
    const h = await makeHarness();
    const { roomId } = (await call(h, 'room.create', { name: '网格阵列' })).body.result;
    const id = await box(h, roomId, [0, 0.5, 0]);
    const res = await call(
      h,
      'node.array',
      { roomId, id, mode: 'grid', count: 4, cols: 2, offset: [3, 0, 5] },
      roomId,
    );
    expect(res.status).toBe(200);
    const ids: string[] = res.body.result.nodeIds;
    expect(ids).toHaveLength(4);
    const t = await transforms(h, roomId, [id, ...ids]);
    expect(t[0]!.p).toEqual([0, 0.5, 0]);
    near(at(t, 1).p, [3, 0.5, 0]);
    near(at(t, 2).p, [0, 0.5, 5]);
    near(at(t, 3).p, [3, 0.5, 5]);
    near(at(t, 4).p, [0, 0.5, 10]);
  });

  it('radial rings copies around the source and turns each one to face outward', async () => {
    const h = await makeHarness();
    const { roomId } = (await call(h, 'room.create', { name: '环形阵列' })).body.result;
    const id = await box(h, roomId, [4, 0.5, 0]);
    const res = await call(
      h,
      'node.array',
      { roomId, id, mode: 'radial', count: 3, center: [0, 0.5, 0], sweep: 360 },
      roomId,
    );
    expect(res.status).toBe(200);
    const ids: string[] = res.body.result.nodeIds;
    const t = await transforms(h, roomId, ids);
    near(at(t, 0).p, [0, 0.5, -4]);
    near(at(t, 1).p, [-4, 0.5, 0]);
    near(at(t, 2).p, [0, 0.5, 4]);
    near(at(t, 0).r, [0, Math.PI / 2, 0]);
    near(at(t, 2).r, [0, (3 * Math.PI) / 2, 0]);
  });

  it('rejects a radial ring whose centre contradicts its radius', async () => {
    const h = await makeHarness();
    const { roomId } = (await call(h, 'room.create', { name: '环形参数' })).body.result;
    const id = await box(h, roomId, [4, 0.5, 0]);
    const res = await call(
      h,
      'node.array',
      { roomId, id, mode: 'radial', count: 2, radius: 1, center: [0, 0.5, 0] },
      roomId,
    );
    expect(codeOf(res.body)).toBe('E_INVALID_PARAMS');
  });

  it('linear still accepts the legacy shape with only offset', async () => {
    const h = await makeHarness();
    const { roomId } = (await call(h, 'room.create', { name: '线性阵列' })).body.result;
    const id = await box(h, roomId, [0, 0.5, 0]);
    const res = await call(h, 'node.array', { roomId, id, count: 2, offset: [2, 0, 0] }, roomId);
    expect(res.status).toBe(200);
    const t = await transforms(h, roomId, res.body.result.nodeIds);
    near(at(t, 0).p, [2, 0.5, 0]);
    near(at(t, 1).p, [4, 0.5, 0]);
  });
});
