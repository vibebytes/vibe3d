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
});
