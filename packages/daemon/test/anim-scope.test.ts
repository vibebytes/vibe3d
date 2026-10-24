import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

const sway = { type: 'sway', channel: 'rz', amplitude: 0.2, frequency: 0.4 };

async function tree(h: Harness) {
  const created = await call(h, 'room.create', { name: 'clip 作用域' });
  const roomId = created.body.result.roomId;
  const make = async (kind: 'group' | 'mesh', name: string, parent?: string) => {
    const req: Record<string, unknown> = { roomId, kind, name };
    if (kind === 'mesh') req.shape = 'box';
    if (parent) req.parent = parent;
    const { body } = await call(h, 'node.create', req, roomId);
    return body.result.nodeId as string;
  };
  const rootId = await make('group', '根');
  const midId = await make('group', '中', rootId);
  const leafId = await make('mesh', '叶', midId);
  const sideId = await make('mesh', '旁');
  return { roomId, rootId, midId, leafId, sideId };
}

async function clips(h: Harness, roomId: string): Promise<Record<string, string | null>> {
  const doc = (await call(h, 'scene.export', { roomId }, roomId)).body.result.doc;
  const out: Record<string, string | null> = {};
  for (const [id, node] of Object.entries<any>(doc.nodes)) out[id] = node.clip?.type ?? null;
  return out;
}

describe('animation.define 作用域', () => {
  it('默认只作用于目标节点，appliedTo 只含该节点', async () => {
    const h = makeHarness();
    const { roomId, rootId, midId, leafId } = await tree(h);
    const { body } = await call(h, 'animation.define', { roomId, nodeId: rootId, clip: sway }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.appliedTo).toEqual([rootId]);
    const got = await clips(h, roomId);
    expect(got[rootId]).toBe('sway');
    expect(got[midId]).toBeNull();
    expect(got[leafId]).toBeNull();
  });

  it("applyTo:'subtree' 覆盖整棵子树且不越界", async () => {
    const h = makeHarness();
    const { roomId, rootId, midId, leafId, sideId } = await tree(h);
    const { body } = await call(
      h,
      'animation.define',
      { roomId, nodeId: midId, clip: sway, applyTo: 'subtree' },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(body.result.appliedTo).toEqual([midId, leafId]);
    const got = await clips(h, roomId);
    expect(got[midId]).toBe('sway');
    expect(got[leafId]).toBe('sway');
    expect(got[rootId]).toBeNull();
    expect(got[sideId]).toBeNull();
  });

  it('子树批量定义的撤销逐节点还原旧 clip', async () => {
    const h = makeHarness();
    const { roomId, rootId, midId, leafId } = await tree(h);
    await call(
      h,
      'animation.define',
      { roomId, nodeId: leafId, clip: { type: 'spin', channel: 'ry' } },
      roomId,
    );
    await call(
      h,
      'animation.define',
      { roomId, nodeId: rootId, clip: sway, applyTo: 'subtree' },
      roomId,
    );
    expect((await clips(h, roomId))[leafId]).toBe('sway');
    await call(h, 'scene.undo', { roomId }, roomId);
    const got = await clips(h, roomId);
    expect(got[rootId]).toBeNull();
    expect(got[midId]).toBeNull();
    expect(got[leafId]).toBe('spin');
  });
});

describe('animation.clear 作用域', () => {
  it("applyTo:'subtree' 清空子树、保留树外 clip，重复清理返回空 appliedTo", async () => {
    const h = makeHarness();
    const { roomId, rootId, midId, leafId, sideId } = await tree(h);
    await call(
      h,
      'animation.define',
      { roomId, nodeId: rootId, clip: sway, applyTo: 'subtree' },
      roomId,
    );
    await call(h, 'animation.define', { roomId, nodeId: sideId, clip: sway }, roomId);
    const { body } = await call(
      h,
      'animation.clear',
      { roomId, nodeId: rootId, applyTo: 'subtree' },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(body.result.cleared).toBe(true);
    expect(body.result.appliedTo).toEqual([rootId, midId, leafId]);
    const got = await clips(h, roomId);
    expect([got[rootId], got[midId], got[leafId]]).toEqual([null, null, null]);
    expect(got[sideId]).toBe('sway');

    const again = await call(
      h,
      'animation.clear',
      { roomId, nodeId: rootId, applyTo: 'subtree' },
      roomId,
    );
    expect(again.body.result.cleared).toBe(false);
    expect(again.body.result.appliedTo).toEqual([]);
  });
});

describe('applyTo 取值守卫', () => {
  it('scene 等非法作用域被拒：E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const { roomId, rootId } = await tree(h);
    const { body } = await call(
      h,
      'animation.define',
      { roomId, nodeId: rootId, clip: sway, applyTo: 'scene' },
      roomId,
    );
    expect(codeOf(body)).toBe('E_INVALID_PARAMS');
  });
});
