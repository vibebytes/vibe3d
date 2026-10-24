import { z } from 'zod';
import { DOC_SCHEMA_VERSION } from './errors';
import {
  assetImageSchema,
  cameraStateSchema,
  envSchema,
  geometrySchema,
  lightSpecSchema,
  materialIdSchema,
  materialSchema,
  nodeIdSchema,
  shaSchema,
  stageStateSchema,
  transformSchema,
} from './schema';

export const modelAnimSchema = z.object({
  playing: z.boolean(),
  clip: z.string().min(1).optional(),
  speed: z.number().finite().positive(),
});

const nodeBase = {
  id: nodeIdSchema,
  name: z.string().min(1).max(200),
  parent: nodeIdSchema.nullable(),
  visible: z.boolean(),
  transform: transformSchema,
};

export const groupNodeSchema = z.object({ ...nodeBase, kind: z.literal('group') });
export const meshNodeSchema = z.object({
  ...nodeBase,
  kind: z.literal('mesh'),
  geometry: geometrySchema,
  material: materialIdSchema,
});
export const lightNodeSchema = z.object({ ...nodeBase, kind: z.literal('light'), light: lightSpecSchema });
export const modelNodeSchema = z.object({
  ...nodeBase,
  kind: z.literal('model'),
  sha: shaSchema,
  anim: modelAnimSchema.optional(),
});

export const sceneNodeSchema = z.discriminatedUnion('kind', [
  groupNodeSchema,
  meshNodeSchema,
  lightNodeSchema,
  modelNodeSchema,
]);

export const gltfAnimationSchema = z.object({
  name: z.string(),
  durationSec: z.number().finite().min(0),
  channels: z.number().int().min(0),
});

export const gltfReportSchema = z.object({
  version: z.literal('2.0'),
  selfContained: z.boolean(),
  missing: z.array(z.string()),
  extensions: z.array(z.string()),
  unsupported: z.array(z.string()),
  meshes: z.number().int().min(0),
  prims: z.number().int().min(0),
  tris: z.number().int().min(0),
  materials: z.number().int().min(0),
  textures: z.number().int().min(0),
  animations: z.array(gltfAnimationSchema),
  skins: z.number().int().min(0),
  size: z.object({
    min: z.tuple([z.number(), z.number(), z.number()]),
    max: z.tuple([z.number(), z.number(), z.number()]),
    diag: z.number().finite(),
  }),
  heroGuess: z.string().optional(),
});

export const assetMetaSchema = z.object({
  sha: shaSchema,
  bytes: z.number().int().min(0),
  name: z.string().max(300),
  mime: z.string().max(120),
  kind: z.enum(['gltf', 'image', 'bin']),
  gltf: gltfReportSchema.optional(),
  image: assetImageSchema.optional(),
});

export const sceneDocSchema = z.object({
  schemaVersion: z.literal(DOC_SCHEMA_VERSION),
  revision: z.number().int().min(0),
  name: z.string().max(120),
  nodes: z.record(nodeIdSchema, sceneNodeSchema),
  roots: z.array(nodeIdSchema),
  materials: z.record(materialIdSchema, materialSchema),
  assets: z.record(shaSchema, assetMetaSchema),
  env: envSchema,
  stage: stageStateSchema,
  camera: cameraStateSchema,
  updatedAt: z.string().min(1),
});

export type ModelAnim = z.infer<typeof modelAnimSchema>;
export type GroupNode = z.infer<typeof groupNodeSchema>;
export type MeshNode = z.infer<typeof meshNodeSchema>;
export type LightNode = z.infer<typeof lightNodeSchema>;
export type ModelNode = z.infer<typeof modelNodeSchema>;
export type SceneNode = z.infer<typeof sceneNodeSchema>;
export type GltfAnimation = z.infer<typeof gltfAnimationSchema>;
export type GltfReport = z.infer<typeof gltfReportSchema>;
export type AssetMeta = z.infer<typeof assetMetaSchema>;
export type SceneDoc = z.infer<typeof sceneDocSchema>;

export const DEFAULT_STAGE: z.infer<typeof stageStateSchema> = {
  preset: 'clean',
  autoExposure: true,
  ground: true,
  keepModelLights: false,
};

export const DEFAULT_ENV = {
  background: [0.043, 0.055, 0.071, 1] as [number, number, number, number],
  ambient: [1, 1, 1, 1] as [number, number, number, number],
  ambientIntensity: 0.35,
};

export const DEFAULT_CAMERA = {
  mode: 'persp' as const,
  p: [3.2, 2.2, 4.2] as [number, number, number],
  target: [0, 0.75, 0] as [number, number, number],
  fov: 45,
  zoom: 1,
};

export function emptyDoc(name = '未命名场景'): SceneDoc {
  return {
    schemaVersion: DOC_SCHEMA_VERSION,
    revision: 0,
    name,
    nodes: {},
    roots: [],
    materials: {},
    assets: {},
    env: DEFAULT_ENV,
    stage: { ...DEFAULT_STAGE },
    camera: { ...DEFAULT_CAMERA },
    updatedAt: new Date(0).toISOString(),
  };
}
