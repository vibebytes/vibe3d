import { describe, expect, it } from 'vitest';
import { MANNEQUIN_BONES, mannequinPose, mannequinRig, skinVertices } from '../src/mannequin';

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const at = (arr: ArrayLike<number>, i: number): V => [
  arr[i * 3] ?? 0,
  arr[i * 3 + 1] ?? 0,
  arr[i * 3 + 2] ?? 0,
];

function closestOnSegment(p: V, a: V, b: V): V {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  const u = len2 === 0 ? 0 : Math.min(1, Math.max(0, dot(sub(p, a), ab) / len2));
  return [a[0] + ab[0] * u, a[1] + ab[1] * u, a[2] + ab[2] * u];
}

const rig = mannequinRig({ seed: 3 });
const boneIndex = (name: string) => rig.model.bones.findIndex((b) => b.name === name);

describe('mannequinRig skeleton', () => {
  it('has the documented humanoid bones with parents before children', () => {
    expect(rig.bones).toEqual([...MANNEQUIN_BONES]);
    for (const [i, bone] of rig.model.bones.entries()) {
      if (bone.parent !== null) expect(bone.parent).toBeLessThan(i);
    }
    expect(rig.model.bones[boneIndex('LowerLeg_L')]?.parent).toBe(boneIndex('UpperLeg_L'));
  });

  it('keeps the landmark heights and human proportions', () => {
    expect(rig.landmarks.hip).toBeCloseTo(0.98, 2);
    expect(rig.landmarks.shoulder).toBeCloseTo(1.46, 2);
    expect(rig.landmarks.head).toBeCloseTo(1.66, 2);
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let shoulderMinX = Number.POSITIVE_INFINITY;
    let shoulderMaxX = Number.NEGATIVE_INFINITY;
    for (const prim of rig.model.primitives) {
      for (let i = 0; i < prim.positions.length / 3; i += 1) {
        const [x, y] = at(prim.positions, i);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        if (Math.abs(y - 1.4) < 0.05) {
          shoulderMinX = Math.min(shoulderMinX, x);
          shoulderMaxX = Math.max(shoulderMaxX, x);
        }
      }
    }
    expect(Math.abs(maxY - minY - 1.75) / 1.75).toBeLessThan(0.02);
    expect(shoulderMaxX - shoulderMinX).toBeLessThan(0.6);
  });
});

describe('mannequinRig skin', () => {
  it('weights sum to 1 and joint indices are in range', () => {
    for (const prim of rig.model.primitives) {
      const n = prim.positions.length / 3;
      expect(prim.weights.length).toBe(n * 4);
      for (let i = 0; i < n; i += 1) {
        let sum = 0;
        for (let k = 0; k < 4; k += 1) {
          sum += prim.weights[i * 4 + k] ?? 0;
          expect(prim.joints[i * 4 + k]).toBeLessThan(rig.bones.length);
        }
        expect(sum).toBeCloseTo(1, 5);
      }
    }
  });

  it('normals point outward and triangle winding agrees with them', () => {
    for (const part of rig.parts) {
      const prim = rig.model.primitives[part.primitive];
      if (!prim) throw new Error('missing primitive');
      for (let i = part.firstVertex; i < part.firstVertex + part.vertexCount; i += 1) {
        const v = at(prim.positions, i);
        const n = at(prim.normals, i);
        expect(dot(n, sub(v, closestOnSegment(v, part.a, part.b)))).toBeGreaterThan(0);
      }
    }
    for (const prim of rig.model.primitives) {
      let agree = 0;
      let total = 0;
      for (let t = 0; t < prim.indices.length; t += 3) {
        const [i0, i1, i2] = [prim.indices[t] ?? 0, prim.indices[t + 1] ?? 0, prim.indices[t + 2] ?? 0];
        const p0 = at(prim.positions, i0);
        const face = cross(sub(at(prim.positions, i1), p0), sub(at(prim.positions, i2), p0));
        if (dot(face, face) < 1e-14) continue;
        total += 1;
        if (dot(face, at(prim.normals, i0)) > 0) agree += 1;
      }
      expect(agree).toBe(total);
    }
  });

  it('vertices owned mostly by LowerLeg_L sit inside the knee-to-ankle capsule', () => {
    const lower = boneIndex('LowerLeg_L');
    const knee = rig.joints.LowerLeg_L as V;
    const ankle = rig.joints.Foot_L as V;
    let count = 0;
    for (const prim of rig.model.primitives) {
      for (let i = 0; i < prim.positions.length / 3; i += 1) {
        const k = [0, 1, 2, 3].reduce((best, j) =>
          (prim.weights[i * 4 + j] ?? 0) > (prim.weights[i * 4 + best] ?? 0) ? j : best,
        );
        if (prim.joints[i * 4 + k] !== lower) continue;
        count += 1;
        const v = at(prim.positions, i);
        const d = sub(v, closestOnSegment(v, knee, ankle));
        expect(Math.sqrt(dot(d, d))).toBeLessThan(0.09);
      }
    }
    expect(count).toBeGreaterThan(50);
  });

  it('skinVertices: bending the knee moves the foot but not the thigh', () => {
    const bent = skinVertices(rig.model, { LowerLeg_L: [Math.PI / 2, 0, 0] });
    const footBone = boneIndex('Foot_L');
    const thighBone = boneIndex('UpperLeg_L');
    let footMoved = 0;
    let thighMoved = 0;
    for (const [p, prim] of rig.model.primitives.entries()) {
      const out = bent[p] as Float32Array;
      for (let i = 0; i < prim.positions.length / 3; i += 1) {
        const moved = Math.hypot(...sub(at(out, i), at(prim.positions, i)));
        const pure = (bone: number) => prim.joints[i * 4] === bone && (prim.weights[i * 4] ?? 0) === 1;
        if (pure(footBone)) footMoved = Math.max(footMoved, moved);
        if (pure(thighBone)) thighMoved = Math.max(thighMoved, moved);
      }
    }
    expect(footMoved).toBeGreaterThan(0.3);
    expect(thighMoved).toBeLessThan(1e-6);
  });
});

describe('mannequinPose', () => {
  it('stand and jog_away are bone rotation tracks', () => {
    for (const pose of ['stand', 'jog_away'] as const) {
      const clip = mannequinPose(pose);
      expect(clip.tracks?.length).toBeGreaterThan(0);
      for (const track of clip.tracks ?? []) {
        expect(track.path).toMatch(/^bone\.[A-Za-z_]+\.rotation$/);
        expect(MANNEQUIN_BONES).toContain(track.path.split('.')[1]);
      }
    }
  });

  it('seeds vary the build slightly but deterministically', () => {
    const a = mannequinRig({ seed: 1 }).model.primitives[0]?.positions;
    const b = mannequinRig({ seed: 1 }).model.primitives[0]?.positions;
    const c = mannequinRig({ seed: 2 }).model.primitives[0]?.positions;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
