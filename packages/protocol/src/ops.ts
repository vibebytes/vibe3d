import { z } from 'zod';
import { assetMetaSchema, clipSchema, fxSchema, modelAnimSchema, sceneDocSchema, sceneNodeSchema } from './scene';
import {
  cameraStateSchema,
  envSchema,
  fogSchema,
  fxIdSchema,
  geometrySchema,
  lightSpecSchema,
  materialIdSchema,
  materialSchema,
  nodeIdSchema,
  shaSchema,
  stageStateSchema,
  transformSchema,
} from './schema';

export const MAX_OPS_PER_APPLY = 500;

const nodePatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  visible: z.boolean().optional(),
  transform: transformSchema.optional(),
  light: lightSpecSchema.optional(),
  anim: modelAnimSchema.nullable().optional(),
  geometry: geometrySchema.optional(),
  material: materialIdSchema.optional(),
  sha: shaSchema.optional(),
  clip: clipSchema.nullable().optional(),
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
  z.object({ op: z.literal('material.delete'), id: materialIdSchema }),
  z.object({
    op: z.literal('env.set'),
    env: envSchema.partial().extend({ hdri: shaSchema.nullable().optional(), fog: fogSchema.nullable().optional() }),
  }),
  z.object({ op: z.literal('stage.set'), stage: stageStateSchema.partial() }),
  z.object({
    op: z.literal('animation.play'),
    target: nodeIdSchema,
    clip: z.string().min(1).optional(),
    speed: z.number().finite().positive().optional(),
  }),
  z.object({ op: z.literal('animation.stop'), target: nodeIdSchema }),
  z.object({ op: z.literal('animation.define'), target: nodeIdSchema, clip: clipSchema }),
  z.object({ op: z.literal('animation.clear'), target: nodeIdSchema }),
  z.object({ op: z.literal('fx.create'), fx: fxSchema }),
  z.object({ op: z.literal('fx.delete'), id: fxIdSchema }),
  z.object({
    op: z.literal('camera.set'),
    camera: cameraStateSchema.partial().optional(),
    frame: z.enum(['fit', 'close', 'wide']).optional(),
  }),
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
