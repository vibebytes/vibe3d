import { gltfReportSchema, nodeIdSchema, shaSchema } from '@vibebyte/vibe3d-protocol';
import { z } from 'zod';
import { roomId, transformInput } from './common';

export const assetOps = {
  'node.import': {
    title: '导入 glTF/GLB 为 model 节点',
    input: z.object({
      roomId,
      src: z.string().min(1),
      name: z.string().min(1).max(200).optional(),
      parent: nodeIdSchema.nullable().optional(),
      transform: transformInput.optional(),
      autoplay: z.boolean().optional(),
      policy: z.enum(['strict', 'local', 'allow']).optional(),
    }),
    output: z.object({
      nodeId: nodeIdSchema,
      sha: shaSchema,
      revision: z.number().int().min(0),
      report: gltfReportSchema,
    }),
    scope: 'room' as const,
    mutating: true,
    wire: 'scene.apply' as const,
    mcp: { tool: 'vibe3d_import_asset' as const },
    cli: { command: 'model import', args: '<roomId> <src> [--name n] [--autoplay]' },
    errors: ['E_ASSET_FORMAT', 'E_ASSET_EXTERNAL_REFS', 'E_PAYLOAD_TOO_LARGE', 'E_UNSUPPORTED'] as const,
  },
  'asset.inspect': {
    title: '解析 glTF，返回尺寸、动画、蒙皮、外部引用',
    input: z.object({
      roomId,
      src: z.string().min(1),
      policy: z.enum(['strict', 'local', 'allow']).optional(),
    }),
    output: z.object({ sha: shaSchema, cached: z.boolean(), report: gltfReportSchema }),
    scope: 'room' as const,
    mutating: false,
    wire: 'asset.inspect' as const,
    mcp: { tool: 'vibe3d_inspect_asset' as const, annotations: { readOnlyHint: true } },
    cli: { command: 'asset inspect', args: '<roomId> <src>' },
    errors: ['E_ASSET_FORMAT', 'E_ASSET_EXTERNAL_REFS'] as const,
  },
};
