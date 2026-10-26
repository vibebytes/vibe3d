import { describe, expect, it } from 'vitest';
import { resolveMaterialPreset } from '@vibebyte/vibe3d-scene';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

const kf = (channel: string, v: number) => ({
  type: 'keyframes' as const,
  channel,
  keys: [
    { t: 0, v: 0 },
    { t: 1, v },
  ],
});

async function setup(h: Harness) {
  const created = await call(h, 'room.create', { name: 'clips' });
  const roomId = created.body.result.roomId;
  const made = await call(h, 'node.create', { roomId, kind: 'mesh', name: '箱', shape: 'box' }, roomId);
  return { roomId, nodeId: made.body.result.nodeId as string };
}

async function nodeGet(h: Harness, roomId: string, nodeId: string): Promise<any> {
  const { body } = await call(h, 'node.get', { roomId, nodeId }, roomId);
  return body.result;
}

describe('animation 读回闭环', () => {
  it('define 后 node.get 返回 clips 且 hasAnim=true，query 可召回', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await setup(h);
    const { body } = await call(h, 'animation.define', { roomId, nodeId, clip: kf('rz', 0.5) }, roomId);
    expect(body.error).toBeUndefined();

    const view = await nodeGet(h, roomId, nodeId);
    expect(view.hasAnim).toBe(true);
    expect(view.clips).toHaveLength(1);
    expect(view.clips[0].channel).toBe('rz');

    const q = await call(h, 'scene.query', { roomId, hasAnim: true }, roomId);
    const ids = q.body.result.nodes.map((n: any) => n.id);
    expect(ids).toContain(nodeId);
  });

  it('node.get 无 clip 时 clips 缺省且 hasAnim=false', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await setup(h);
    const view = await nodeGet(h, roomId, nodeId);
    expect(view.hasAnim).toBe(false);
    expect(view.clips).toBeUndefined();
  });
});

describe('多 clip：按通道追加/替换', () => {
  it('py 与 rz 两条并存', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await setup(h);
    await call(h, 'animation.define', { roomId, nodeId, clip: kf('py', 1) }, roomId);
    await call(h, 'animation.define', { roomId, nodeId, clip: kf('rz', 0.3) }, roomId);
    const view = await nodeGet(h, roomId, nodeId);
    expect(view.clips).toHaveLength(2);
    expect(view.clips.map((c: any) => c.channel).sort()).toEqual(['py', 'rz']);
  });

  it('同通道二次 define 替换而非叠加', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await setup(h);
    await call(h, 'animation.define', { roomId, nodeId, clip: kf('py', 1) }, roomId);
    await call(h, 'animation.define', { roomId, nodeId, clip: kf('py', 2) }, roomId);
    const view = await nodeGet(h, roomId, nodeId);
    expect(view.clips).toHaveLength(1);
    expect(view.clips[0].keys[1].v).toBe(2);
  });

  it('第 9 条报 E_LIMIT_EXCEEDED', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await setup(h);
    const channels = ['px', 'py', 'pz', 'rx', 'rz', 'sx', 'sy', 'sz'];
    for (const channel of channels) {
      const r = await call(h, 'animation.define', { roomId, nodeId, clip: kf(channel, 0.1) }, roomId);
      expect(r.body.error).toBeUndefined();
    }
    const ninth = await call(
      h,
      'animation.define',
      { roomId, nodeId, clip: { type: 'sway', axis: 'y', amplitude: 0.1 } },
      roomId,
    );
    expect(codeOf(ninth.body)).toBe('E_LIMIT_EXCEEDED');
  });

  it('clear 指定 channel 只清该通道', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await setup(h);
    await call(h, 'animation.define', { roomId, nodeId, clip: kf('py', 1) }, roomId);
    await call(h, 'animation.define', { roomId, nodeId, clip: kf('rz', 0.3) }, roomId);
    const cleared = await call(h, 'animation.clear', { roomId, nodeId, channel: 'py' }, roomId);
    expect(cleared.body.error).toBeUndefined();
    const view = await nodeGet(h, roomId, nodeId);
    expect(view.clips).toHaveLength(1);
    expect(view.clips[0].channel).toBe('rz');
  });
});

describe('play/stop 语义统一', () => {
  it('持 clip 的非 model 节点 play 不再报错（程序化按 at 采样）', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await setup(h);
    await call(h, 'animation.define', { roomId, nodeId, clip: kf('py', 1) }, roomId);
    const played = await call(h, 'animation.play', { roomId, nodeId }, roomId);
    expect(played.body.error).toBeUndefined();
    const stopped = await call(h, 'animation.stop', { roomId, nodeId }, roomId);
    expect(stopped.body.error).toBeUndefined();
  });

  it('无动画的非 model 节点 play 报错并提示 render.snapshot at', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await setup(h);
    const { body } = await call(h, 'animation.play', { roomId, nodeId }, roomId);
    expect(codeOf(body)).toBe('E_INVALID_PARAMS');
    expect(JSON.stringify(body)).toContain('render.snapshot');
  });
});

describe('animation.pose 姿势级定义', () => {
  it('一次定义两节点两通道并可撤销', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await setup(h);
    const made = await call(h, 'node.create', { roomId, kind: 'mesh', name: '头', shape: 'box' }, roomId);
    const other = made.body.result.nodeId as string;
    const { body } = await call(
      h,
      'animation.pose',
      { roomId, targets: [{ nodeId, clip: kf('rz', 0.5) }, { nodeId: other, clip: kf('ry', 0.3) }] },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect((await nodeGet(h, roomId, nodeId)).clips[0].channel).toBe('rz');
    expect((await nodeGet(h, roomId, other)).clips[0].channel).toBe('ry');
    const undone = await call(h, 'scene.undo', { roomId }, roomId);
    expect(undone.body.error).toBeUndefined();
    expect((await nodeGet(h, roomId, nodeId)).clips).toBeUndefined();
  });
});

describe('material preset：clay / porcelain', () => {
  it('clay 与 porcelain 是预设本体', () => {
    expect(resolveMaterialPreset('clay').preset).toBe('clay');
    expect(resolveMaterialPreset('porcelain').preset).toBe('porcelain');
  });

  it('描述词含预设名时直通该预设（如 matte clay warm grey → clay）', () => {
    const r = resolveMaterialPreset('matte clay warm grey');
    expect(r.preset).toBe('clay');
    expect(r.note).toBeTruthy();
  });

  it('ceramic 归一到 porcelain', () => {
    expect(resolveMaterialPreset('ceramic').preset).toBe('porcelain');
  });
});

describe('参数容错', () => {
  it('render.snapshot at 传字符串不再报 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const { roomId } = await setup(h);
    const { body } = await call(h, 'render.snapshot', { roomId, at: '1' }, roomId);
    expect(codeOf(body)).not.toBe('E_INVALID_PARAMS');
  });
});
