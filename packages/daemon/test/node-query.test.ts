import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function build(h: Harness): Promise<{ roomId: string; ids: string[] }> {
  const { body } = await call(h, 'room.create', { name: '查询' });
  const roomId = body.result.roomId;
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const created = await call(
      h,
      'node.create',
      {
        roomId,
        kind: 'mesh',
        name: `斑马线-${i + 1}`,
        shape: 'box',
        size: [1.2, 0.02, 0.6],
        transform: { p: [i * 1.5, 0.11, 0] },
      },
      roomId,
    );
    ids.push(created.body.result.nodeId);
  }
  const created = await call(
    h,
    'node.create',
    {
      roomId,
      kind: 'mesh',
      name: '路灯',
      shape: 'box',
      size: [0.2, 0.2, 0.2],
      transform: { p: [0, 1, 0] },
    },
    roomId,
  );
  ids.push(created.body.result.nodeId);
  return { roomId, ids };
}

describe('scene.query', () => {
  it('按名称查询并返回世界包围盒与材质', async () => {
    const h = makeHarness();
    const { roomId } = await build(h);
    const { body } = await call(h, 'scene.query', { roomId, name: '斑马' }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.total).toBe(3);
    expect(body.result.nodes[0]).toMatchObject({
      name: '斑马线-1',
      kind: 'mesh',
      parentId: null,
      visible: true,
    });
    expect(body.result.nodes[0].worldBbox).toEqual({ min: [-0.6, 0.1, -0.3], max: [0.6, 0.12, 0.3] });
    expect(body.result.nodes[0].materialId).toMatch(/^m_/);
  });

  it('minY 抓悬空节点，limit 分页给出 next', async () => {
    const h = makeHarness();
    const { roomId } = await build(h);
    const hanging = await call(h, 'scene.query', { roomId, minY: 0.9 }, roomId);
    expect(hanging.body.result.nodes.map((n: any) => n.name)).toEqual(['路灯']);
    const page = await call(h, 'scene.query', { roomId, kind: 'mesh', limit: 2 }, roomId);
    expect(page.body.result.total).toBe(4);
    expect(page.body.result.nodes).toHaveLength(2);
    expect(page.body.result.next).toBe(2);
    const next = await call(
      h,
      'scene.query',
      { roomId, kind: 'mesh', limit: 2, cursor: page.body.result.next },
      roomId,
    );
    expect(next.body.result.nodes).toHaveLength(2);
    expect(next.body.result.next).toBeUndefined();
  });

  it('非法 limit 报 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const { roomId } = await build(h);
    const { body } = await call(h, 'scene.query', { roomId, limit: 0 }, roomId);
    expect(codeOf(body)).toBe('E_INVALID_PARAMS');
  });
});

describe('node.get', () => {
  it('返回材质、世界包围盒与 children', async () => {
    const h = makeHarness();
    const { roomId, ids } = await build(h);
    const { body } = await call(h, 'node.get', { roomId, nodeId: ids[0] }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.id).toBe(ids[0]);
    expect(body.result.material).toMatchObject({ metalness: expect.any(Number) });
    expect(body.result.children).toEqual([]);
    expect(body.result.worldBbox.max[0]).toBeCloseTo(0.6);
  });

  it('节点不存在报 E_NODE_NOT_FOUND', async () => {
    const h = makeHarness();
    const { roomId } = await build(h);
    const { body } = await call(h, 'node.get', { roomId, nodeId: 'n_missing1' }, roomId);
    expect(codeOf(body)).toBe('E_NODE_NOT_FOUND');
  });
});
