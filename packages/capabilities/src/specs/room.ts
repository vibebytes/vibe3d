import { z } from 'zod';
import { intIn, revisionOut, roomId, roomSummary } from './common';

export const roomCreate = {
  'room.create': {
    title: '创建房间：分配 roomId 与文档；下次写操作会自动开窗，无需预先调用 vibe3d_open_editor',
    input: z.object({
      name: z.string().min(1).max(120).optional(),
      template: z.enum(['empty', 'showroom', 'product']).optional(),
    }),
    output: z.object({
      roomId,
      name: z.string(),
      url: z.string(),
      openUrl: z.string(),
      revision: z.number().int().min(0),
    }),
    scope: 'daemon' as const,
    mutating: true,
    wire: 'room.create' as const,
    cli: { command: 'room new', args: '[--name <name>] [--template <t>]' },
    errors: ['E_ROOM_LIMIT', 'E_LOCKED'] as const,
  },
  'room.list': {
    title: '列出房间（limit/cursor 分页，按 updatedAt 倒序）',
    input: z.object({
      limit: intIn(1, 100).optional(),
      cursor: z.string().min(1).optional(),
    }),
    output: z.object({
      rooms: z.array(roomSummary.extend({ thumbUrl: z.string().optional() })),
      nextCursor: z.string().optional(),
    }),
    scope: 'daemon' as const,
    mutating: false,
    wire: 'room.list' as const,
    mcp: { annotations: { readOnlyHint: true } },
    cli: { command: 'room ls', args: '[--limit n] [--cursor c]' },
    errors: ['E_INVALID_PARAMS'] as const,
  },
  'room.use': {
    title: '切换当前会话绑定的房间：只换绑定，不打开窗口（之后 scene/node/render 都作用于它）',
    input: z.object({ roomId }),
    output: roomSummary,
    scope: 'room' as const,
    mutating: false,
    wire: 'room.use' as const,
    mcp: {
      annotations: { readOnlyHint: true },
      roomArg: 'required' as const,
    },
    cli: { command: 'room use', args: '<roomId>' },
    errors: ['E_ROOM_NOT_FOUND'] as const,
  },
  'room.get': {
    title: '读取房间摘要（含 editors：0 表示暂无窗口在看，下一次写操作会自动开窗）',
    input: z.object({ roomId }),
    output: roomSummary.extend({
      editors: z.number().int().min(0),
      url: z.string(),
      thumbUrl: z.string().optional(),
    }),
    scope: 'room' as const,
    mutating: false,
    wire: 'room.get' as const,
    mcp: { annotations: { readOnlyHint: true }, roomArg: true },
    cli: { command: 'room show', args: '<roomId>' },
    errors: ['E_ROOM_NOT_FOUND'] as const,
  },
  'room.close': {
    title: '关闭房间，可选清除磁盘数据',
    input: z.object({ roomId, purge: z.boolean().optional() }),
    output: revisionOut.extend({ closed: z.boolean() }),
    scope: 'room' as const,
    mutating: true,
    wire: 'room.close' as const,
    mcp: {
      annotations: { destructiveHint: true },
      roomArg: true,
    },
    cli: { command: 'room rm', args: '<roomId> [--purge]' },
    errors: ['E_ROOM_NOT_FOUND', 'E_LOCKED'] as const,
  },
  'room.timeline': {
    title:
      '查看 op 时间线：每批 apply 的 opId/摘要/作者/步数，倒序；opId 仍可精确回退时才返回，配合 scene.undo{opId} 用',
    input: z.object({ roomId, limit: intIn(1, 100).optional() }),
    output: z.object({
      revision: z.number().int().min(0),
      entries: z.array(
        z.object({
          revision: z.number().int().min(1),
          summary: z.string().max(400),
          ops: z.number().int().min(0),
          opId: z.string().min(1).optional(),
          author: z.string().max(80).optional(),
        }),
      ),
    }),
    scope: 'room' as const,
    mutating: false,
    wire: 'room.timeline' as const,
    mcp: { annotations: { readOnlyHint: true } },
    cli: { command: 'room timeline', args: '<roomId> [--limit n]' },
    errors: ['E_ROOM_NOT_FOUND'] as const,
  },
};
