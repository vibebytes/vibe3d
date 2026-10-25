import { z } from 'zod';

export const systemOps = {
  'system.status': {
    title: '能力探测：渲染器是否就绪、能否出 id-pass、快照与载荷上限；先查再调渲染工具',
    input: z.object({}),
    output: z.object({
      daemonVersion: z.string(),
      protocolVersion: z.string(),
      renderer: z.object({
        name: z.string(),
        ready: z.boolean(),
        idPass: z.boolean(),
      }),
      limits: z.object({
        snapshotMaxPixels: z.number().int().min(0),
        snapshotTimeoutMs: z.number().int().min(0),
        wsPayloadBytes: z.number().int().min(0),
      }),
      notes: z.array(z.string()),
    }),
    scope: 'daemon' as const,
    mutating: false,
    wire: 'system.status' as const,
    mcp: { tool: 'vibe3d_status' as const, annotations: { readOnlyHint: true } },
    cli: { command: 'status', args: '' },
    errors: [] as const,
  },
};
