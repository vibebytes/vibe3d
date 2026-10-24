import { AppError, ERROR_SPECS } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { toRpcFailure } from '../src/http/errors';
import { type Harness, call, codeOf, makeHarness } from './helpers/harness';

async function room(h: Harness): Promise<string> {
  const created = await call(h, 'room.create', { name: 'hint' });
  return created.body.result.roomId;
}

describe('error hint on the wire', () => {
  it('默认 hint 到达 RPC error.data（E_NODE_NOT_FOUND）', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const res = await call(h, 'node.get', { roomId, nodeId: 'n_00000000' }, roomId);
    expect(codeOf(res.body)).toBe('E_NODE_NOT_FOUND');
    expect(res.body.error?.data.hint).toBe(ERROR_SPECS.E_NODE_NOT_FOUND.hint);
    expect(res.status).toBe(404);
  });

  it('默认 hint 到达 RPC error.data（E_ROOM_NOT_FOUND）', async () => {
    const h = makeHarness();
    const res = await call(h, 'scene.get', { roomId: 'r_zzzzzzzz' }, 'r_zzzzzzzz');
    expect(codeOf(res.body)).toBe('E_ROOM_NOT_FOUND');
    expect(res.body.error?.data.hint).toBe(ERROR_SPECS.E_ROOM_NOT_FOUND.hint);
  });

  it('显式 data.hint 覆盖默认值', () => {
    const failure = toRpcFailure(new AppError('E_NODE_NOT_FOUND', '缺节点', { hint: '先用 scene.query' }));
    expect(failure.body.data.hint).toBe('先用 scene.query');
    expect(failure.status).toBe(404);
  });

  it('补 hint 时不丢原有 data 字段，也不改 E_INTERNAL 结构', () => {
    const conflict = toRpcFailure(new AppError('E_CONFLICT', '冲突', { changedPaths: ['a/x'], revision: 3 }));
    expect(conflict.body.data.changedPaths).toEqual(['a/x']);
    expect(conflict.body.data.revision).toBe(3);
    expect(conflict.body.data.hint).toBe(ERROR_SPECS.E_CONFLICT.hint);

    const internal = toRpcFailure(new Error('boom'));
    expect(internal.body.data).toEqual({ code: 'E_INTERNAL', retryable: true });
  });
});
