import { describe, expect, it } from 'vitest';
import { type Harness, call, codeOf, makeHarness, post } from './helpers/harness';

async function setup(): Promise<{ h: Harness; roomId: string; first: string }> {
  const h = makeHarness();
  const created = await call(h, 'room.create', { name: 'conflict' });
  const roomId = created.body.result.roomId as string;
  const node = await call(h, 'node.create', { roomId, kind: 'group', name: 'a' }, roomId);
  return { h, roomId, first: node.body.result.nodeId as string };
}

async function revision(h: Harness, roomId: string): Promise<number> {
  return (await call(h, 'scene.get', { roomId }, roomId)).body.result.revision;
}

describe('E_CONFLICT 详情', () => {
  it('ops.apply 冲突带 expectRevision / actualRevision / changedPaths / next', async () => {
    const { h, roomId, first } = await setup();
    const second = (await call(h, 'node.create', { roomId, kind: 'group', name: 'b' }, roomId)).body.result
      .nodeId;

    const res = await call(
      h,
      'ops.apply',
      { ops: [{ op: 'node.update', id: first, patch: { visible: false } }], baseRevision: 1 },
      roomId,
    );
    expect(res.status).toBe(409);
    const data = res.body.error.data;
    expect(data.code).toBe('E_CONFLICT');
    expect(data.expectRevision).toBe(1);
    expect(data.actualRevision).toBe(2);
    expect(data.currentRevision).toBe(2);
    expect(data.changedPaths).toEqual([`/nodes/${second}`, '/roots']);
    expect(data.truncated).toBe(false);
    expect(String(data.hint)).toContain('scene.get');
    expect(data.next).toMatchObject({ tool: 'vibe3d_scene_get' });
    expect(String(data.next.after)).toContain('baseRevision:2');
    expect(await revision(h, roomId)).toBe(2);
  });

  it('changedPaths 只列区间内的改动', async () => {
    const { h, roomId, first } = await setup();
    const second = (await call(h, 'node.create', { roomId, kind: 'group', name: 'b' }, roomId)).body.result
      .nodeId;
    await call(h, 'node.update', { roomId, nodeId: first, patch: { visible: false } }, roomId);
    await call(h, 'node.update', { roomId, nodeId: second, patch: { visible: false } }, roomId);

    const res = await call(
      h,
      'ops.apply',
      { ops: [{ op: 'node.update', id: first, patch: { name: 'x' } }], baseRevision: 2 },
      roomId,
    );
    expect(res.status).toBe(409);
    expect(res.body.error.data.expectRevision).toBe(2);
    expect(res.body.error.data.actualRevision).toBe(4);
    expect([...res.body.error.data.changedPaths].sort()).toEqual(
      [`/nodes/${first}/visible`, `/nodes/${second}/visible`].sort(),
    );
  });

  it('scene.import 冲突同样带详情', async () => {
    const { h, roomId, first } = await setup();
    await call(h, 'node.update', { roomId, nodeId: first, patch: { name: 'b' } }, roomId);
    const exported = await call(h, 'scene.export', { roomId }, roomId);

    const res = await call(
      h,
      'scene.import',
      { roomId, doc: exported.body.result.doc, expectRevision: 0 },
      roomId,
    );
    expect(res.status).toBe(409);
    const data = res.body.error.data;
    expect(data.expectRevision).toBe(0);
    expect(data.actualRevision).toBe(2);
    expect(data.changedPaths).toEqual([`/nodes/${first}`, '/roots']);
  });

  it('改动过多时按 32 条截断并标 truncated', async () => {
    const { h, roomId, first } = await setup();
    const ops = Array.from({ length: 40 }, (_, i) => ({
      op: 'node.create',
      node: {
        id: `n_${String(i + 10).padStart(8, '0')}`,
        kind: 'group',
        name: `g-${i}`,
        parent: null,
        visible: true,
        transform: { p: [i, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
      },
    }));
    const applied = await call(h, 'ops.apply', { ops, baseRevision: 1 }, roomId);
    expect(applied.status).toBe(200);

    const res = await call(
      h,
      'ops.apply',
      { ops: [{ op: 'node.update', id: first, patch: { visible: false } }], baseRevision: 1 },
      roomId,
    );
    expect(res.status).toBe(409);
    expect(res.body.error.data.actualRevision).toBe(2);
    expect(res.body.error.data.changedPaths).toHaveLength(32);
    expect(res.body.error.data.truncated).toBe(true);
  });
});

describe('strict 写：?strict=1', () => {
  it('不带 baseRevision 的写直接 409 missingBase 且不落库', async () => {
    const { h, roomId, first } = await setup();
    const res = await post(h, `/r/${roomId}/rpc?strict=1`, {
      jsonrpc: '2.0',
      id: 1,
      method: 'ops.apply',
      params: { ops: [{ op: 'node.update', id: first, patch: { visible: false } }] },
    });
    const body: any = await res.json();
    expect(res.status).toBe(409);
    expect(codeOf(body)).toBe('E_CONFLICT');
    expect(body.error.data.reason).toBe('missingBase');
    expect(body.error.data.actualRevision).toBe(1);
    expect(body.error.data.next).toMatchObject({
      tool: 'vibe3d_ops_apply',
      params: { baseRevision: 1 },
    });
    expect(await revision(h, roomId)).toBe(1);
    const node = await call(h, 'node.get', { roomId, nodeId: first }, roomId);
    expect(node.body.result.visible).toBe(true);
  });

  it('strict 带正确 baseRevision 正常写；不带 strict 时旧行为不变', async () => {
    const { h, roomId, first } = await setup();
    const strict = await post(h, `/r/${roomId}/rpc?strict=1`, {
      jsonrpc: '2.0',
      id: 1,
      method: 'ops.apply',
      params: {
        ops: [{ op: 'node.update', id: first, patch: { visible: false } }],
        baseRevision: 1,
      },
    });
    expect(strict.status).toBe(200);
    expect(await revision(h, roomId)).toBe(2);

    const loose = await call(
      h,
      'ops.apply',
      { ops: [{ op: 'node.update', id: first, patch: { name: 'c' } }] },
      roomId,
    );
    expect(loose.status).toBe(200);
    expect(await revision(h, roomId)).toBe(3);
  });
});
