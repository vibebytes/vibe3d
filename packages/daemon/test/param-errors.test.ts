import { CAPABILITIES } from '@vibebyte/vibe3d-capabilities';
import { describe, expect, it } from 'vitest';
import { dispatch } from '../src/dispatch';
import { makeHarness } from './helpers/harness';

const harness = makeHarness();
const room = harness.rooms.create({ name: 'params' });

describe('参数校验错误的可诊断性', () => {
  it('message 带上出错字段与原因，而不是笼统的“参数校验失败”', async () => {
    const err = (await dispatch('room.close', { roomId: 'r_bad00000', purge: 'yes' }, harness.ctx).catch(
      (e) => e,
    )) as import('@vibebyte/vibe3d-protocol').AppError;
    expect(err.message).toContain('purge');
    const issues = (err.data as { issues?: Array<{ path: string }> }).issues ?? [];
    expect(issues[0]?.path).toBe('purge');
  });

  it('数字字符串按数字收下（width="1280"），不再因类型被拒', () => {
    const parsed = CAPABILITIES['render.snapshot'].input.safeParse({
      roomId: room.id,
      width: '1280',
      height: '720',
      settleMs: '120',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.width).toBe(1280);
  });

  it('geometry 别名 radius_top/radius_bottom（平铺与 patch.geometry 双路）被收下', async () => {
    const flat = (await dispatch(
      'node.create',
      { roomId: room.id, kind: 'mesh', shape: 'cylinder', radius_top: 0.2, radius_bottom: 0.4, height: 1 },
      harness.ctx,
    )) as { nodeId?: string };
    expect(flat.nodeId).toBeTruthy();

    const patch = (await dispatch(
      'node.update',
      {
        roomId: room.id,
        nodeId: flat.nodeId!,
        patch: { geometry: { type: 'cylinder', radius_top: 0.2, radius_bottom: 0.4, height: 1 } },
      },
      harness.ctx,
    )) as { revision?: number };
    expect(patch.revision).toBeGreaterThanOrEqual(0);
  });

  it('错误契约：data 附 hint 与 docRef，repair 可直接引用', async () => {
    const err = (await dispatch('node.create', { kind: 'mesh' }, harness.ctx).catch(
      (e) => e,
    )) as import('@vibebyte/vibe3d-protocol').AppError;
    const data = err.data as { hint?: string; docRef?: string };
    expect(typeof data.hint).toBe('string');
    expect(data.hint!.length).toBeGreaterThan(0);
    expect(data.docRef).toBe('#node-create');
  });
});
