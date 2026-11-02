import type { ClipSpec } from '@vibebyte/vibe3d-protocol';
import type { GlbBone, GlbMaterial, GlbPrimitive, SkinnedModel } from './glb';

type Vec3 = [number, number, number];
type Mat3 = [number, number, number, number, number, number, number, number, number];

const HEAD = 1.66;
const SHOULDER = 1.46;
const HIP = 0.98;
const SEGMENTS = 16;
const CAP_RINGS = 5;
const BLEND = 0.06;

export const MANNEQUIN_BONES = [
  'Hips',
  'Spine',
  'Chest',
  'Neck',
  'Head',
  'UpperArm_L',
  'LowerArm_L',
  'Hand_L',
  'UpperLeg_L',
  'LowerLeg_L',
  'Foot_L',
  'UpperArm_R',
  'LowerArm_R',
  'Hand_R',
  'UpperLeg_R',
  'LowerLeg_R',
  'Foot_R',
] as const;

export type MannequinBone = (typeof MANNEQUIN_BONES)[number];
export type MannequinPose = 'stand' | 'jog_away';
export type MannequinColors = Partial<
  Record<'skin' | 'shirt' | 'shorts' | 'shoes', [number, number, number, number]>
>;

const PARENT: Record<MannequinBone, MannequinBone | null> = {
  Hips: null,
  Spine: 'Hips',
  Chest: 'Spine',
  Neck: 'Chest',
  Head: 'Neck',
  UpperArm_L: 'Chest',
  LowerArm_L: 'UpperArm_L',
  Hand_L: 'LowerArm_L',
  UpperLeg_L: 'Hips',
  LowerLeg_L: 'UpperLeg_L',
  Foot_L: 'LowerLeg_L',
  UpperArm_R: 'Chest',
  LowerArm_R: 'UpperArm_R',
  Hand_R: 'LowerArm_R',
  UpperLeg_R: 'Hips',
  LowerLeg_R: 'UpperLeg_R',
  Foot_R: 'LowerLeg_R',
};

/** Rest-pose joint positions in world space (character faces +Z, left side is +X). */
const JOINT: Record<MannequinBone, Vec3> = {
  Hips: [0, HIP, 0],
  Spine: [0, 1.12, 0],
  Chest: [0, 1.28, 0],
  Neck: [0, SHOULDER, 0],
  Head: [0, 1.56, 0],
  UpperArm_L: [0.19, SHOULDER, 0],
  LowerArm_L: [0.19, 1.18, 0],
  Hand_L: [0.19, 0.93, 0],
  UpperLeg_L: [0.09, 0.94, 0],
  LowerLeg_L: [0.09, 0.5, 0],
  Foot_L: [0.09, 0.08, 0],
  UpperArm_R: [-0.19, SHOULDER, 0],
  LowerArm_R: [-0.19, 1.18, 0],
  Hand_R: [-0.19, 0.93, 0],
  UpperLeg_R: [-0.09, 0.94, 0],
  LowerLeg_R: [-0.09, 0.5, 0],
  Foot_R: [-0.09, 0.08, 0],
};

const MATERIALS = ['skin', 'shirt', 'shorts', 'shoes'] as const;
type MaterialSlot = (typeof MATERIALS)[number];

const DEFAULT_COLORS: Record<MaterialSlot, [number, number, number, number]> = {
  skin: [0.84, 0.69, 0.56, 1],
  shirt: [0.32, 0.45, 0.62, 1],
  shorts: [0.18, 0.2, 0.24, 1],
  shoes: [0.9, 0.9, 0.88, 1],
};

interface PartSpec {
  name: string;
  bone: MannequinBone;
  /** Child bone this part blends into at its far end. */
  child?: MannequinBone;
  a: Vec3;
  b: Vec3;
  radius: number;
  material: MaterialSlot;
}

