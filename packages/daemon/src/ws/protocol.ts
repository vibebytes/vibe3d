import { z } from 'zod';

export const serverFrameSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    protocolVersion: z.string(),
    roomId: z.string(),
    revision: z.number().int(),
    editors: z.number().int().optional(),
  }),
  z.object({
    type: z.literal('event'),
    event: z.enum([
      'scene.changed',
      'selection.changed',
      'job.progress',
      'job.done',
      'surface.presence',
      'snapshot.request',
    ]),
    data: z.record(z.unknown()),
  }),
  z.object({ type: z.literal('overflow'), revision: z.number().int() }),
  z.object({ type: z.literal('pong'), t: z.number() }),
]);

export const clientFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ping'), t: z.number().optional() }),
  z.object({
    type: z.literal('snapshot.result'),
    requestId: z.string(),
    png: z.string().optional(),
    mime: z.string().optional(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    bytes: z.number().int().optional(),
    uploaded: z.boolean().optional(),
    code: z.string().optional(),
    error: z.string().optional(),
  }),
  z.object({ type: z.literal('selection.changed'), ids: z.array(z.string()) }),
]);

export type ServerFrame = z.infer<typeof serverFrameSchema>;
export type ClientFrame = z.infer<typeof clientFrameSchema>;

export function encodeFrame(frame: ServerFrame): string {
  return JSON.stringify(frame);
}

export function decodeClientFrame(raw: string): ClientFrame | null {
  try {
    const parsed = clientFrameSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
