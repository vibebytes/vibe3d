import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function room(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: 'cp' });
  return body.result.roomId;
}

async function shape(h: Harness, roomId: string, s: 'box' | 'sphere'): Promise<void> {
  await call(h, 'node.create', { roomId, kind: 'mesh', shape: s }, roomId);
}

describe('scene.checkpoint / scene.restore', () => {
  it('快照后改动可回滚，restore 前自动留底', async () => {
    const h = makeHarness({ persist: true });
    const roomId = await room(h);
    await shape(h, roomId, 'box');

    const cp = await call(h, 'scene.checkpoint', { roomId, name: 'baseline' }, roomId);
    expect(cp.status).toBe(200);
    expect(cp.body.result.checkpointId).toMatch(/^ck_/);
    expect(cp.body.result.revision).toBe(1);

    await shape(h, roomId, 'sphere');
    const list = await call(h, 'scene.checkpoints', { roomId }, roomId);
    expect(list.body.result.items).toHaveLength(1);
    expect(list.body.result.items[0].name).toBe('baseline');
    expect(list.body.result.items[0].revision).toBe(1);

    const files = readdirSync(join(h.dirs.rooms, roomId, 'checkpoints'));
    expect(files).toHaveLength(1);

    const restored = await call(
      h,
      'scene.restore',
      { roomId, checkpointId: cp.body.result.checkpointId },
      roomId,
    );
    expect(restored.body.result.revision).toBe(3);

    const after = await call(h, 'scene.get', { roomId }, roomId);
    expect(Object.keys(after.body.result.doc.nodes)).toHaveLength(1);

    const list2 = await call(h, 'scene.checkpoints', { roomId }, roomId);
    const names = list2.body.result.items.map((i: any) => i.name);
    expect(names).toContain('auto-before-restore');
    expect(list2.body.result.items).toHaveLength(2);
  });

  it('未知 checkpointId 报 E_CHECKPOINT_NOT_FOUND', async () => {
    const h = makeHarness({ persist: true });
    const roomId = await room(h);
    const res = await call(h, 'scene.restore', { roomId, checkpointId: 'ck_nope' }, roomId);
    expect(res.status).toBe(404);
    expect(codeOf(res.body)).toBe('E_CHECKPOINT_NOT_FOUND');
  });

  it('只保留最近 50 份检查点', async () => {
    const h = makeHarness({ persist: true });
    const roomId = await room(h);
    await shape(h, roomId, 'box');
    for (let i = 0; i < 55; i += 1) {
      await call(h, 'scene.checkpoint', { roomId, name: `cp-${i}` }, roomId);
    }
    const list = await call(h, 'scene.checkpoints', { roomId }, roomId);
    expect(list.body.result.items).toHaveLength(50);
    expect(list.body.result.items[0].name).toBe('cp-54');
    const files = readdirSync(join(h.dirs.rooms, roomId, 'checkpoints'));
    expect(files).toHaveLength(50);
  });
});
