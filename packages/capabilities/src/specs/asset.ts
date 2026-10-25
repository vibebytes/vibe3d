import { assetMetaSchema, gltfReportSchema, nodeIdSchema, shaSchema } from '@vibebyte/vibe3d-protocol';
import { z } from 'zod';
import { roomId, transformInput } from './common';

const policyInput = z
  .enum(['strict', 'local', 'allow'])
  .optional()
  .describe('来源策略：local（缺省）只读资产根与本机地址；allow 放行任意本地路径与外网；strict 拒绝网络');

export const assetOps = {
  'node.import': {
    title: '导入 glTF/GLB 为 model 节点',
    input: z.object({
      roomId,
      src: z.string().min(1).optional(),
      sha: shaSchema.optional(),
      name: z.string().min(1).max(200).optional(),
      parent: nodeIdSchema.nullable().optional(),
      transform: transformInput.optional(),
      align: z.enum(['ground', 'center', 'none']).optional(),
      autoplay: z.boolean().optional(),
      policy: policyInput,
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
    cli: {
      command: 'model import',
      args: '<roomId> <src|--sha sha> [--name n] [--align ground|center|none] [--autoplay]',
    },
    errors: [
      'E_ASSET_FORMAT',
      'E_ASSET_EXTERNAL_REFS',
      'E_ASSET_MISSING',
      'E_PAYLOAD_TOO_LARGE',
      'E_UNSUPPORTED',
      'E_ROOM_NOT_FOUND',
    ] as const,
  },
  'asset.inspect': {
    title: '解析 glTF，返回尺寸、动画、蒙皮、外部引用',
    input: z.object({
      roomId,
      src: z.string().min(1),
      policy: policyInput,
    }),
    output: z.object({ sha: shaSchema, cached: z.boolean(), report: gltfReportSchema }),
    scope: 'room' as const,
    mutating: false,
    wire: 'asset.inspect' as const,
    mcp: { tool: 'vibe3d_inspect_asset' as const, annotations: { readOnlyHint: true } },
    cli: { command: 'asset inspect', args: '<roomId> <src>' },
    errors: ['E_ASSET_FORMAT', 'E_ASSET_EXTERNAL_REFS'] as const,
  },
  'asset.put': {
    title: '上传贴图 / HDRI / glb 模型并注册进房间资产表',
    input: z.object({
      roomId,
      src: z.string().min(1),
      kind: z.enum(['auto', 'image', 'hdri', 'model']).optional(),
      name: z.string().min(1).max(300).optional(),
      policy: policyInput,
    }),
    output: z.object({
      sha: shaSchema,
      meta: assetMetaSchema,
      revision: z.number().int().min(0),
    }),
    scope: 'room' as const,
    mutating: true,
    wire: 'asset.put' as const,
    mcp: { tool: 'vibe3d_put_asset' as const },
    cli: { command: 'asset put', args: '<roomId> <src> [--name n]' },
    errors: [
      'E_ASSET_FORMAT',
      'E_ASSET_TYPE',
      'E_PAYLOAD_TOO_LARGE',
      'E_UNSUPPORTED',
      'E_ROOM_NOT_FOUND',
    ] as const,
  },
  'asset.list': {
    title: '列出房间资产、引用计数与引用方',
    input: z.object({ roomId }),
    output: z.object({
      assets: z.array(assetMetaSchema),
      refs: z.record(shaSchema, z.number().int().min(0)),
      usedBy: z.record(shaSchema, z.array(z.union([nodeIdSchema, z.literal('env')]))),
    }),
    scope: 'room' as const,
    mutating: false,
    wire: 'asset.list' as const,
    mcp: { tool: 'vibe3d_list_assets' as const, annotations: { readOnlyHint: true } },
    cli: { command: 'asset ls', args: '<roomId>' },
    errors: ['E_ROOM_NOT_FOUND'] as const,
  },
  'asset.delete': {
    title: '移除未被引用的资产',
    input: z.object({ roomId, sha: shaSchema }),
    output: z.object({ revision: z.number().int().min(0) }),
    scope: 'room' as const,
    mutating: true,
    wire: 'asset.delete' as const,
    mcp: { tool: 'vibe3d_delete_asset' as const, annotations: { destructiveHint: true } },
    cli: { command: 'asset rm', args: '<roomId> <sha>' },
    errors: ['E_ASSET_MISSING', 'E_ASSET_IN_USE', 'E_ROOM_NOT_FOUND'] as const,
  },
};
