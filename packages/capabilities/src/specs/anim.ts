import { clipChannelSchema, clipSchema, nodeIdSchema, nodeRefSchema } from '@vibebyte/vibe3d-protocol';
import { z } from 'zod';
import { revisionOut, roomId } from './common';

export const animOps = {
  'animation.play': {
    title: '播放模型动画，默认取首条 clip；clips 可多 clip 叠加',
    input: z.object({
      roomId,
      nodeId: nodeRefSchema.describe('节点 id 或 @名称'),
      clip: z.string().optional(),
      clips: z
        .array(z.string().min(1))
        .min(1)
        .max(8)
        .optional()
        .describe('多 clip 叠加：按顺序同时播放，weight 为各自权重（缺省均分）'),
      speed: z.number().positive().optional(),
      loop: z.boolean().optional(),
      direction: z.enum(['forward', 'reverse']).optional(),
      weight: z.number().min(0).max(1).optional(),
    }),
    output: revisionOut,
    scope: 'room' as const,
    mutating: true,
    wire: 'scene.apply' as const,
    cli: {
      command: 'anim play',
      args: '<roomId> <nodeId> [--clip <name>] [--clips idle,wave] [--speed 1] [--loop false] [--direction reverse] [--weight 0.5]',
      positional: ['nodeId'],
      example: 'anim play r1 n1 --clip wave',
    },
    errors: ['E_INVALID_PARAMS', 'E_ROOM_NOT_FOUND'] as const,
  },
  'animation.stop': {
    title: '停止模型动画；程序化 clip 节点为幂等空操作',
    input: z.object({ roomId, nodeId: nodeRefSchema.describe('节点 id 或 @名称') }),
    output: revisionOut,
    scope: 'room' as const,
    mutating: true,
    wire: 'scene.apply' as const,
    cli: {
      command: 'anim stop',
      args: '<roomId> <nodeId>',
      positional: ['nodeId'],
      example: 'anim stop r1 n1',
    },
    errors: ['E_INVALID_PARAMS', 'E_NODE_NOT_FOUND', 'E_ROOM_NOT_FOUND'] as const,
  },
  'animation.define': {
    title:
      '定义程序化动画：周期函数（sway/ripple/float/flicker/spin）、标量关键帧（keyframes），或任意属性轨道（tracks）',
    input: z.object({
      roomId,
      nodeId: nodeRefSchema.describe('节点 id 或 @名称'),
      clip: clipSchema,
      applyTo: z.enum(['node', 'subtree']).optional(),
    }),
    output: revisionOut.extend({ nodeId: nodeIdSchema, appliedTo: z.array(nodeIdSchema) }),
    scope: 'room' as const,
    mutating: true,
    wire: 'scene.apply' as const,
    cli: {
      command: 'anim define',
      args: '<roomId> <nodeId> --type sway [--axis x|y|z] [--gust 0..1] [--apply-to subtree]；任意属性用 --clip-json \'{"tracks":[{"path":"position","keys":[{"t":0,"v":[0,0,0]}]}]}\'',
      positional: ['nodeId'],
      flatten: ['clip'],
      aliases: { 'clip-json': 'clip' },
      example: 'anim define r1 n1 --type sway',
    },
    errors: ['E_INVALID_PARAMS', 'E_NODE_NOT_FOUND', 'E_ROOM_NOT_FOUND'] as const,
  },
  'animation.clear': {
    title: '清除节点上的程序化动画',
    input: z.object({
      roomId,
      nodeId: nodeRefSchema.describe('节点 id 或 @名称'),
      applyTo: z.enum(['node', 'subtree']).optional(),
      channel: clipChannelSchema.optional(),
    }),
    output: revisionOut.extend({ cleared: z.boolean(), appliedTo: z.array(nodeIdSchema) }),
    scope: 'room' as const,
    mutating: true,
    wire: 'scene.apply' as const,
    mcp: { annotations: { destructiveHint: true } },
    cli: {
      command: 'anim clear',
      args: '<roomId> <nodeId> [--apply-to subtree] [--channel ry]',
      positional: ['nodeId'],
      example: 'anim clear r1 n1',
    },
    errors: ['E_INVALID_PARAMS', 'E_NODE_NOT_FOUND', 'E_ROOM_NOT_FOUND'] as const,
  },
  'animation.pose': {
    title: '一次性摆姿势：批量写入多个节点的 keyframes 姿态',
    input: z.object({
      roomId,
      targets: z
        .array(z.object({ nodeId: nodeRefSchema.describe('节点 id 或 @名称'), clip: clipSchema }))
        .min(1)
        .max(64),
    }),
    output: revisionOut.extend({ appliedTo: z.array(nodeIdSchema) }),
    scope: 'room' as const,
    mutating: true,
    wire: 'scene.apply' as const,
    cli: { command: 'anim pose', args: '<roomId> --targets <json>', example: 'anim pose r1 --targets []' },
    errors: ['E_INVALID_PARAMS', 'E_NODE_NOT_FOUND', 'E_ROOM_NOT_FOUND'] as const,
  },
  'animation.gait': {
    title:
      '给带骨骼的人形模型套程序化步态（walk / run / idle）：循环 bone 轨道 + 沿节点自身 +Z 的根运动 drift（转向请旋转节点）；只替换带 bone 轨道的旧 clip（姿态/旧步态），其余 clip 保留',
    input: z.object({
      roomId,
      nodeId: nodeRefSchema.describe('带骨骼的 model 节点 id 或 @名称（如 mesh.mannequin 的结果）'),
      style: z.enum(['walk', 'run', 'idle']),
      period: z
        .number()
        .finite()
        .min(0.2)
        .max(10)
        .optional()
        .describe('一个完整周期（两步）的秒数；缺省 walk 1.1 / run 0.7 / idle 3'),
      stride: z
        .number()
        .finite()
        .min(0)
        .max(1.8)
        .optional()
        .describe('步长（米）；根运动速度 = stride*2/period'),
      armSwing: z.number().finite().min(0).max(1.6).optional().describe('肩摆幅（弧度）'),
      speed: z.number().finite().positive().optional().describe('时间轴倍率'),
    }),
    output: revisionOut.extend({
      nodeId: nodeIdSchema,
      period: z.number(),
      drift: z.tuple([z.number(), z.number(), z.number()]).describe('根运动，米/秒；idle 为 [0,0,0]'),
    }),
    scope: 'room' as const,
    mutating: true,
    wire: 'scene.apply' as const,
    cli: {
      command: 'anim gait',
      args: '<roomId> <nodeId> --style walk|run|idle [--period s] [--stride m] [--arm-swing rad]',
      positional: ['nodeId'],
      example: 'anim gait r1 @runner --style run',
    },
    errors: ['E_INVALID_PARAMS', 'E_NODE_NOT_FOUND', 'E_ROOM_NOT_FOUND'] as const,
  },
};
