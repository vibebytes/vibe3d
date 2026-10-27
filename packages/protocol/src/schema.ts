import { z } from 'zod';
import { FX_ID_RE, MATERIAL_ID_RE, NODE_ID_RE, SHA_RE } from './ids';

const finite = z.number().finite();
const unit = z.number().min(0).max(1);

export const vec3 = z.tuple([finite, finite, finite]);
export const rgb = z.tuple([unit, unit, unit]);
export const rgba = z.tuple([unit, unit, unit, unit]);

export const nodeIdSchema = z.string().regex(NODE_ID_RE, 'invalid node id');
export const nodeRefSchema = z.union([nodeIdSchema, z.string().regex(/^@\S{1,200}$/, 'invalid node ref')]);
export const fxIdSchema = z.string().regex(FX_ID_RE, 'invalid fx id');
export const materialIdSchema = z.string().regex(MATERIAL_ID_RE, 'invalid material id');
export const shaSchema = z.string().regex(SHA_RE, 'invalid sha256');

export const tagSchema = z.string().min(1).max(32);
export const tagsSchema = z.array(tagSchema).max(16);

const nonZeroScale = finite.refine((v) => v !== 0, 'scale axis must be non-zero');

export const transformSchema = z.object({
  p: vec3.describe('世界坐标位置'),
  r: vec3.describe(
    '欧拉角，弧度；XYZ 顺序（R = Rx·Ry·Rz，先绕固定轴 Z、再 Y、再 X）；绕 Z 转 30° 即 [0,0,0.5236]',
  ),
  s: z.tuple([nonZeroScale, nonZeroScale, nonZeroScale]).describe('各轴缩放因子，不可为 0'),
});

export const transformPatchSchema = z.object({
  p: vec3.optional(),
  r: vec3.describe('欧拉角，弧度；XYZ 顺序（R = Rx·Ry·Rz）；绕 Z 转 30° 即 [0,0,0.5236]').optional(),
  s: z.tuple([nonZeroScale, nonZeroScale, nonZeroScale]).optional(),
});

const segments = z.number().int().min(3).max(128).default(32);

export const bakedGeometrySchema = z.object({
  type: z.literal('baked'),
  positions: z.array(finite).min(9).max(300_000),
  normals: z.array(finite).max(300_000).optional(),
  indices: z.array(z.number().int().min(0)).min(3).max(300_000),
  bbox: z.object({ min: vec3, max: vec3 }),
});

const issue = (message: string) => ({ code: z.ZodIssueCode.custom, message });

const cylinderSnakeRadius = (raw: unknown): unknown => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const src = raw as Record<string, unknown>;
  const g: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    if (key === 'radius_top' || key === 'radius_bottom') continue;
    g[key] = src[key];
  }
  if (g.radiusTop === undefined && 'radius_top' in src) g.radiusTop = src.radius_top;
  if (g.radiusBottom === undefined && 'radius_bottom' in src) g.radiusBottom = src.radius_bottom;
  return g;
};

const cylinderGeometrySchema = z
  .preprocess(
    cylinderSnakeRadius,
    z
      .object({
        type: z.literal('cylinder'),
        radius: finite
          .positive()
          .optional()
          .describe('统一半径（旧写法）；radius 与 radiusTop/radiusBottom 互斥'),
        radiusTop: finite
          .min(0)
          .optional()
          .describe('顶面半径；与 radiusBottom 成对给出，接受 radius_top 别名'),
        radiusBottom: finite
          .min(0)
          .optional()
          .describe('底面半径；radiusTop=0 即圆锥，接受 radius_bottom 别名'),
        height: finite.positive(),
        segments,
      })
      .superRefine((g, ctx) => {
        const [top, bottom] = [g.radiusTop !== undefined, g.radiusBottom !== undefined];
        if (g.radius !== undefined) {
          if (top || bottom) ctx.addIssue(issue('cylinder takes radius or radiusTop/radiusBottom, not both'));
          return;
        }
        if (!top && !bottom) {
          ctx.addIssue(issue('cylinder needs radius, or radiusTop and radiusBottom'));
          return;
        }
        if (!top || !bottom) ctx.addIssue(issue('radiusTop and radiusBottom must be given together'));
      }),
  )
  .transform((g) => ({
    type: g.type,
    radiusTop: g.radius ?? g.radiusTop!,
    radiusBottom: g.radius ?? g.radiusBottom!,
    height: g.height,
    segments: g.segments,
  }));

