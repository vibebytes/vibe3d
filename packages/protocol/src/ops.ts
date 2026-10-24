import { z } from 'zod';
import {
  assetMetaSchema,
  clipSchema,
  fxSchema,
  modelAnimSchema,
  sceneDocSchema,
  sceneNodeSchema,
} from './scene';
import {
  cameraNameSchema,
  cameraStateSchema,
  decalSchema,
  envSchema,
  fogSchema,
  fxIdSchema,
  geometrySchema,
  lightSpecSchema,
  mapTransformSchema,
  materialIdSchema,
  materialPresetSchema,
  materialSchema,
  nodeIdSchema,
  nprSchema,
  postSchema,
  shaSchema,
  stageStateSchema,
  transformPatchSchema,
  transformSchema,
} from './schema';

export const MAX_OPS_PER_APPLY = 500;

const stagePatchSchema = stageStateSchema.partial().extend({
  post: postSchema.nullable().optional(),
  npr: nprSchema.nullable().optional(),
});

const cameraPatchSchema = cameraStateSchema.partial();

const nodePatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  visible: z.boolean().optional(),
  transform: transformPatchSchema.optional(),
  light: lightSpecSchema.optional(),
  anim: modelAnimSchema.nullable().optional(),
  geometry: geometrySchema.optional(),
  material: materialIdSchema.optional(),
  sha: shaSchema.optional(),
  clip: clipSchema.nullable().optional(),
  decal: decalSchema.nullable().optional(),
});

export const opSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('node.create'), node: sceneNodeSchema }),
  z.object({ op: z.literal('node.update'), id: nodeIdSchema, patch: nodePatchSchema }),
  z.object({ op: z.literal('node.delete'), id: nodeIdSchema, cascade: z.boolean().optional() }),
  z.object({
    op: z.literal('node.reparent'),
    id: nodeIdSchema,
    parent: nodeIdSchema.nullable(),
    index: z.number().int().min(0).optional(),
  }),
  z.object({ op: z.literal('material.set'), id: materialIdSchema, material: materialSchema }),
  z.object({ op: z.literal('material.delete'), id: materialIdSchema, force: z.boolean().optional() }),
  z.object({
    op: z.literal('material.create'),
    id: materialIdSchema,
    preset: materialPresetSchema,
    params: materialSchema.partial().optional(),
  }),
  z.object({ op: z.literal('material.patch'), id: materialIdSchema, patch: materialSchema.partial() }),
  z.object({ op: z.literal('material.map'), id: materialIdSchema, map: mapTransformSchema.partial() }),
  z.object({
    op: z.literal('env.set'),
    env: envSchema
      .partial()
      .extend({ hdri: shaSchema.nullable().optional(), fog: fogSchema.nullable().optional() }),
  }),
  z.object({ op: z.literal('stage.set'), stage: stagePatchSchema }),
  z.object({
    op: z.literal('animation.play'),
    target: nodeIdSchema,
    clip: z.string().min(1).optional(),
    speed: z.number().finite().positive().optional(),
  }),
  z.object({ op: z.literal('animation.stop'), target: nodeIdSchema }),
  z.object({
    op: z.literal('animation.define'),
    target: nodeIdSchema,
    clip: clipSchema,
    applyTo: z.enum(['node', 'subtree']).optional(),
  }),
  z.object({
    op: z.literal('animation.clear'),
    target: nodeIdSchema,
    applyTo: z.enum(['node', 'subtree']).optional(),
  }),
  z.object({ op: z.literal('fx.create'), fx: fxSchema }),
  z.object({ op: z.literal('fx.delete'), id: fxIdSchema }),
  z.object({
    op: z.literal('camera.set'),
    camera: cameraPatchSchema.optional(),
    frame: z.enum(['fit', 'close', 'wide']).optional(),
    name: cameraNameSchema.optional(),
    preset: z.enum(['miniature_45']).optional(),
  }),
  z.object({
    op: z.literal('camera.save'),
    name: cameraNameSchema,
    camera: cameraPatchSchema.optional(),
  }),
  z.object({ op: z.literal('camera.delete'), name: cameraNameSchema }),
  z.object({ op: z.literal('asset.register'), asset: assetMetaSchema }),
  z.object({ op: z.literal('asset.unregister'), sha: shaSchema }),
  z.object({ op: z.literal('scene.replace'), doc: sceneDocSchema }),
]);

export const opListSchema = z.array(opSchema).max(MAX_OPS_PER_APPLY);

export type Op = z.infer<typeof opSchema>;
export type OpList = z.infer<typeof opListSchema>;
export type NodePatch = z.infer<typeof nodePatchSchema>;

export interface ApplyResult {
  revision: number;
  applied: number;
  warnings: string[];
}
