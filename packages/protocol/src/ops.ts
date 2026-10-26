import { z } from 'zod';
import {
  assetMetaSchema,
  clipSchema,
  fxSchema,
  modelAnimSchema,
  newNodeSchema,
  sceneDocSchema,
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
  materialPatchSchema,
  materialSchema,
  nodeIdSchema,
  nodeRefSchema,
  nprSchema,
  postSchema,
  shaSchema,
  stageStateSchema,
  tagsSchema,
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
  clips: z.array(clipSchema).max(8).nullable().optional(),
  tags: tagsSchema.nullable().optional(),
  decal: decalSchema.nullable().optional(),
});

export const opSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('node.create'), node: newNodeSchema }),
  z.object({ op: z.literal('node.update'), id: nodeRefSchema, patch: nodePatchSchema }),
  z.object({ op: z.literal('node.delete'), id: nodeRefSchema, cascade: z.boolean().optional() }),
  z.object({
    op: z.literal('node.reparent'),
    id: nodeRefSchema,
    parent: nodeRefSchema.nullable(),
    index: z.number().int().min(0).optional(),
  }),
  z.object({ op: z.literal('material.set'), id: materialIdSchema, material: materialSchema }),
  z.object({ op: z.literal('material.delete'), id: materialIdSchema, force: z.boolean().optional() }),
  z.object({
    op: z.literal('material.create'),
    id: materialIdSchema,
    preset: z.string().min(1).max(60).optional(),
    params: materialSchema.partial().optional(),
  }),
  z.object({ op: z.literal('material.patch'), id: materialIdSchema, patch: materialPatchSchema }),
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
    loop: z.boolean().optional(),
    direction: z.enum(['forward', 'reverse']).optional(),
    weight: z.number().finite().min(0).max(1).optional(),
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
    channel: z.enum(['px', 'py', 'pz', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz']).optional(),
  }),
  z.object({
    op: z.literal('animation.pose'),
    targets: z
      .array(z.object({ nodeId: nodeIdSchema, clip: clipSchema }))
      .min(1)
      .max(64),
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