const side = (s: 'L' | 'R'): PartSpec[] => {
  const x = s === 'L' ? 1 : -1;
  const bone = (n: string) => `${n}_${s}` as MannequinBone;
  return [
    {
      name: `upperArm${s}`,
      bone: bone('UpperArm'),
      child: bone('LowerArm'),
      a: [0.19 * x, 1.44, 0],
      b: [0.19 * x, 1.2, 0],
      radius: 0.047,
      material: 'shirt',
    },
    {
      name: `elbow${s}`,
      bone: bone('LowerArm'),
      a: [0.19 * x, 1.18, 0],
      b: [0.19 * x, 1.18, 0],
      radius: 0.04,
      material: 'skin',
    },
    {
      name: `lowerArm${s}`,
      bone: bone('LowerArm'),
      child: bone('Hand'),
      a: [0.19 * x, 1.16, 0],
      b: [0.19 * x, 0.95, 0],
      radius: 0.037,
      material: 'skin',
    },
    {
      name: `hand${s}`,
      bone: bone('Hand'),
      a: [0.19 * x, 0.91, 0.005],
      b: [0.19 * x, 0.84, 0.005],
      radius: 0.034,
      material: 'skin',
    },
    {
      name: `thigh${s}`,
      bone: bone('UpperLeg'),
      child: bone('LowerLeg'),
      a: [0.09 * x, 0.92, 0],
      b: [0.09 * x, 0.53, 0],
      radius: 0.068,
      material: 'shorts',
    },
    {
      name: `knee${s}`,
      bone: bone('LowerLeg'),
      a: [0.09 * x, 0.5, 0],
      b: [0.09 * x, 0.5, 0],
      radius: 0.052,
      material: 'skin',
    },
    {
      name: `shin${s}`,
      bone: bone('LowerLeg'),
      child: bone('Foot'),
      a: [0.09 * x, 0.47, 0],
      b: [0.09 * x, 0.1, 0],
      radius: 0.047,
      material: 'skin',
    },
    {
      name: `foot${s}`,
      bone: bone('Foot'),
      a: [0.09 * x, 0.04, -0.04],
      b: [0.09 * x, 0.04, 0.15],
      radius: 0.04,
      material: 'shoes',
    },
  ];
};

const PARTS: PartSpec[] = [
  {
    name: 'pelvis',
    bone: 'Hips',
    a: [-0.06, 0.96, 0],
    b: [0.06, 0.96, 0],
    radius: 0.115,
    material: 'shorts',
  },
  {
    name: 'abdomen',
    bone: 'Spine',
    child: 'Chest',
    a: [0, 1.08, 0],
    b: [0, 1.24, 0],
    radius: 0.115,
    material: 'shirt',
  },
  { name: 'chest', bone: 'Chest', a: [-0.07, 1.33, 0], b: [0.07, 1.33, 0], radius: 0.125, material: 'shirt' },
  {
    name: 'neck',
    bone: 'Neck',
    child: 'Head',
    a: [0, 1.44, 0],
    b: [0, 1.55, 0],
    radius: 0.045,
    material: 'skin',
  },
  { name: 'head', bone: 'Head', a: [0, 1.6, 0.01], b: [0, 1.655, 0.01], radius: 0.095, material: 'skin' },
  ...side('L'),
  ...side('R'),
];

export interface MannequinPart {
  name: string;
  bone: MannequinBone;
  a: Vec3;
  b: Vec3;
  radius: number;
  primitive: number;
  firstVertex: number;
  vertexCount: number;
}

