import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

async function box(
  h: Harness,
  roomId: string,
  name: string,
  size: [number, number, number],
  p: [number, number, number],
): Promise<string> {
  const { body } = await call(
    h,
    'node.create',
    { roomId, kind: 'mesh', name, shape: 'box', size, transform: { p } },
    roomId,
  );
  return body.result.nodeId;
}

async function ground(h: Harness, roomId: string): Promise<void> {
  await call(
    h,
    'node.create',
    { roomId, kind: 'mesh', name: '地面', shape: 'box', size: [20, 0.2, 20], transform: { p: [0, -0.1, 0] } },
    roomId,
  );
}

describe('scene.stats', () => {
  it('统计节点、三角面与按类型分组', async () => {
    const h = makeHarness();
    const created = await call(h, 'room.create', { name: '统计' });
    const roomId = created.body.result.roomId;
    await ground(h, roomId);
    await box(h, roomId, '箱子', [1, 1, 1], [0, 0.5, 0]);
    await call(h, 'node.create', { roomId, kind: 'light', name: '主光' }, roomId);
    const { body } = await call(h, 'scene.stats', { roomId }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.nodes).toBe(3);
    expect(body.result.byKind).toEqual({ mesh: 2, light: 1 });
    expect(body.result.meshes).toBe(2);
    expect(body.result.tris).toBe(24);
    expect(body.result.materials).toBeGreaterThanOrEqual(1);
    expect(body.result.drawCallsEst).toBe(2);
  });
});

describe('scene.validate', () => {
  it('抓悬空、穿模、沉地三类几何问题', async () => {
    const h = makeHarness();
    const created = await call(h, 'room.create', { name: '体检' });
    const roomId = created.body.result.roomId;
    await ground(h, roomId);
    const floating = await box(h, roomId, '悬空箱', [1, 1, 1], [0, 1, 0]);
    const a = await box(h, roomId, 'A', [1, 1, 1], [3, 0.5, 0]);
    const b = await box(h, roomId, 'B', [1, 1, 1], [3.3, 0.5, 0]);
    const sunk = await box(h, roomId, '沉底箱', [1, 1, 1], [6, -2, 0]);

    const { body } = await call(h, 'scene.validate', { roomId }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.groundY).toBe(0);
    const codes = body.result.issues.map((i: any) => i.code).sort();
    expect(codes).toEqual(['belowGround', 'floating', 'intersect']);
    const floatingIssue = body.result.issues.find((i: any) => i.code === 'floating');
    expect(floatingIssue.nodeIds).toEqual([floating]);
    expect(floatingIssue.severity).toBe('warn');
    expect(floatingIssue.fixHint).toBeTruthy();
    const hit = body.result.issues.find((i: any) => i.code === 'intersect');
    expect(hit.nodeIds.sort()).toEqual([a, b].sort());
    const below = body.result.issues.find((i: any) => i.code === 'belowGround');
    expect(below.nodeIds).toEqual([sunk]);
    expect(body.result.stats.nodes).toBe(5);
  });

  it('ignore 与 checks 可裁剪结果', async () => {
    const h = makeHarness();
    const created = await call(h, 'room.create', { name: '裁剪' });
    const roomId = created.body.result.roomId;
    await ground(h, roomId);
    const floating = await box(h, roomId, '悬空箱', [1, 1, 1], [0, 1, 0]);
    const first = await call(h, 'scene.validate', { roomId }, roomId);
    expect(first.body.result.issues).toHaveLength(1);
    const ignored = await call(h, 'scene.validate', { roomId, ignore: [floating] }, roomId);
    expect(ignored.body.result.issues).toHaveLength(0);
    const onlyBelow = await call(h, 'scene.validate', { roomId, checks: ['belowGround'] }, roomId);
    expect(onlyBelow.body.result.issues).toHaveLength(0);
  });

  it('outsideBounds 用显式 bounds 判定', async () => {
    const h = makeHarness();
    const created = await call(h, 'room.create', { name: '出界' });
    const roomId = created.body.result.roomId;
    await ground(h, roomId);
    const far = await box(h, roomId, '远处', [1, 1, 1], [30, 0.5, 0]);
    const { body } = await call(
      h,
      'scene.validate',
      { roomId, checks: ['outsideBounds'], bounds: { min: [-5, -1, -5], max: [5, 1, 5] } },
      roomId,
    );
    expect(body.error).toBeUndefined();
    const ids = body.result.issues
      .filter((i: any) => i.code === 'outsideBounds')
      .flatMap((i: any) => i.nodeIds);
    expect(ids).toContain(far);
  });

  it('连通支撑图：叠在接地底座上的节点不误报 floating，真正脱离接触的孤岛才报 floating', async () => {
    const h = makeHarness();
    const created = await call(h, 'room.create', { name: '支撑图' });
    const roomId = created.body.result.roomId;
    await ground(h, roomId);
    // 接地底座 [0, 0.5, 0]（y: 0..1）
    await box(h, roomId, '底座', [2, 1, 2], [0, 0.5, 0]);
    // 站在底座上的二层柱体 [0, 1.5, 0]（y: 1..2，与底座顶面 y=1 接触）
    await box(h, roomId, '二层柱', [1, 1, 1], [0, 1.5, 0]);
    // 真正悬空的断枝 [4, 2.5, 0]（y: 2..3，无任何接触支撑）
    const disconnected = await box(h, roomId, '悬空断枝', [1, 1, 1], [4, 2.5, 0]);

    const { body } = await call(h, 'scene.validate', { roomId, checks: ['floating'] }, roomId);
    expect(body.error).toBeUndefined();
    const floatingIds = body.result.issues.flatMap((i: any) => i.nodeIds);
    expect(floatingIds).toEqual([disconnected]);
  });
});
