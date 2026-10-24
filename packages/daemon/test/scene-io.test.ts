import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function room(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: 'io' });
  return body.result.roomId;
}

async function shape(h: Harness, roomId: string, s: 'box' | 'sphere'): Promise<void> {
  const { body } = await call(h, 'node.create', { roomId, kind: 'mesh', shape: s }, roomId);
  expect(body.result.nodeId).toBeTruthy();
}

describe('scene.export / scene.import', () => {
  it('导出整份文档并回灌：revision 递增，undo 可一次回退', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    await shape(h, roomId, 'box');

    const exported = await call(h, 'scene.export', { roomId }, roomId);
    expect(exported.status).toBe(200);
    expect(exported.body.result.revision).toBe(1);
    expect(Object.keys(exported.body.result.doc.nodes)).toHaveLength(1);

    await shape(h, roomId, 'sphere');
    const grown = await call(h, 'scene.get', { roomId }, roomId);
    expect(Object.keys(grown.body.result.doc.nodes)).toHaveLength(2);

    const imported = await call(h, 'scene.import', { roomId, doc: exported.body.result.doc }, roomId);
    expect(imported.status).toBe(200);
    expect(imported.body.result.revision).toBe(3);

    const after = await call(h, 'scene.get', { roomId }, roomId);
    expect(Object.keys(after.body.result.doc.nodes)).toHaveLength(1);
    expect(after.body.result.revision).toBe(3);

    await call(h, 'scene.undo', { roomId }, roomId);
    const undone = await call(h, 'scene.get', { roomId }, roomId);
    expect(Object.keys(undone.body.result.doc.nodes)).toHaveLength(2);
  });

  it('文档未通过 validateDoc 时拒绝：父节点不存在', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    await shape(h, roomId, 'box');
    const exported = await call(h, 'scene.export', { roomId }, roomId);
    const doc = structuredClone(exported.body.result.doc);
    const id = Object.keys(doc.nodes)[0]!;
    doc.nodes[id].parent = 'n_zzzzzzzz';

    const res = await call(h, 'scene.import', { roomId, doc }, roomId);
    expect(res.status).toBe(400);
    expect(codeOf(res.body)).toBe('E_INVALID_PARAMS');

    const still = await call(h, 'scene.get', { roomId }, roomId);
    expect(still.body.result.revision).toBe(1);
  });

  it('引用未登记的资产报 E_ASSET_MISSING', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    await shape(h, roomId, 'box');
    const exported = await call(h, 'scene.export', { roomId }, roomId);
    const doc = structuredClone(exported.body.result.doc);
    const mesh = Object.values(doc.nodes).find((n: any) => n.kind === 'mesh') as any;
    doc.materials[mesh.material].map = 'a'.repeat(64);

    const res = await call(h, 'scene.import', { roomId, doc }, roomId);
    expect(res.status).toBe(422);
    expect(codeOf(res.body)).toBe('E_ASSET_MISSING');
  });

  it('expectRevision 不一致时报 E_CONFLICT', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    await shape(h, roomId, 'box');
    const exported = await call(h, 'scene.export', { roomId }, roomId);
    await shape(h, roomId, 'sphere');

    const res = await call(
      h,
      'scene.import',
      { roomId, doc: exported.body.result.doc, expectRevision: 1 },
      roomId,
    );
    expect(res.status).toBe(409);
    expect(codeOf(res.body)).toBe('E_CONFLICT');
  });
});
