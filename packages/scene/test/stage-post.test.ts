import { opSchema, stageStateSchema } from '@vibebyte/vibe3d-protocol';
import { applyOps } from '@vibebyte/vibe3d-scene';
import { describe, expect, it } from 'vitest';
import { cubeDoc } from './helpers';

describe('stage.post 与 stage.npr', () => {
  it('post 深合并：先 bloom 再加 dof，两者都在', () => {
    const doc = cubeDoc();
    const first = applyOps(doc, [{ op: 'stage.set', stage: { post: { bloom: { intensity: 1.2 } } } }]);
    const second = applyOps(first.doc, [{ op: 'stage.set', stage: { post: { dof: { aperture: 0.03 } } } }]);
    expect(second.doc.stage.post).toEqual({
      bloom: { intensity: 1.2 },
      dof: { aperture: 0.03 },
    });
  });

  it('同一层字段增量更新，不丢另一个字段', () => {
    const doc = cubeDoc();
    const first = applyOps(doc, [
      { op: 'stage.set', stage: { post: { bloom: { intensity: 1, threshold: 0.8 } } } },
    ]);
    const second = applyOps(first.doc, [{ op: 'stage.set', stage: { post: { bloom: { intensity: 2 } } } }]);
    expect(second.doc.stage.post?.bloom).toEqual({ intensity: 2, threshold: 0.8 });
  });

  it('post:null 清空，逆操作带回旧值', () => {
    const doc = cubeDoc();
    const first = applyOps(doc, [{ op: 'stage.set', stage: { post: { bloom: { intensity: 1 } } } }]);
    const cleared = applyOps(first.doc, [{ op: 'stage.set', stage: { post: null } }]);
    expect(cleared.doc.stage.post).toBeUndefined();
    expect(cleared.inverse).toEqual([{ op: 'stage.set', stage: { post: { bloom: { intensity: 1 } } } }]);
  });

  it('npr 深合并 outline 与色阶', () => {
    const doc = cubeDoc();
    const first = applyOps(doc, [{ op: 'stage.set', stage: { npr: { rampSteps: 3 } } }]);
    const second = applyOps(first.doc, [{ op: 'stage.set', stage: { npr: { outline: { width: 1.5 } } } }]);
    expect(second.doc.stage.npr).toEqual({ rampSteps: 3, outline: { width: 1.5 } });
  });

  it('rampSteps 只接受 2..8', () => {
    expect(opSchema.safeParse({ op: 'stage.set', stage: { npr: { rampSteps: 1 } } }).success).toBe(false);
    expect(opSchema.safeParse({ op: 'stage.set', stage: { npr: { rampSteps: 9 } } }).success).toBe(false);
    expect(opSchema.safeParse({ op: 'stage.set', stage: { npr: { rampSteps: 2 } } }).success).toBe(true);
  });

  it('post.tonemap 只接受三种', () => {
    expect(
      stageStateSchema.safeParse({
        preset: 'clean',
        autoExposure: true,
        ground: true,
        keepModelLights: false,
        post: { tonemap: 'aces' },
      }).success,
    ).toBe(true);
    expect(
      stageStateSchema.safeParse({
        preset: 'clean',
        autoExposure: true,
        ground: true,
        keepModelLights: false,
        post: { tonemap: 'filmic' },
      }).success,
    ).toBe(false);
  });
});
