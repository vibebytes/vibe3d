import { z } from 'zod';
import { revisionOut, roomId, roomSummary } from './common';

export const roomCreate = {
  'room.create': {
    title: '创建房间：分配 roomId 与文档，可选模板',
    input: z.object({
      name: z.string().min(1).max(120).optional(),
      template: z.enum(['empty', 'showroom', 'product']).optional(),
    }),
    output: z.object({
      roomId: z.string().regex(/^r_[a-z0-9]{8}$/),
      name: z.string(),
      url: z.string(),
      revision: z.number().int().min(0),
    }),
    scope: 'daemon' as const,
    mutating: true,
    wire: 'room.create' as const,
    mcp: { tool: 'vibe3d_create_room' as const },
    cli: { command: 'room new', args: '[--name <name>] [--template <t>]' },
    errors: ['E_ROOM_LIMIT', 'E_LOCKED'] as const,
  },
  'room.list': {
    title: '列出房间',
    input: z.object({}),
    output: z.object({ rooms: z.array(roomSummary) }),
    scope: 'daemon' as const,
    mutating: false,
    wire: 'room.list' as const,
    mcp: { tool: 'vibe3d_list_rooms' as const },
    cli: { command: 'room ls', args: '' },
  },
  'room.get': {
    title: '读取房间摘要',
    input: z.object({ roomId }),
    output: roomSummary,
    scope: 'room' as const,
    mutating: false,
    wire: 'room.get' as const,
    mcp: { tool: 'vibe3d_get_room' as const, annotations: { readOnlyHint: true } },
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
    mcp: { tool: 'vibe3d_close_room' as const, annotations: { destructiveHint: true } },
    cli: { command: 'room rm', args: '<roomId> [--purge]' },
    errors: ['E_ROOM_NOT_FOUND', 'E_LOCKED'] as const,
  },
};
