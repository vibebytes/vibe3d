import { ERROR_CODES } from '@vibebyte/vibe3d-protocol';
import type { ErrorCode } from '@vibebyte/vibe3d-protocol';
import { z } from 'zod';

export const WIRE_METHODS = [
  'hello',
  'room.create',
  'room.list',
  'room.get',
  'room.close',
  'scene.get',
  'scene.summary',
  'scene.apply',
  'scene.undo',
  'scene.redo',
  'scene.diff',
  'selection.get',
  'asset.inspect',
  'asset.put',
  'camera.set',
  'render.snapshot',
  'export.glb',
  'job.get',
  'editor.open',
] as const;

export type WireMethod = (typeof WIRE_METHODS)[number];

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface CliSpec {
  command: string;
  args: string;
}

export interface McpSpec {
  tool: `vibe3d_${string}`;
  annotations?: ToolAnnotations;
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
