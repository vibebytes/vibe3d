import { describe, expect, it, vi } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

async function room(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '可见性' });
  return body.result.roomId;
}

const STAGE = { preset: 'clean', autoExposure: true, ground: true, keepModelLights: false } as const;

describe('ops.apply：editor 未连接时必须说清楚', () => {
  it('editors 为 0 时附上打开编辑器的 hint 与链接', async () => {
    const h = makeHarness();
    h.ctx.surfaces = () => 0;
    const roomId = await room(h);
    const { body } = await call(h, 'ops.apply', { roomId, ops: [{ op: 'stage.set', stage: STAGE }] }, roomId);
    expect(body.result.editors).toBe(0);
    expect(body.result.hint).toContain('vibe3d_open_editor');
    expect(body.result.hint).toContain(`/editor/r/${roomId}`);
  });

  it('已有 editor 连接时不给「未打开」提示', async () => {
    const h = makeHarness();
    h.ctx.surfaces = () => 1;
    const roomId = await room(h);
    const created = await call(h, 'node.create', { roomId, kind: 'mesh', shape: 'box' }, roomId);
    expect(created.body.result.nodeId).toBeTruthy();
    const { body } = await call(h, 'ops.apply', { roomId, ops: [{ op: 'stage.set', stage: STAGE }] }, roomId);
    expect(body.result.editors).toBe(1);
    expect(body.result.hint).toBeUndefined();
  });
});

describe('editor.open：真的把浏览器打开', () => {
  it('默认调用 openExternal 并回报 opened:true', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const seen: string[] = [];
    h.ctx.openExternal = (url) => {
      seen.push(url);
      return true;
    };
    const { body } = await call(h, 'editor.open', { roomId }, roomId);
    expect(body.result.opened).toBe(true);
    expect(body.result.url).toContain(`/editor/r/${roomId}`);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(body.result.url);
  });

  it('open:false 只回链接，不打开浏览器', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const spy = vi.fn();
    h.ctx.openExternal = spy;
    const { body } = await call(h, 'editor.open', { roomId, open: false }, roomId);
    expect(body.result.opened).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('浏览器拉不起来时 opened:false 并给出可复制的链接', async () => {
    const h = makeHarness();
    h.ctx.openExternal = () => false;
    const roomId = await room(h);
    const { body } = await call(h, 'editor.open', { roomId }, roomId);
    expect(body.result.opened).toBe(false);
    expect(body.result.hint).toContain(body.result.url);
  });

  it('异步打开（spawn 成功）才回报 opened:true', async () => {
    const h = makeHarness();
    h.ctx.openExternal = async () => true;
    const roomId = await room(h);
    const { body } = await call(h, 'editor.open', { roomId }, roomId);
    expect(body.result.opened).toBe(true);
    expect(body.result.hint).toBeUndefined();
  });

  it('未注入 openExternal 时明确告知「只回了链接」', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const { body } = await call(h, 'editor.open', { roomId }, roomId);
    expect(body.result.opened).toBe(false);
    expect(body.result.hint).toContain('open:false');
  });

  it('回报当前编辑器的连接数', async () => {
    const h = makeHarness();
    h.ctx.surfaces = () => 2;
    const roomId = await room(h);
    const { body } = await call(h, 'editor.open', { roomId, open: false }, roomId);
    expect(body.result.editors).toBe(2);
  });
});
