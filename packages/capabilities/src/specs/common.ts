import { nodeIdSchema, vec3 } from '@vibebyte/vibe3d-protocol';
import { z } from 'zod';

export const roomId = z.string().regex(/^r_[a-z0-9]{8}$/);

export const intIn = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

export const numIn = (min: number, max: number) => z.coerce.number().min(min).max(max);

export const transformInput = z.object({
  p: vec3.optional(),
  r: vec3.optional(),
  s: vec3.optional(),
});

export const nodeRef = z.object({ nodeId: nodeIdSchema });

export const revisionOut = z.object({ revision: z.number().int().min(0) });

export const roomSummary = z.object({
  roomId,
  name: z.string(),
  revision: z.number().int().min(0),
  nodeCount: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
