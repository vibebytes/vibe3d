import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { glb } from './helpers/glb';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

function tmpGlb(opts: Parameters<typeof glb>[0]): string {
  const dir = mkdtempSync(join(tmpdir(), 'v3d-align-'));
  const path = join(dir, 'model.glb');
  writeFileSync(path, glb(opts));
  return path;
}

async function newRoom(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '摆位' });
  return body.result.roomId;
}

async function transformOf(h: Harness, roomId: string, nodeId: string) {
  const got = await call(h, 'scene.get', { roomId }, roomId);
  return got.body.result.doc.nodes[nodeId].transform;
}

describe('node.import align', () => {
  it('defaults to ground: bbox bottom on y=0, centered in xz, normalized to 1.5m', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const src = tmpGlb({ min: [0, 0, 0], max: [2, 4, 2] });
    const { body } = await call(h, 'node.import', { roomId, src }, roomId);
    const t = await transformOf(h, roomId, body.result.nodeId);
    const k = 1.5 / 4;
    expect(t.s).toEqual([k, k, k]);
    expect(t.p[1]).toBeCloseTo(0, 10);
    expect(t.p[0]).toBeCloseTo(-1 * k, 10);
    expect(t.p[2]).toBeCloseTo(-1 * k, 10);
  });

  it('align=center puts the bbox center at the node origin', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const src = tmpGlb({ min: [0, 1, 0], max: [2, 5, 2] });
    const { body } = await call(h, 'node.import', { roomId, src, align: 'center' }, roomId);
    const t = await transformOf(h, roomId, body.result.nodeId);
    const k = 1.5 / 4;
    expect(t.s).toEqual([k, k, k]);
    expect(t.p).toEqual([-1 * k, -3 * k, -1 * k]);
  });

  it('align=none keeps original coordinates and size', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const src = tmpGlb({ min: [-1, 0, -1], max: [3, 8, 3] });
    const { body } = await call(h, 'node.import', { roomId, src, align: 'none' }, roomId);
    const t = await transformOf(h, roomId, body.result.nodeId);
    expect(t.p).toEqual([0, 0, 0]);
    expect(t.s).toEqual([1, 1, 1]);
  });

  it('explicit transform.p wins over align while keeping the fit scale', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const src = tmpGlb({ min: [0, 0, 0], max: [2, 4, 2] });
    const { body } = await call(
      h,
      'node.import',
      { roomId, src, align: 'center', transform: { p: [1, 2, 3] } },
      roomId,
    );
    const t = await transformOf(h, roomId, body.result.nodeId);
    expect(t.p).toEqual([1, 2, 3]);
    expect(t.s).toEqual([0.375, 0.375, 0.375]);
  });

  it('align=ground derives the offset from an explicit transform.s', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const src = tmpGlb({ min: [0, -1, 0], max: [1, 1, 1] });
    const { body } = await call(h, 'node.import', { roomId, src, transform: { s: [2, 2, 2] } }, roomId);
    const t = await transformOf(h, roomId, body.result.nodeId);
    expect(t.s).toEqual([2, 2, 2]);
    expect(t.p).toEqual([-1, 2, -1]);
  });

  it('rejects an unknown align without creating a node', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const src = tmpGlb({});
    const before = await call(h, 'scene.get', { roomId }, roomId);
    const { body } = await call(h, 'node.import', { roomId, src, align: 'top' }, roomId);
    expect(codeOf(body)).toBe('E_INVALID_PARAMS');
    const after = await call(h, 'scene.get', { roomId }, roomId);
    expect(Object.keys(after.body.result.doc.nodes)).toHaveLength(
      Object.keys(before.body.result.doc.nodes).length,
    );
  });
});
