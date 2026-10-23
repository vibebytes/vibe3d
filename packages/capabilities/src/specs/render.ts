import { cameraStateSchema, nodeIdSchema } from '@vibebyte/vibe3d-protocol';
import { z } from 'zod';
import { revisionOut, roomId } from './common';

const frameMode = z.enum(['fit', 'close', 'wide']);

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
    errors: ['E_INVALID_PARAMS', 'E_RENDER_UNAVAILABLE'] as const,
  },
  'render.snapshot': {
    title: '离屏渲染一张图，可选等待动画稳定',
    input: z.object({
      roomId,
      width: z.number().int().min(64).max(4096).optional(),
      height: z.number().int().min(64).max(4096).optional(),
      format: z.enum(['png', 'jpeg']).optional(),
      settleMs: z.number().int().min(0).max(10_000).optional(),
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
    cli: { command: 'render snapshot', args: '<roomId> [--out shot.png] [--size 1280x720]' },
    errors: ['E_RENDER_UNAVAILABLE', 'E_ROOM_NOT_FOUND'] as const,
  },
  'export.glb': {
    title: '把场景导出为 GLB，返回签名下载地址',
    input: z.object({ roomId, nodeIds: z.array(nodeIdSchema).optional() }),
    output: z.object({
      jobId: z.string().min(1),
      url: z.string().min(1),
      bytes: z.number().int().min(0),
      revision: z.number().int().min(0),
    }),
    scope: 'room' as const,
    mutating: false,
    wire: 'export.glb' as const,
    mcp: { tool: 'vibe3d_export_glb' as const, annotations: { readOnlyHint: true } },
    cli: { command: 'export glb', args: '<roomId> [--out scene.glb]' },
    errors: ['E_RENDER_UNAVAILABLE', 'E_JOB_NOT_FOUND'] as const,
  },
  'editor.open': {
    title: '在浏览器打开房间编辑器',
    input: z.object({ roomId, focus: nodeIdSchema.optional(), reuse: z.boolean().optional() }),
    output: z.object({ url: z.string(), reused: z.boolean() }),
    scope: 'room' as const,
    mutating: false,
    hostCoupled: true,
    wire: 'editor.open' as const,
    mcp: { tool: 'vibe3d_open_editor' as const },
    cli: { command: 'open', args: '<roomId>' },
    errors: ['E_ROOM_NOT_FOUND'] as const,
  },
};
