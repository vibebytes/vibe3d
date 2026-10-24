import { cameraStateSchema, nodeIdSchema } from '@vibebyte/vibe3d-protocol';
import { z } from 'zod';
import { intIn, numIn, revisionOut, roomId } from './common';

const frameMode = z.enum(['fit', 'close', 'wide']);
const viewName = z.enum(['front', 'back', 'left', 'right', 'top', 'three_quarter']);
const targetBox = z.object({
  min: z.tuple([z.number(), z.number(), z.number()]),
  max: z.tuple([z.number(), z.number(), z.number()]),
});
export const shadingMode = z.enum(['flat', 'wireframe', 'normals']);
export const overlayKind = z.enum(['grid', 'axes', 'bbox']);
const imageOpts = {
  width: intIn(64, 4096).optional(),
  height: intIn(64, 4096).optional(),
  format: z.enum(['png', 'jpeg']).optional(),
  settleMs: intIn(0, 10_000).optional(),
  at: numIn(0, 3600).optional(),
  transparent: z.boolean().optional(),
  shading: shadingMode.optional(),
  overlay: z.array(overlayKind).max(3).optional(),
};

const pickImageOpts = {
  width: imageOpts.width,
  height: imageOpts.height,
  settleMs: imageOpts.settleMs,
  at: imageOpts.at,
  transparent: imageOpts.transparent,
  shading: imageOpts.shading,
  overlay: imageOpts.overlay,
};

export const jobStateSchema = z.enum(['queued', 'running', 'done', 'failed', 'cancelled']);

export const jobViewSchema = z.object({
  jobId: z.string().min(1),
  kind: z.literal('export.glb'),
  roomId: z.string().min(1),
  state: jobStateSchema,
  pct: z.number().min(0).max(1),
  phase: z.string().optional(),
  url: z.string().optional(),
  bytes: z.number().int().min(0).optional(),
  revision: z.number().int().min(0).optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
});

export const renderOps = {
  'camera.set': {
    title: '设相机：显式参数或自动取景',
    input: z.object({
      roomId,
      camera: cameraStateSchema.partial().optional(),
      frame: frameMode.optional(),
    }),
    output: revisionOut.extend({ camera: cameraStateSchema }),
    scope: 'room' as const,
    mutating: true,
    wire: 'camera.set' as const,
    mcp: { tool: 'vibe3d_set_camera' as const },
    cli: { command: 'camera set', args: '<roomId> [--frame fit] [--p x,y,z] [--target x,y,z]' },
    errors: ['E_INVALID_PARAMS', 'E_ROOM_NOT_FOUND'] as const,
  },
  'render.snapshot': {
    title: '离屏渲染一张图，可选等待动画稳定',
    input: z.object({
      roomId,
      ...imageOpts,
    }),
    output: z.object({
      revision: z.number().int().min(0),
      mime: z.string(),
      base64: z.string(),
      width: z.number().int(),
      height: z.number().int(),
    }),
    scope: 'room' as const,
    mutating: false,
    wire: 'render.snapshot' as const,
    mcp: {
      tool: 'vibe3d_render_snapshot' as const,
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
        }),
      ),
    }),
    scope: 'room' as const,
    mutating: false,
    wire: 'render.views' as const,
    mcp: {
      tool: 'vibe3d_render_views' as const,
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
    }),
    scope: 'room' as const,
    mutating: false,
    wire: 'render.node' as const,
    mcp: {
      tool: 'vibe3d_render_node' as const,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    cli: {
      command: 'render node',
      args: '<roomId> <nodeId> [--view three_quarter] [--padding 1.15] [--out shot.png] [--size 1280x720]',
    },
    errors: ['E_RENDER_UNAVAILABLE', 'E_ROOM_NOT_FOUND', 'E_INVALID_PARAMS'] as const,
  },
  'render.pick': {
    title: '像素取色：给点给区域，直接量出颜色与直方图',
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
      topColors: intIn(1, 16).optional(),
      ...pickImageOpts,
    }),
    output: z.object({
      revision: z.number().int().min(0),
      width: z.number().int(),
      height: z.number().int(),
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
      tool: 'vibe3d_render_pick' as const,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    cli: {
      command: 'render pick',
      args: '<roomId> [--point 12,34] [--rect 0,0,200,100] [--size 1280x720] [--top-colors 5]',
    },
    errors: ['E_RENDER_UNAVAILABLE', 'E_ROOM_NOT_FOUND', 'E_INVALID_PARAMS'] as const,
  },
  'export.glb': {
    title: '把场景导出为 GLB，返回任务 ID',
    input: z.object({ roomId, nodeIds: z.array(nodeIdSchema).optional() }),
    output: z.object({
      jobId: z.string().min(1),
      state: jobStateSchema,
    }),
    scope: 'room' as const,
    mutating: false,
    wire: 'export.glb' as const,
    mcp: { tool: 'vibe3d_export_glb' as const, annotations: { readOnlyHint: true } },
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
    mcp: { tool: 'vibe3d_job_get' as const, annotations: { readOnlyHint: true } },
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
    mcp: { tool: 'vibe3d_job_list' as const, annotations: { readOnlyHint: true } },
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
    mcp: { tool: 'vibe3d_job_cancel' as const },
    cli: { command: 'job cancel', args: '<jobId>' },
    errors: ['E_JOB_NOT_FOUND'] as const,
  },
  'editor.open': {
    title:
      '在本地浏览器打开房间编辑器（默认直接弹出窗口；open:false 只回链接）；省略 room_id 时用会话绑定（未绑定自动建房）',
    input: z.object({
      roomId,
      focus: nodeIdSchema.optional(),
      reuse: z.boolean().optional(),
      open: z.boolean().optional(),
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
    mcp: { tool: 'vibe3d_open_editor' as const, roomArg: true },
    cli: { command: 'open', args: '<roomId>' },
    errors: ['E_ROOM_NOT_FOUND'] as const,
  },
};
