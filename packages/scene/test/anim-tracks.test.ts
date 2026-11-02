import { clipSchema } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { applyNodeClips, bonePoses, boneTracksOf, sampleTrack } from '../src/anim';

const clip = (o: Record<string, unknown>): any => o;
const base = { p: [1, 2, 3], r: [0, 0, 0], s: [1, 1, 1] } as any;

const positionTrack = (interp?: string) => ({
  path: 'position',
  ...(interp ? { interp } : {}),
  keys: [
    { t: 0, v: [0, 0, 0] },
    { t: 2, v: [4, 0, 0] },
  ],
});

describe('只有 tracks 的 clip', () => {
  it('不产生 channel 增量', () => {
    const c = clip({ tracks: [positionTrack()] });
    expect(applyNodeClips(base, [c], 1).p).toEqual([2, 0, 0]);
  });
});

describe('通用属性轨道求值', () => {
  it('position 轨道是绝对覆盖，不是增量', () => {
    const c = clip({ type: 'keyframes', tracks: [positionTrack()] });
    expect(applyNodeClips(base, [c], 1).p).toEqual([2, 0, 0]);
    expect(applyNodeClips(base, [c], 0).p).toEqual([0, 0, 0]);
    expect(applyNodeClips(base, [c], 2).p).toEqual([4, 0, 0]);
  });

  it('rotation / scale 轨道分别写 r / s', () => {
    const rot = clip({
      type: 'keyframes',
      tracks: [
        {
          path: 'rotation',
          keys: [
            { t: 0, v: [0, 0, 0] },
            { t: 1, v: [0, Math.PI, 0] },
          ],
        },
      ],
    });
    expect(applyNodeClips(base, [rot], 0.5).r[1]).toBeCloseTo(Math.PI / 2, 9);
    const scale = clip({
      type: 'keyframes',
      tracks: [
        {
          path: 'scale',
          keys: [
            { t: 0, v: [1, 1, 1] },
            { t: 1, v: [2, 2, 2] },
          ],
        },
      ],
    });
    expect(applyNodeClips(base, [scale], 1).s).toEqual([2, 2, 2]);
  });

  it('interp=step 保持前一关键帧值', () => {
    const c = clip({ type: 'keyframes', tracks: [positionTrack('step')] });
    expect(applyNodeClips(base, [c], 1.9).p).toEqual([0, 0, 0]);
    expect(applyNodeClips(base, [c], 2).p).toEqual([4, 0, 0]);
  });

  it('interp=cubic 端点精确且单调', () => {
    const c = clip({
      type: 'keyframes',
      tracks: [
        {
          path: 'position',
          interp: 'cubic',
          keys: [
            { t: 0, v: [0, 0, 0] },
            { t: 1, v: [1, 0, 0] },
            { t: 2, v: [2, 0, 0] },
          ],
        },
      ],
    });
    expect(applyNodeClips(base, [c], 0).p[0]).toBeCloseTo(0, 9);
    expect(applyNodeClips(base, [c], 1).p[0]).toBeCloseTo(1, 9);
    expect(applyNodeClips(base, [c], 2).p[0]).toBeCloseTo(2, 9);
    let prev = Number.NEGATIVE_INFINITY;
    for (let i = 0; i <= 20; i += 1) {
      const v = applyNodeClips(base, [c], i / 10).p[0];
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });

  it('loop + duration 取模，非 loop 超出末帧保持末值', () => {
    const looped = clip({ type: 'keyframes', loop: true, duration: 2, tracks: [positionTrack()] });
    expect(applyNodeClips(base, [looped], 2.5).p).toEqual(applyNodeClips(base, [looped], 0.5).p);
    const once = clip({ type: 'keyframes', tracks: [positionTrack()] });
    expect(applyNodeClips(base, [once], 5).p).toEqual([4, 0, 0]);
  });

  it('tracks 先绝对求值，channel 增量再叠加', () => {
    const c = clip({
      type: 'keyframes',
      channel: 'py',
      keys: [
        { t: 0, v: 0 },
        { t: 1, v: 1 },
      ],
      tracks: [positionTrack()],
    });
    const out = applyNodeClips(base, [c], 1);
    expect(out.p).toEqual([2, 1, 0]);
  });

  it('visible / opacity 轨道通过 sampleTrack 求值', () => {
    const visible = {
      path: 'visible',
      interp: 'step',
      keys: [
        { t: 0, v: true },
        { t: 1, v: false },
      ],
    };
    expect(sampleTrack(visible as any, 0.5)).toBe(true);
    expect(sampleTrack(visible as any, 1)).toBe(false);
    const opacity = {
      path: 'opacity',
      keys: [
        { t: 0, v: 1 },
        { t: 1, v: 0 },
      ],
    };
    expect(sampleTrack(opacity as any, 0.25)).toBeCloseTo(0.75, 9);
  });

  it('bone.<name>.rotation 轨道按骨骼名求值，不影响节点 transform', () => {
    const c = clip({
      type: 'keyframes',
      tracks: [
        {
          path: 'bone.Hips.rotation',
          keys: [
            { t: 0, v: [0, 0, 0] },
            { t: 1, v: [0, 1, 0] },
          ],
        },
      ],
    });
    expect(applyNodeClips(base, [c], 0.5)).toEqual(base);
    expect(sampleTrack(c.tracks[0], 0.5)).toEqual([0, 0.5, 0]);
    expect(boneTracksOf(c)).toEqual([{ bone: 'Hips', property: 'rotation', track: c.tracks[0] }]);
  });

  it('bone 轨道名支持带点号的骨骼名', () => {
    const track = {
      path: 'bone.mixamorig.Hips.position',
      keys: [{ t: 0, v: [0, 0, 0] }],
    };
    expect(boneTracksOf(clip({ type: 'keyframes', tracks: [track] }))).toEqual([
      { bone: 'mixamorig.Hips', property: 'position', track },
    ]);
  });

  it('没有 tracks 的 clip 行为不变', () => {
    const c = clip({
      type: 'keyframes',
      channel: 'py',
      keys: [
        { t: 0, v: 0 },
        { t: 1, v: 2 },
      ],
    });
    expect(applyNodeClips(base, [c], 0.5).p).toEqual([1, 3, 3]);
  });
});

describe('additive tracks, drift and track limit', () => {
  it('blend:additive rotation adds onto the node transform', () => {
    const tilted = { p: [0, 0, 0], r: [0.2, 0, 0], s: [1, 1, 1] } as any;
    const c = clip({
      tracks: [
        {
          path: 'rotation',
          blend: 'additive',
          keys: [
            { t: 0, v: [0, 0, 0] },
            { t: 1, v: [0.5, 0, 0] },
          ],
        },
      ],
    });
    expect(applyNodeClips(tilted, [c], 1).r[0]).toBeCloseTo(0.7, 9);
  });

  it('drift moves the root by unwrapped time, not reset by the loop', () => {
    const c = clip({
      loop: true,
      duration: 0.7,
      drift: [0, 0, 3],
      tracks: [
        {
          path: 'rotation',
          blend: 'additive',
          keys: [
            { t: 0, v: [0, 0, 0] },
            { t: 0.7, v: [0, 0, 0] },
          ],
        },
      ],
    });
    expect(applyNodeClips(base, [c], 1.4).p[2]).toBeCloseTo(3 + 4.2, 9);
  });

  it('a clip accepts 32 tracks', () => {
    const tracks = Array.from({ length: 32 }, (_, i) => ({
      path: `bone.b${i}.rotation`,
      keys: [{ t: 0, v: [0, 0, 0] }],
    }));
    expect(clipSchema.safeParse({ tracks }).success).toBe(true);
  });
});

describe('bonePoses', () => {
  const rest = { p: [0, 1, 0], r: [0.1, 0, 0], s: [1, 1, 1] } as any;
  const baseOf = () => rest;

  it('keeps rotation and position tracks on the same bone', () => {
    const c = clip({
      tracks: [
        { path: 'bone.thigh.rotation', keys: [{ t: 0, v: [0.5, 0, 0] }] },
        { path: 'bone.thigh.position', keys: [{ t: 0, v: [0, 2, 0] }] },
      ],
    });
    const pose = bonePoses([c], 0, baseOf).get('thigh');
    expect(pose?.r[0]).toBeCloseTo(0.5, 9);
    expect(pose?.p[1]).toBeCloseTo(2, 9);
  });

  it('honours loop time and additive blend', () => {
    const c = clip({
      loop: true,
      duration: 1,
      tracks: [
        {
          path: 'bone.thigh.rotation',
          blend: 'additive',
          keys: [
            { t: 0, v: [0, 0, 0] },
            { t: 1, v: [1, 0, 0] },
          ],
        },
      ],
    });
    expect(bonePoses([c], 1.25, baseOf).get('thigh')?.r[0]).toBeCloseTo(0.1 + 0.25, 9);
  });
});
