import { describe, expect, it } from 'vitest';
import { type Harness, call, codeOf, makeHarness } from './helpers/harness';

async function room(h: Harness): Promise<string> {
  const created = await call(h, 'room.create', { name: '预算' });
  return created.body.result.roomId;
}

async function box(h: Harness, roomId: string, name: string): Promise<void> {
  await call(
    h,
    'node.create',
    { roomId, kind: 'mesh', name, shape: 'box', size: [1, 1, 1], transform: { p: [0, 0.5, 0] } },
    roomId,
  );
}

describe('scene.stats budget', () => {
  it('不传 budget 时输出与旧行为一致（无 budget 键）', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    await box(h, roomId, '箱子');
    const { body } = await call(h, 'scene.stats', { roomId }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.nodes).toBe(1);
    expect('budget' in body.result).toBe(false);
  });

  it('传 budget 且在限内时回余量与占比', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    await box(h, roomId, '箱子');
    const { body } = await call(
      h,
      'scene.stats',
      { roomId, budget: { maxNodes: 10, maxTris: 100, maxTextures: 4 } },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(body.result.budget.over).toEqual([]);
    expect(body.result.budget.metrics.maxNodes.remaining).toBe(9);
    expect(body.result.budget.metrics.maxTris.limit).toBe(100);
  });

  it('超限但未 enforce 时正常返回并列超限项与负余量', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    await box(h, roomId, '箱子甲');
    await box(h, roomId, '箱子乙');
    const { body } = await call(h, 'scene.stats', { roomId, budget: { maxTris: 20 } }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.budget.over).toEqual(['maxTris']);
    expect(body.result.budget.metrics.maxTris.remaining).toBe(-4);
  });

  it('enforce 超限时报 E_BUDGET_EXCEEDED 并带欠量说明', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    await box(h, roomId, '箱子甲');
    await box(h, roomId, '箱子乙');
    const { body } = await call(
      h,
      'scene.stats',
      { roomId, budget: { maxTris: 20, maxNodes: 1 }, enforce: true },
      roomId,
    );
    expect(codeOf(body)).toBe('E_BUDGET_EXCEEDED');
    expect(body.error.data.over).toEqual(['maxNodes', 'maxTris']);
    expect(body.error.data.hint).toContain('节点超出 1');
  });

  it('enforce 且未超限时照常返回统计', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    await box(h, roomId, '箱子');
    const { body } = await call(
      h,
      'scene.stats',
      { roomId, budget: { maxNodes: 5 }, enforce: true },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(body.result.budget.over).toEqual([]);
  });
});
