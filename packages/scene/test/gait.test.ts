import { describe, expect, it } from 'vitest';
import { sampleTrack } from '../src/anim';
import { GAIT_BONES, gaitClip } from '../src/gait';

const track = (clip: ReturnType<typeof gaitClip>, path: string) => {
  const found = clip.tracks?.find((t) => t.path === path);
  if (!found) throw new Error(`missing track ${path}`);
  return found;
};
const x = (clip: ReturnType<typeof gaitClip>, path: string, t: number): number =>
  (sampleTrack(track(clip, path), t) as number[])[0] ?? Number.NaN;

describe('gaitClip', () => {
  const walk = gaitClip({ style: 'walk' });
  const run = gaitClip({ style: 'run' });
  const T = run.duration ?? 0;

  it('is a looping clip of about 14 bone tracks over the documented bones', () => {
    expect(run.loop).toBe(true);
    expect(run.tracks?.length).toBeGreaterThanOrEqual(13);
    for (const t of run.tracks ?? []) {
      const bone = t.path.split('.')[1] ?? '';
      expect(GAIT_BONES).toContain(bone);
    }
  });

  it('every track returns to its start value after one period', () => {
    for (const style of ['walk', 'run', 'idle'] as const) {
      const clip = gaitClip({ style });
      for (const t of clip.tracks ?? []) {
        const a = sampleTrack(t, 0) as number[];
        const b = sampleTrack(t, clip.duration ?? 0) as number[];
        for (const [i, v] of a.entries()) expect(b[i]).toBeCloseTo(v, 9);
      }
    }
  });

  it('left leg is the right leg half a period later', () => {
    for (const t of [0, 0.13, 0.31, 0.5]) {
      expect(x(run, 'bone.UpperLeg_L.rotation', t)).toBeCloseTo(
        x(run, 'bone.UpperLeg_R.rotation', (t + T / 2) % T),
        6,
      );
    }
  });

  it('arms swing against the leg on the same side', () => {
    for (const t of [0.1, 0.2, 0.3]) {
      const leg = x(run, 'bone.UpperLeg_L.rotation', t);
      const arm = x(run, 'bone.UpperArm_L.rotation', t);
      expect(leg * arm).toBeLessThan(0);
    }
  });

  it('knees only flex, never hyperextend', () => {
    for (const clip of [walk, run]) {
      const d = clip.duration ?? 1;
      for (let i = 0; i <= 40; i += 1) {
        for (const side of ['L', 'R']) {
          expect(x(clip, `bone.LowerLeg_${side}.rotation`, (i / 40) * d)).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('run bobs more than walk', () => {
    const bob = (clip: ReturnType<typeof gaitClip>) => {
      const ys = Array.from({ length: 41 }, (_, i) => {
        const d = clip.duration ?? 1;
        return (sampleTrack(track(clip, 'bone.Hips.position'), (i / 40) * d) as number[])[1] ?? 0;
      });
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(bob(run)).toBeGreaterThan(bob(walk));
  });

  it('drift is stride * 2 / period straight ahead (+Z of the node), and zero for idle', () => {
    const c = gaitClip({ style: 'run', stride: 1.2, period: 0.6 });
    expect(c.drift).toEqual([0, 0, expect.closeTo((1.2 * 2) / 0.6, 9)]);
    expect(gaitClip({ style: 'idle' }).drift ?? [0, 0, 0]).toEqual([0, 0, 0]);
  });

  it('speed scales the clip time axis', () => {
    expect(gaitClip({ style: 'walk', speed: 2 }).speed).toBe(2);
  });
});