export interface MannequinRig {
  model: SkinnedModel;
  bones: MannequinBone[];
  /** Rest-pose world position of each bone's origin joint. */
  joints: Record<MannequinBone, Vec3>;
  parts: MannequinPart[];
  landmarks: { head: number; shoulder: number; hip: number };
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const smoothstep = (e0: number, e1: number, x: number): number => {
  const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
};

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

interface Weighted {
  joints: [number, number, number, number];
  weights: [number, number, number, number];
}

function weightOf(part: PartSpec, v: Vec3, index: (bone: MannequinBone) => number): Weighted {
  const own = index(part.bone);
  const pair = (from: number, to: number, s: number): Weighted =>
    s <= 0
      ? { joints: [from, 0, 0, 0], weights: [1, 0, 0, 0] }
      : s >= 1
        ? { joints: [to, 0, 0, 0], weights: [1, 0, 0, 0] }
        : { joints: [from, to, 0, 0], weights: [1 - s, s, 0, 0] };
  /** Signed distance past the joint between parent and child, measured along the bone that arrives there. */
  const past = (parent: MannequinBone, child: MannequinBone): number =>
    dot(sub(v, JOINT[child]), unit(sub(JOINT[child], JOINT[parent])));
  const near = (joint: MannequinBone): boolean => {
    const d = sub(v, JOINT[joint]);
    return Math.sqrt(dot(d, d)) < part.radius + BLEND + 0.01;
  };
  const parent = PARENT[part.bone];
  if (parent && near(part.bone)) {
    const along = past(parent, part.bone);
    if (along < BLEND) return pair(index(parent), own, smoothstep(-BLEND, BLEND, along));
  }
  if (part.child && near(part.child)) {
    const along = past(part.bone, part.child);
    if (along > -BLEND) return pair(own, index(part.child), smoothstep(-BLEND, BLEND, along));
  }
  return { joints: [own, 0, 0, 0], weights: [1, 0, 0, 0] };
}

interface Builder {
  positions: number[];
  normals: number[];
  joints: number[];
  weights: number[];
  indices: number[];
}

function capsule(out: Builder, part: PartSpec, index: (bone: MannequinBone) => number): number {
  const first = out.positions.length / 3;
  const degenerate = part.a.every((c, i) => c === part.b[i]);
  const u: Vec3 = degenerate ? [0, 1, 0] : unit(sub(part.b, part.a));
  const ref: Vec3 = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = unit(cross(u, ref));
  const e2 = cross(u, e1);
  const rows: Array<{ center: Vec3; phi: number }> = [];
  for (let i = 0; i <= CAP_RINGS; i += 1)
    rows.push({ center: part.a, phi: -Math.PI / 2 + (i / CAP_RINGS) * (Math.PI / 2) });
  for (let i = 0; i <= CAP_RINGS; i += 1) rows.push({ center: part.b, phi: (i / CAP_RINGS) * (Math.PI / 2) });
  for (const { center, phi } of rows) {
    for (let j = 0; j < SEGMENTS; j += 1) {
      const theta = (j / SEGMENTS) * Math.PI * 2;
      const n = add(
        add(scale(e1, Math.cos(phi) * Math.cos(theta)), scale(e2, Math.cos(phi) * Math.sin(theta))),
        scale(u, Math.sin(phi)),
      );
      const v = add(center, scale(n, part.radius));
      const w = weightOf(part, v, index);
      out.positions.push(...v);
      out.normals.push(...unit(n));
      out.joints.push(...w.joints);
      out.weights.push(...w.weights);
    }
  }
  for (let i = 0; i < rows.length - 1; i += 1) {
    for (let j = 0; j < SEGMENTS; j += 1) {
      const a = first + i * SEGMENTS + j;
      const b = first + i * SEGMENTS + ((j + 1) % SEGMENTS);
      const c = first + (i + 1) * SEGMENTS + ((j + 1) % SEGMENTS);
      const d = first + (i + 1) * SEGMENTS + j;
      out.indices.push(a, b, c, a, c, d);
    }
  }
  return out.positions.length / 3 - first;
}

/** A rigged, skinned 1.75 m mannequin in bind pose; seed perturbs limb thickness by up to ±4%. */
export function mannequinRig(spec: { seed?: number; colors?: MannequinColors } = {}): MannequinRig {
  const random = rng(spec.seed ?? 1);
  const index = (bone: MannequinBone) => MANNEQUIN_BONES.indexOf(bone);
  const bones: GlbBone[] = MANNEQUIN_BONES.map((name) => {
    const parent = PARENT[name];
    return {
      name,
      parent: parent ? index(parent) : null,
      translation: parent ? sub(JOINT[name], JOINT[parent]) : JOINT[name],
    };
  });
  const builders = MATERIALS.map(
    (): Builder => ({ positions: [], normals: [], joints: [], weights: [], indices: [] }),
  );
  const parts: MannequinPart[] = PARTS.map((spec) => {
    const part = { ...spec, radius: spec.radius * (1 + (random() - 0.5) * 0.08) };
    const primitive = MATERIALS.indexOf(part.material);
    const builder = builders[primitive] as Builder;
    const firstVertex = builder.positions.length / 3;
    const vertexCount = capsule(builder, part, index);
    return {
      name: part.name,
      bone: part.bone,
      a: part.a,
      b: part.b,
      radius: part.radius,
      primitive,
      firstVertex,
      vertexCount,
    };
  });
  const materials: GlbMaterial[] = MATERIALS.map((slot) => ({
    name: slot,
    color: spec.colors?.[slot] ?? DEFAULT_COLORS[slot],
    roughness: slot === 'skin' ? 0.55 : 0.85,
    metallic: 0,
  }));
  const primitives: GlbPrimitive[] = builders.map((b, material) => ({
    material,
    positions: Float32Array.from(b.positions),
    normals: Float32Array.from(b.normals),
    joints: Uint16Array.from(b.joints),
    weights: Float32Array.from(b.weights),
    indices: Uint32Array.from(b.indices),
  }));
  return {
    model: {
      name: 'mannequin',
      bones,
      materials,
      primitives,
      extras: { vibe3d: { kind: 'mannequin', bones: bones.map((b) => b.name) } },
    },
    bones: [...MANNEQUIN_BONES],
    joints: { ...JOINT },
    parts,
    landmarks: { head: HEAD, shoulder: SHOULDER, hip: HIP },
  };
}

const POSES: Record<MannequinPose, Partial<Record<MannequinBone, Vec3>>> = {
  stand: {
    UpperArm_L: [0, 0, 0.08],
    UpperArm_R: [0, 0, -0.08],
    LowerArm_L: [-0.12, 0, 0],
    LowerArm_R: [-0.12, 0, 0],
  },
  jog_away: {
    Hips: [0, Math.PI, 0],
    Spine: [0.12, 0, 0],
    UpperLeg_L: [-0.6, 0, 0],
    LowerLeg_L: [1.0, 0, 0],
    UpperLeg_R: [0.4, 0, 0],
    LowerLeg_R: [0.35, 0, 0],
    UpperArm_L: [0.5, 0, 0.08],
    LowerArm_L: [-1.2, 0, 0],
    UpperArm_R: [-0.5, 0, -0.08],
    LowerArm_R: [-1.2, 0, 0],
  },
};

/** A static pose as constant bone rotation tracks (euler XYZ, radians). */
export function mannequinPose(pose: MannequinPose): ClipSpec {
  return {
    tracks: Object.entries(POSES[pose]).map(([bone, v]) => ({
      path: `bone.${bone}.rotation`,
      interp: 'step' as const,
      keys: [{ t: 0, v }],
    })),
  };
}

function eulerXYZ([x, y, z]: Vec3): Mat3 {
  const [a, b, c, d, e, f] = [Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y), Math.cos(z), Math.sin(z)];
  return [
    c * e,
    -c * f,
    d,
    a * f + b * e * d,
    a * e - b * f * d,
    -b * c,
    b * f - a * e * d,
    b * e + a * f * d,
    a * c,
  ];
}

