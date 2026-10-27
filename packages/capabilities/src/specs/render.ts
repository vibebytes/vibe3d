import { cameraNameSchema, cameraStateSchema, nodeIdSchema, rgb } from '@vibebyte/vibe3d-protocol';
import { z } from 'zod';
import { intIn, numIn, revisionOut, roomId } from './common';

const frameMode = z.enum(['fit', 'close', 'wide']);
const viewName = z.enum(['front', 'back', 'left', 'right', 'top', 'three_quarter']);
const targetBox = z.object({
  min: z.tuple([z.number(), z.number(), z.number()]),
  max: z.tuple([z.number(), z.number(), z.number()]),
});
export const shadingMode = z.enum(['flat', 'wireframe', 'normals', 'material', 'rendered']);
export const overlayKind = z.enum([
  'grid',
  'axes',
  'bbox',
  'ground',
  'centerline',
  'scale',
  'normal',
  'dims',
]);

export const qualityLevel = z.enum(['draft', 'standard', 'high']);

export const fogMode = z.enum(['doc', 'off', 'auto']);

const shotCamera = z.object({
  position: z.tuple([z.number(), z.number(), z.number()]),
  target: z.tuple([z.number(), z.number(), z.number()]),
});

const roiRect = z.object({
  x: intIn(0, 4095),
  y: intIn(0, 4095),
  w: intIn(1, 4096),
  h: intIn(1, 4096),
});

const cameraOverride = z.object({
  position: z.tuple([z.number(), z.number(), z.number()]).optional(),
  p: z.tuple([z.number(), z.number(), z.number()]).optional(),
  target: z.tuple([z.number(), z.number(), z.number()]).optional(),
  fov: z.number().min(1).max(179).optional(),
});

export const framingParam = z
  .enum(['camera', 'scene'])
  .default('camera')
  .describe(
    '取景来源：camera=尊重 doc 当前机位（默认，不自动取景）；scene=按场景 bbox 自动取景。显式传 camera 时优先于 framing。',
  );

const framingEcho = z.object({
  source: z.enum(['camera', 'scene']),
  center: z.tuple([z.number(), z.number(), z.number()]).optional(),
  fov: z.number().optional(),
});

const roiEcho = {
  frame: z.object({ width: z.number().int(), height: z.number().int() }).optional(),
  roi: z
    .object({ x: z.number().int(), y: z.number().int(), w: z.number().int(), h: z.number().int() })
    .optional(),
};

const fogReport = z.object({
  enabled: z.boolean(),
  color: rgb,
  near: z.number().finite(),
  far: z.number().finite(),
  mode: fogMode,
  reason: z.enum(['shading', 'option']).optional(),
});

const shotReport = {
  fog: fogReport.nullable(),
  distanceToTarget: z.number().finite().nullable(),
  warning: z.string().nullable(),
};

export const qualityPreset = z.object({
  level: qualityLevel,
  pixelRatio: z.number().positive(),
  samples: z.number().int().min(0),
  shadowMapSize: z.number().int().min(64),
  supersample: z.boolean(),
});

const imageOpts = {
  width: intIn(64, 4096).optional(),
  height: intIn(64, 4096).optional(),
  format: z.enum(['png', 'jpeg']).optional(),
  settleMs: intIn(0, 10_000).optional(),
  at: numIn(0, 3600).optional(),
  transparent: z.boolean().optional(),
  shading: shadingMode.optional(),
  overlay: z.array(overlayKind).max(8).optional(),
  highlight: z.array(nodeIdSchema).max(200).optional(),
  isolate: z.array(nodeIdSchema).max(200).optional(),
  quality: qualityLevel.optional(),
  fog: fogMode.optional(),
  roi: roiRect.optional(),
};

const pickImageOpts = {
  width: imageOpts.width,
  height: imageOpts.height,
  settleMs: imageOpts.settleMs,
  at: imageOpts.at,
  transparent: imageOpts.transparent,
  shading: imageOpts.shading,
  overlay: imageOpts.overlay,
  highlight: imageOpts.highlight,
  isolate: imageOpts.isolate,
};

export const jobStateSchema = z.enum(['queued', 'running', 'done', 'failed', 'cancelled']);

export const jobKindSchema = z.enum(['export.glb', 'render.sequence']);

export const jobViewSchema = z.object({
  jobId: z.string().min(1),
  kind: jobKindSchema,
  roomId: z.string().min(1),
  state: jobStateSchema,
  pct: z.number().min(0).max(1),
  phase: z.string().optional(),
  url: z.string().optional(),
  bytes: z.number().int().min(0).optional(),
  revision: z.number().int().min(0).optional(),
  frames: z.number().int().min(0).optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
});

