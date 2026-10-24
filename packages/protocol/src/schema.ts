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

const segments = z.number().int().min(3).max(128);

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
]);

export const materialSchema = z.object({
  baseColor: rgba,
  metalness: unit,
  roughness: unit,
  emissive: rgb,
  emissiveIntensity: finite.min(0),
  opacity: unit,
  doubleSided: z.boolean(),
  map: shaSchema.optional(),
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

export const cameraStateSchema = z.object({
  mode: z.enum(['persp', 'ortho']),
  p: vec3,
  target: vec3,
  fov: finite.min(1).max(179),
  zoom: finite.positive(),
});

export const stageStateSchema = z.object({
  preset: z.enum(['cine', 'clean', 'flat']),
  exposure: finite.min(0.1).max(8).optional(),
  autoExposure: z.boolean(),
  ground: z.boolean(),
  keepModelLights: z.boolean(),
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
export type Geometry = z.infer<typeof geometrySchema>;
export type Material = z.infer<typeof materialSchema>;
export type LightSpec = z.infer<typeof lightSpecSchema>;
export type CameraState = z.infer<typeof cameraStateSchema>;
export type StageState = z.infer<typeof stageStateSchema>;
export type Fog = z.infer<typeof fogSchema>;
export type Env = z.infer<typeof envSchema>;
