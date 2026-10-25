import { ERROR_CODES } from '@vibebyte/vibe3d-protocol';
import type { ErrorCode } from '@vibebyte/vibe3d-protocol';
import { z } from 'zod';

export const WIRE_METHODS = [
  'hello',
  'system.status',
  'room.create',
  'room.list',
  'room.use',
  'room.get',
  'room.close',
  'room.timeline',
  'scene.get',
  'scene.summary',
  'scene.apply',
  'scene.undo',
  'scene.redo',
  'scene.diff',
  'selection.get',
  'asset.inspect',
  'asset.put',
  'asset.list',
  'asset.delete',
  'camera.set',
  'camera.save',
  'camera.delete',
  'render.snapshot',
  'render.views',
  'render.node',
  'render.pick',
  'render.id-pass',
  'render.sequence',
  'export.glb',
  'job.get',
  'job.list',
  'job.cancel',
  'editor.open',
  'scene.export',
  'scene.import',
  'scene.checkpoint',
  'scene.checkpoints',
  'scene.restore',
  'scene.query',
  'scene.pick',
  'node.get',
  'scene.stats',
  'scene.validate',
  'node.transform_many',
  'node.array',
  'node.attach',
  'node.reparent',
  'node.group',
  'node.merge',
  'material.assign',
  'decal.create',
  'mesh.boolean',
  'mesh.tube',
  'mesh.backdrop',
] as const;

export type WireMethod = (typeof WIRE_METHODS)[number];

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export type ResolvedAnnotations = Required<ToolAnnotations>;

/** MCP 的 hint 一旦省略就回落协议默认值（openWorldHint 默认 true），所以这里统一显式补齐 */
export function resolveAnnotations(spec: {
  mutating: boolean;
  mcp?: { annotations?: ToolAnnotations };
}): ResolvedAnnotations {
  const a = spec.mcp?.annotations ?? {};
  const readOnlyHint = a.readOnlyHint ?? !spec.mutating;
  return {
    readOnlyHint,
    destructiveHint: a.destructiveHint ?? false,
    idempotentHint: a.idempotentHint ?? readOnlyHint,
    openWorldHint: a.openWorldHint ?? false,
  };
}

export interface CliSpec {
  command: string;
  args: string;
}

export interface McpSpec {
  tool: `vibe3d_${string}`;
  annotations?: ToolAnnotations;
  /** 房间是操作对象（读/关/打开）而非路由：room_id 以可选参数暴露，省略时取会话绑定 */
  roomArg?: boolean | 'required';
}

export interface CapabilitySpec<I = unknown, O = unknown> {
  title: string;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  scope: 'daemon' | 'room';
  mutating: boolean;
  hostCoupled?: boolean;
  wire: WireMethod;
  mcp?: McpSpec;
  cli?: CliSpec;
  errors?: readonly ErrorCode[];
}

export type SpecRecord = Record<string, CapabilitySpec<unknown, unknown>>;

export function defineCapabilities<const T extends SpecRecord>(specs: T): T {
  const seenTools = new Set<string>();
  const seenCli = new Set<string>();
  for (const [name, spec] of Object.entries(specs)) {
    if (!(spec.input instanceof z.ZodObject)) {
      throw new Error(`${name}: input 必须是 z.object（生成器按 shape 出 JSON Schema）`);
    }
    if (!(spec.output instanceof z.ZodObject)) {
      throw new Error(`${name}: output 必须是 z.object`);
    }
    if (!WIRE_METHODS.includes(spec.wire)) {
      throw new Error(`${name}: 未知 wire method ${String(spec.wire)}`);
    }
    if (spec.scope === 'daemon' && 'roomId' in spec.input.shape) {
      throw new Error(`${name}: daemon scope 不得声明 roomId`);
    }
    if (spec.mcp) {
      if (!spec.mcp.tool.startsWith('vibe3d_')) throw new Error(`${name}: tool 必须以 vibe3d_ 开头`);
      if (seenTools.has(spec.mcp.tool)) throw new Error(`${name}: tool 重复 ${spec.mcp.tool}`);
      seenTools.add(spec.mcp.tool);
      if (spec.mcp.roomArg && spec.scope !== 'room') {
        throw new Error(`${name}: 只有 room scope 能声明 mcp.roomArg`);
      }
    }
    if (spec.cli) {
      if (seenCli.has(spec.cli.command)) throw new Error(`${name}: cli 命令重复 ${spec.cli.command}`);
      seenCli.add(spec.cli.command);
    }
    if (spec.hostCoupled && name !== 'editor.open') {
      throw new Error(`${name}: 只有 editor.open 可以声明 hostCoupled`);
    }
    for (const code of spec.errors ?? []) {
      if (!ERROR_CODES.includes(code)) throw new Error(`${name}: 未知错误码 ${code}`);
    }
    if (spec.mutating && spec.mcp?.annotations?.readOnlyHint) {
      throw new Error(`${name}: 写能力不能标 readOnlyHint`);
    }
  }
  return specs;
}