const torusGeometrySchema = z
  .object({
    type: z.literal('torus'),
    radius: finite.positive().describe('主环半径 R（环心到管心距离）'),
    tube: finite.positive().describe('管截面半径 r，须小于 radius；接受 tube_radius 别名'),
    segments,
  })
  .superRefine((g, ctx) => {
    if (g.tube >= g.radius) ctx.addIssue(issue('torus tube must be smaller than radius'));
  });

const capsuleGeometrySchema = z.object({
  type: z.literal('capsule'),
  radius: finite.positive().describe('截面半径 r'),
  height: finite.positive().describe('圆柱中段长度；总高 = height + 2*radius'),
  segments,
});

export const FIELD_ALIASES: Readonly<Record<string, string>> = {
  radius_top: 'radiusTop',
  radius_bottom: 'radiusBottom',
  tube_radius: 'tube',
  name_prefix: 'namePrefix',
  updated_before: 'updatedBefore',
};

const applyGeometryAliases = (g: unknown): unknown => {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return g;
  const out: Record<string, unknown> = { ...(g as Record<string, unknown>) };
  for (const [from, to] of Object.entries(FIELD_ALIASES)) {
    if (out[from] !== undefined && out[to] === undefined) out[to] = out[from];
    delete out[from];
  }
  return out;
};

export const geometrySchema = z.preprocess(
  applyGeometryAliases,
  z.union([
    z.object({
      type: z.literal('box'),
      size: z.tuple([finite.positive(), finite.positive(), finite.positive()]),
    }),
    z.object({ type: z.literal('sphere'), radius: finite.positive(), segments }),
    cylinderGeometrySchema,
    torusGeometrySchema,
    capsuleGeometrySchema,
    z.object({ type: z.literal('plane'), width: finite.positive(), height: finite.positive() }),
    bakedGeometrySchema,
  ]),
);

interface RawNodeGeometryOp {
  id?: unknown;
  node?: { id?: unknown; geometry?: unknown } | null;
  patch?: { geometry?: unknown } | null;
}

function cylinderWithRadiusAlias(geometry: unknown): boolean {
  if (!geometry || typeof geometry !== 'object') return false;
  const g = geometry as { type?: unknown; radius?: unknown };
  return g.type === 'cylinder' && g.radius !== undefined;
}

export function legacyGeometryNotes(input: { ops?: ReadonlyArray<unknown> }): string[] {
  const notes: string[] = [];
  for (const entry of input.ops ?? []) {
    const op = (entry ?? {}) as RawNodeGeometryOp;
    if (!cylinderWithRadiusAlias(op.node?.geometry ?? op.patch?.geometry)) continue;
    const raw = op.node?.id ?? op.id;
    const id = typeof raw === 'string' ? raw : 'unknown';
    notes.push(`节点 ${id} 的圆柱用了旧写法 radius，已按上下同半径展开；请改用 radiusTop / radiusBottom`);
  }
  return notes;
}

export const materialPresetSchema = z.enum([
  'concrete',
  'clay',
  'porcelain',
  'rust',
  'wet_moss',
  'toon',
  'water',
  'glass',
]);

export const mapTransformSchema = z.object({
  sha: shaSchema,
  tiling: z.tuple([finite.positive(), finite.positive()]).optional(),
  offset: z.tuple([finite, finite]).optional(),
  rotation: finite.describe('贴图旋转，弧度（THREE.Texture.rotation 同域）；转 45° 传 0.7854').optional(),
  channel: z.union([z.literal(0), z.literal(1)]).optional(),
  uv: z
    .object({
      offset: z.tuple([finite, finite]).optional(),
      repeat: z.tuple([finite.positive(), finite.positive()]).optional(),
      rotation: finite.optional(),
      channel: z.union([z.literal(0), z.literal(1)]).optional(),
    })
    .optional(),
});

export const materialMapSchema = z.union([shaSchema, mapTransformSchema]);

export const decalSchema = z
  .object({
    text: z.string().min(1).max(200).optional(),
    imageSha: shaSchema.optional(),
    color: rgba.optional(),
    background: rgba.optional(),
    fontSize: z.number().int().min(8).max(512).optional(),
    bold: z.boolean().optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
  })
  .refine((v) => Boolean(v.text) !== Boolean(v.imageSha), {
    message: 'decal 需要且只能给出 text 或 imageSha',
  });

