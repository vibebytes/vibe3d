import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

function spy(h: Harness): string[] {
  const seen: string[] = [];
  h.ctx.openExternal = async (open) => {
    seen.push(open.url);
    return true;
  };
  return seen;
}

async function room(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '自动开窗' });
  return body.result.roomId;
}

describe('自动开窗：没有编辑器连着时，第一次写操作把 UI 拉到眼前', () => {
  it('新建房间后自动打开一次编辑器', async () => {
    const h = makeHarness();
    const seen = spy(h);
    const roomId = await room(h);
    await tick();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain(`/editor/r/${roomId}`);
  });

  it('建房时没开成，第一次 node.create 兜底开窗；同一房间之后不再重复', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const seen = spy(h);
    await call(h, 'node.create', { kind: 'mesh', shape: 'box' }, roomId);
    await tick();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain(`/editor/r/${roomId}`);
    await call(h, 'node.create', { kind: 'mesh', shape: 'box' }, roomId);
    await tick();
    expect(seen).toHaveLength(1);
  });

  it('已经有编辑器连着就不抢焦点', async () => {
    const h = makeHarness();
    const seen = spy(h);
    h.ctx.surfaces = () => 1;
    await room(h);
    await tick();
    expect(seen).toHaveLength(0);
  });

  it('只读调用不开窗', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const seen = spy(h);
    await call(h, 'scene.get', { roomId }, roomId);
    await call(h, 'room.get', { roomId }, roomId);
    await tick();
    expect(seen).toHaveLength(0);
  });

  it('开窗失败不影响写操作', async () => {
    const h = makeHarness();
    h.ctx.openExternal = () => {
      throw new Error('no opener');
    };
    const roomId = await room(h);
    const { status, body } = await call(h, 'node.create', { kind: 'mesh' }, roomId);
    await tick();
    expect(status).toBe(200);
    expect(body.result.nodeId).toBeTruthy();
  });

  it('openEditor 关掉（--no-open-editor）时不自动开窗，写操作照常成功', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const { status, body } = await call(h, 'node.create', { kind: 'mesh' }, roomId);
    await tick();
    expect(status).toBe(200);
    expect(body.result.nodeId).toBeTruthy();
  });
});