export const renderOps = {
  'camera.set': {
    title: '设相机：显式参数、自动取景、已存机位或预设',
    input: z.object({
      roomId,
      camera: cameraStateSchema.partial().optional(),
      frame: frameMode.optional(),
      name: cameraNameSchema.optional(),
      preset: z.enum(['miniature_45']).optional(),
      bbox: targetBox.optional(),
      padding: numIn(0.2, 5).optional(),
      view: viewName.optional(),
    }),
    output: revisionOut.extend({
      camera: cameraStateSchema,
      frame: z
        .object({
          source: z.enum(['bbox', 'ids', 'scene']),
          bounds: targetBox,
          diag: z.number().finite(),
          view: viewName,
          padding: z.number().finite(),
        })
        .optional(),
    }),
    scope: 'room' as const,
    mutating: true,
    wire: 'camera.set' as const,
    cli: {
      command: 'camera set',
      args: '<roomId> [--frame fit] [--name hero] [--preset miniature_45] [--p x,y,z] [--target x,y,z]',
    },
    errors: ['E_INVALID_PARAMS', 'E_CAMERA_NOT_FOUND', 'E_ROOM_NOT_FOUND'] as const,
  },
  'camera.save': {
    title: '保存当前机位，供之后按名字恢复',
    input: z.object({
      roomId,
      name: cameraNameSchema,
      camera: cameraStateSchema.partial().optional(),
    }),
    output: revisionOut.extend({
      camera: cameraStateSchema,
      cameras: z.record(cameraNameSchema, cameraStateSchema),
    }),
    scope: 'room' as const,
    mutating: true,
    wire: 'camera.save' as const,
    cli: { command: 'camera save', args: '<roomId> --name hero' },
    errors: ['E_INVALID_PARAMS', 'E_ROOM_NOT_FOUND'] as const,
  },
  'camera.delete': {
    title: '删除已存机位',
    input: z.object({ roomId, name: cameraNameSchema }),
    output: revisionOut.extend({
      camera: cameraStateSchema,
      cameras: z.record(cameraNameSchema, cameraStateSchema),
    }),
    scope: 'room' as const,
    mutating: true,
    wire: 'camera.delete' as const,
    mcp: { annotations: { destructiveHint: true } },
    cli: { command: 'camera rm', args: '<roomId> <name>' },
    errors: ['E_CAMERA_NOT_FOUND', 'E_ROOM_NOT_FOUND'] as const,
  },
  'render.snapshot': {
    title:
      '离屏渲染一张图：默认尊重 doc 当前机位（framing:"camera"）；framing:"scene" 按 bbox 自动取景；camera 可临时覆盖取景（不落盘）',
    input: z.object({
      roomId,
      camera: cameraOverride.optional(),
      framing: framingParam,
      ...imageOpts,
    }),
    output: z.object({
      revision: z.number().int().min(0),
      mime: z.string(),
      base64: z.string(),
      width: z.number().int(),
      height: z.number().int(),
      quality: qualityPreset,
      ...shotReport,
      camera: shotCamera.nullable(),
      framing: framingEcho.optional(),
      ...roiEcho,
    }),
    scope: 'room' as const,
    mutating: false,
    wire: 'render.snapshot' as const,
    mcp: {
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    cli: {
      command: 'render snapshot',
      args: '<roomId> [--out shot.png] [--size 1280x720] [--format png] [--settle-ms 180] [--at 1.2] [--transparent]',
    },
    errors: ['E_RENDER_UNAVAILABLE', 'E_ROOM_NOT_FOUND'] as const,
  },
  'render.views': {
    title: '多视角出图：一次拿到 1–6 张带标签、可对照的截图',
    input: z.object({
      roomId,
      views: z.array(viewName).min(1).max(6).optional(),
      nodeIds: z.array(nodeIdSchema).max(20).optional(),
      ...imageOpts,
    }),
    output: z.object({
      revision: z.number().int().min(0),
      target: targetBox,
      views: z.array(
        z.object({
          view: viewName,
          label: z.string(),
          mime: z.string(),
          base64: z.string(),
          width: z.number().int(),
          height: z.number().int(),
          camera: cameraStateSchema,
          ...shotReport,
          ...roiEcho,
        }),
      ),
      partial: z.boolean(),
      failedView: viewName.nullable(),
      failures: z.array(z.object({ view: viewName, code: z.string(), message: z.string() })),
      quality: qualityPreset,
    }),
    scope: 'room' as const,
    mutating: false,
    wire: 'render.views' as const,
    mcp: {
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    cli: {
      command: 'render views',
      args: '<roomId> [--views front,top] [--node id] [--size 1280x720] [--out dir]',
    },
    errors: ['E_RENDER_UNAVAILABLE', 'E_ROOM_NOT_FOUND', 'E_INVALID_PARAMS'] as const,
  },
  'render.node': {
    title: '单资产特写：自动框选一个节点并怼近拍一张',
    input: z.object({
      roomId,
      nodeId: nodeIdSchema,
      view: viewName.optional(),
      padding: numIn(0.2, 5).optional(),
      ...imageOpts,
    }),
    output: z.object({
      revision: z.number().int().min(0),
      nodeId: nodeIdSchema,
      target: targetBox,
      mime: z.string(),
      base64: z.string(),
      width: z.number().int(),
      height: z.number().int(),
      camera: cameraStateSchema,
      quality: qualityPreset,
      ...shotReport,
      ...roiEcho,
    }),
    scope: 'room' as const,
    mutating: false,
    wire: 'render.node' as const,
    mcp: {
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    cli: {
      command: 'render node',
      args: '<roomId> <nodeId> [--view three_quarter] [--padding 1.15] [--out shot.png] [--size 1280x720]',
    },
    errors: ['E_RENDER_UNAVAILABLE', 'E_ROOM_NOT_FOUND', 'E_INVALID_PARAMS'] as const,
  },
  'render.pick': {
    title: '像素取色：给点给区域量颜色与直方图，roi 可同时回传裁剪小图',
    input: z.object({
      roomId,
      points: z
        .array(z.object({ x: intIn(0, 4095), y: intIn(0, 4095) }))
        .min(1)
        .max(32)
        .optional(),
      rect: z
        .object({ x: intIn(0, 4095), y: intIn(0, 4095), w: intIn(1, 4096), h: intIn(1, 4096) })
        .optional(),
      roi: roiRect.optional(),
      topColors: intIn(1, 16).optional(),
      ...pickImageOpts,
    }),
    output: z.object({
      revision: z.number().int().min(0),
      width: z.number().int(),
      height: z.number().int(),
      mime: z.literal('image/png').optional(),
      base64: z.string().optional(),
      frame: z.object({ width: z.number().int(), height: z.number().int() }).optional(),
      roi: z
        .object({ x: z.number().int(), y: z.number().int(), w: z.number().int(), h: z.number().int() })
        .optional(),
      samples: z.array(
        z.object({
          x: z.number().int(),
          y: z.number().int(),
          rgb: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
          hex: z.string(),
          alpha: z.number().int(),
        }),
      ),
      region: z
        .object({
          x: z.number().int(),
          y: z.number().int(),
          w: z.number().int(),
          h: z.number().int(),
          pixels: z.number().int(),
          topColors: z.array(
            z.object({ hex: z.string(), count: z.number().int(), share: z.number().min(0).max(1) }),
          ),
          mean: z.tuple([z.number(), z.number(), z.number()]),
        })
        .optional(),
    }),
    scope: 'room' as const,
    mutating: false,
    wire: 'render.pick' as const,
    mcp: {
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    cli: {
      command: 'render pick',
      args: '<roomId> [--point 12,34] [--rect 0,0,200,100] [--roi 0,0,200,100] [--size 1280x720] [--top-colors 5]',
    },
    errors: ['E_RENDER_UNAVAILABLE', 'E_ROOM_NOT_FOUND', 'E_INVALID_PARAMS'] as const,
  },
  'render.id-pass': {
    title: 'ID 通道：每个节点刷成唯一色，回传像素覆盖与可选索引掩码（framing 语义与 snapshot 一致）',
    input: z.object({
      roomId,
      width: intIn(64, 4096).optional(),
      height: intIn(64, 4096).optional(),
      camera: cameraStateSchema.partial().optional(),
      framing: framingParam,
      settleMs: intIn(0, 10_000).optional(),
      at: numIn(0, 3600).optional(),
      includeMask: z.boolean().optional(),
    }),
    output: z.object({
      revision: z.number().int().min(0),
      width: z.number().int(),
      height: z.number().int(),
      legend: z.record(nodeIdSchema, z.string()),
      coverage: z.array(
        z.object({
          nodeId: nodeIdSchema,
          hex: z.string(),
          pixels: z.number().int(),
          share: z.number().min(0).max(1),
        }),
      ),
      unknown: z.number().int(),
      mask: z.object({ encoding: z.literal('deflate-index8'), base64: z.string() }).optional(),
    }),
    scope: 'room' as const,
    mutating: false,
    wire: 'render.id-pass' as const,
    mcp: {
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    cli: {
      command: 'render id-pass',
      args: '<roomId> [--size 640x480] [--camera px,py,pz,tx,ty,tz] [--mask]',
    },
    errors: ['E_RENDER_UNAVAILABLE', 'E_ROOM_NOT_FOUND', 'E_INVALID_PARAMS'] as const,
  },
  'render.sequence': {
    title: '按 from/to/fps 采样动画，输出 PNG 帧序列 + manifest（任务制，用 job.get 取进度）',
    input: z.object({
      roomId,
      from: numIn(0, 3600),
      to: numIn(0, 3600),
      fps: intIn(1, 60),
      width: imageOpts.width,
      height: imageOpts.height,
      shading: imageOpts.shading,
      overlay: imageOpts.overlay,
      settleMs: imageOpts.settleMs,
      format: z.literal('png').optional(),
    }),
    output: z.object({
      jobId: z.string().min(1),
      state: jobStateSchema,
    }),
    scope: 'room' as const,
    mutating: false,
    wire: 'render.sequence' as const,
    mcp: { annotations: { readOnlyHint: true } },
    cli: {
      command: 'render sequence',
      args: '<roomId> --from s --to s [--fps 24] [--size 1280x720] [--shading flat] [--wait]',
    },
    errors: [
      'E_RENDER_UNAVAILABLE',
      'E_ROOM_NOT_FOUND',
      'E_INVALID_PARAMS',
      'E_BUSY',
      'E_JOB_NOT_FOUND',
    ] as const,
  },
  'export.glb': {
    title: '把场景导出为 GLB，返回 jobId；用 vibe3d_job.get 轮询到 state=done 后取产物',
    input: z.object({
      roomId,
      nodeIds: z
        .array(nodeIdSchema)
        .optional()
        .describe('只导出这些节点（含子树）；省略则导出整场景'),
      include: z
        .array(z.enum(['cameras', 'lights']))
        .max(2)
        .optional()
        .describe('额外带上相机 / 灯光；默认不带'),
    }),
    output: z.object({
      jobId: z.string().min(1),
      state: jobStateSchema,
    }),
    scope: 'room' as const,
    mutating: false,
    wire: 'export.glb' as const,
    mcp: { annotations: { readOnlyHint: true } },
    cli: { command: 'export glb', args: '<roomId> [--node id] [--out scene.glb] [--wait]' },
    errors: ['E_RENDER_UNAVAILABLE', 'E_JOB_NOT_FOUND', 'E_ROOM_NOT_FOUND', 'E_BUSY'] as const,
  },
  'job.get': {
    title: '查询导出任务状态',
    input: z.object({ jobId: z.string().min(1) }),
    output: jobViewSchema,
    scope: 'daemon' as const,
    mutating: false,
    wire: 'job.get' as const,
    mcp: { annotations: { readOnlyHint: true } },
    cli: { command: 'job get', args: '<jobId>' },
    errors: ['E_JOB_NOT_FOUND'] as const,
  },
  'job.list': {
    title: '列出导出任务（可按房间过滤）',
    input: z.object({ roomId: roomId.optional() }),
    output: z.object({ items: z.array(jobViewSchema) }),
    scope: 'room' as const,
    mutating: false,
    wire: 'job.list' as const,
    mcp: { annotations: { readOnlyHint: true } },
    cli: { command: 'job ls', args: '[roomId]' },
    errors: [] as const,
  },
  'job.cancel': {
    title: '取消导出任务（排队中立即出队，运行中丢弃结果）',
    input: z.object({ jobId: z.string().min(1) }),
    output: jobViewSchema,
    scope: 'daemon' as const,
    mutating: true,
    wire: 'job.cancel' as const,
    cli: { command: 'job cancel', args: '<jobId>' },
    errors: ['E_JOB_NOT_FOUND'] as const,
  },
  'editor.open': {
    title:
      '在本地浏览器打开房间编辑器（默认直接弹出窗口；open:false 只回链接）；省略 room_id 时用会话绑定（未绑定自动建房）',
    input: z.object({
      roomId,
      focus: nodeIdSchema.optional().describe('打开后选中并聚焦到该节点'),
      reuse: z.boolean().optional().describe('复用已开的同房间编辑页；false 强制新开一个'),
      open: z.boolean().optional().describe('true（默认）直接弹窗；false 只返回 url 不弹'),
    }),
    output: z.object({
      url: z.string(),
      reused: z.boolean(),
      opened: z.boolean(),
      editors: z.number().int(),
      hint: z.string().optional(),
    }),
    scope: 'room' as const,
    mutating: false,
    hostCoupled: true,
    wire: 'editor.open' as const,
    mcp: { roomArg: true },
    cli: { command: 'open', args: '<roomId>' },
    errors: ['E_ROOM_NOT_FOUND'] as const,
  },
};