export const materialSchema = z.object({
  baseColor: rgba,
  metalness: unit,
  roughness: unit,
  emissive: rgb,
  emissiveIntensity: finite.min(0),
  opacity: unit,
  doubleSided: z.boolean(),
  map: materialMapSchema.optional(),
});

export const materialPatchSchema = materialSchema.partial().extend({ color: rgba.optional() });

export const assetImageSchema = z.object({
  width: z.number().int().min(0),
  height: z.number().int().min(0),
  hdri: z.boolean(),
});

export const lightSpecSchema = z
  .object({
    type: z.enum(['directional', 'point', 'spot', 'ambient', 'area']),
    color: rgba,
    intensity: finite.min(0),
    position: vec3.optional(),
    target: vec3.optional(),
    angle: finite.min(0).max(Math.PI).optional(),
    penumbra: unit.optional(),
    width: finite.positive().optional(),
    height: finite.positive().optional(),
    castShadow: z.boolean().optional(),
  })
  .superRefine((light, ctx) => {
    const area = light.type === 'area';
    if (!area && (light.width !== undefined || light.height !== undefined)) {
      ctx.addIssue({ code: 'custom', path: ['width'], message: 'width/height only apply to area lights' });
    }
    if (area && light.castShadow) {
      ctx.addIssue({ code: 'custom', path: ['castShadow'], message: 'area lights cannot cast shadows' });
    }
  });

export const cameraNameSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'invalid camera name');

export const cameraStateSchema = z.object({
  mode: z.enum(['persp', 'ortho']),
  p: vec3,
  target: vec3,
  fov: finite.min(1).max(179),
  zoom: finite.positive(),
});

export const nprSchema = z.object({
  outline: z
    .object({
      width: finite.min(0).max(10).optional(),
      color: rgba.optional(),
    })
    .optional(),
  rampSteps: z.number().int().min(2).max(8).optional(),
  rim: unit.optional(),
});

export const postSchema = z.object({
  dof: z
    .object({
      aperture: finite.min(0).max(1).optional(),
      focusDistance: finite.min(0).max(100).optional(),
    })
    .optional(),
  bloom: z
    .object({
      intensity: finite.min(0).max(5).optional(),
      threshold: finite.min(0).max(2).optional(),
    })
    .optional(),
  ssao: z
    .object({
      radius: finite.min(0).max(5).optional(),
      intensity: finite.min(0).max(5).optional(),
    })
    .optional(),
  tonemap: z.enum(['aces', 'linear', 'reinhard']).optional(),
});

export const stageStateSchema = z.object({
  preset: z.enum(['cine', 'clean', 'flat']),
  exposure: finite.min(0.1).max(8).optional(),
  autoExposure: z.boolean(),
  ground: z.boolean(),
  keepModelLights: z.boolean(),
  post: postSchema.optional(),
  npr: nprSchema.optional(),
});

export const fogSchema = z.object({
  color: rgba.optional(),
  near: finite.min(0),
  far: finite.min(0),
});

export const envSchema = z.object({
  background: rgba,
  ambient: rgba,
  ambientIntensity: finite.min(0),
  hdri: shaSchema.optional(),
  fog: fogSchema.optional(),
  gradient: z.object({ top: rgba, bottom: rgba }).nullable().optional(),
});

export type Vec3 = z.infer<typeof vec3>;
export type Rgb = z.infer<typeof rgb>;
export type Rgba = z.infer<typeof rgba>;
export type Transform = z.infer<typeof transformSchema>;
export type TransformPatch = z.infer<typeof transformPatchSchema>;
export type Geometry = z.infer<typeof geometrySchema>;
export type MaterialPreset = z.infer<typeof materialPresetSchema>;
export type Material = z.infer<typeof materialSchema>;
export type MapTransform = z.infer<typeof mapTransformSchema>;
export type MaterialMap = z.infer<typeof materialMapSchema>;
export type LightSpec = z.infer<typeof lightSpecSchema>;
export type CameraState = z.infer<typeof cameraStateSchema>;
export type Npr = z.infer<typeof nprSchema>;
export type Post = z.infer<typeof postSchema>;
export type StageState = z.infer<typeof stageStateSchema>;
export type Fog = z.infer<typeof fogSchema>;
export type Env = z.infer<typeof envSchema>;
