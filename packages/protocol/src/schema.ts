import { z } from 'zod';
import { FX_ID_RE, MATERIAL_ID_RE, NODE_ID_RE, SHA_RE } from './ids';

const finite = z.number().finite();
const unit = z.number().min(0).max(1);

export const vec3 = z.tuple([finite, finite, finite]);
export const rgb = z.tuple([unit, unit, unit]);
export const rgba = z.tuple([unit, unit, unit, unit]);

export const nodeIdSchema = z.string().regex(NODE_ID_RE, 'invalid node id');
export const fxIdSchema = z.string().regex(FX_ID_RE, 'invalid fx id');
export const materialIdSchema = z.string().regex(MATERIAL_ID_RE, 'invalid material id');
export const shaSchema = z.string().regex(SHA_RE, 'invalid sha256');

const nonZeroScale = finite.refine((v) => v !== 0, 'scale axis must be non-zero');

export const transformSchema = z.object({
  p: vec3,
  r: vec3,
  s: z.tuple([nonZeroScale, nonZeroScale, nonZeroScale]),
});

export const transformPatchSchema = z.object({
  p: vec3.optional(),
  r: vec3.optional(),
  s: z.tuple([nonZeroScale, nonZeroScale, nonZeroScale]).optional(),
});

const segments = z.number().int().min(3).max(128);

export const bakedGeometrySchema = z.object({
  type: z.literal('baked'),
  positions: z.array(finite).min(9).max(300_000),
  normals: z.array(finite).max(300_000).optional(),
  indices: z.array(z.number().int().min(0)).min(3).max(300_000),
  bbox: z.object({ min: vec3, max: vec3 }),
});

export const geometrySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('box'),
    size: z.tuple([finite.positive(), finite.positive(), finite.positive()]),
  }),
  z.object({ type: z.literal('sphere'), radius: finite.positive(), segments }),
  z.object({
    type: z.literal('cylinder'),
    radiusTop: finite.min(0),
    radiusBottom: finite.min(0),
    height: finite.positive(),
    segments,
  }),
  z.object({ type: z.literal('plane'), width: finite.positive(), height: finite.positive() }),
  bakedGeometrySchema,
]);

export const materialPresetSchema = z.enum(['concrete', 'rust', 'wet_moss', 'toon', 'water', 'glass']);

export const mapTransformSchema = z.object({
  sha: shaSchema,
  tiling: z.tuple([finite.positive(), finite.positive()]).optional(),
  offset: z.tuple([finite, finite]).optional(),
  rotation: finite.optional(),
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

export const assetImageSchema = z.object({
  width: z.number().int().min(0),
  height: z.number().int().min(0),
  hdri: z.boolean(),
});

export const lightSpecSchema = z.object({
  type: z.enum(['directional', 'point', 'spot', 'ambient']),
  color: rgba,
  intensity: finite.min(0),
  position: vec3.optional(),
  target: vec3.optional(),
  angle: finite.min(0).max(Math.PI).optional(),
  penumbra: unit.optional(),
  castShadow: z.boolean().optional(),
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