function mul(m: Mat3, n: Mat3): Mat3 {
  const out: number[] = new Array(9).fill(0);
  for (let r = 0; r < 3; r += 1)
    for (let c = 0; c < 3; c += 1)
      for (let k = 0; k < 3; k += 1)
        out[r * 3 + c] = (out[r * 3 + c] ?? 0) + (m[r * 3 + k] ?? 0) * (n[k * 3 + c] ?? 0);
  return out as Mat3;
}

const apply = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

/** World rotation and origin of each bone after local euler rotations (forward kinematics). */
export function boneWorld(
  bones: readonly GlbBone[],
  rotations: Readonly<Record<string, Vec3>>,
): Array<{ rotation: Mat3; origin: Vec3 }> {
  const out: Array<{ rotation: Mat3; origin: Vec3 }> = [];
  for (const bone of bones) {
    const local = eulerXYZ(rotations[bone.name] ?? [0, 0, 0]);
    const parent = bone.parent === null ? undefined : out[bone.parent];
    out.push(
      parent
        ? {
            rotation: mul(parent.rotation, local),
            origin: add(parent.origin, apply(parent.rotation, bone.translation)),
          }
        : { rotation: local, origin: bone.translation },
    );
  }
  return out;
}

/** CPU linear-blend skinning of every primitive for the given local bone rotations. */
export function skinVertices(model: SkinnedModel, rotations: Readonly<Record<string, Vec3>>): Float32Array[] {
  const world = boneWorld(model.bones, rotations);
  const rest = boneWorld(model.bones, {});
  return model.primitives.map((prim) => {
    const out = new Float32Array(prim.positions.length);
    for (let i = 0; i < prim.positions.length / 3; i += 1) {
      const v: Vec3 = [
        prim.positions[i * 3] ?? 0,
        prim.positions[i * 3 + 1] ?? 0,
        prim.positions[i * 3 + 2] ?? 0,
      ];
      let acc: Vec3 = [0, 0, 0];
      for (let k = 0; k < 4; k += 1) {
        const w = prim.weights[i * 4 + k] ?? 0;
        if (w === 0) continue;
        const j = prim.joints[i * 4 + k] ?? 0;
        const bone = world[j];
        const bind = rest[j];
        if (!bone || !bind) continue;
        acc = add(acc, scale(add(bone.origin, apply(bone.rotation, sub(v, bind.origin))), w));
      }
      out.set(acc, i * 3);
    }
    return out;
  });
}

/** Asset name `mesh.mannequin` registers; lets framing recognise the rig without reading the GLB. */
export const MANNEQUIN_ASSET = 'mannequin.glb';

let restRig: MannequinRig | undefined;

/** Model-space bounds of the mannequin skinned with the given local bone rotations. */
export function mannequinBox(rotations: Readonly<Record<string, Vec3>>): {
  min: Vec3;
  max: Vec3;
} {
  restRig ??= mannequinRig();
  const min: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: Vec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const positions of skinVertices(restRig.model, rotations)) {
    for (let i = 0; i < positions.length; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        const v = positions[i + k] ?? 0;
        min[k] = Math.min(min[k] ?? v, v);
        max[k] = Math.max(max[k] ?? v, v);
      }
    }
  }
  return { min, max };
}
