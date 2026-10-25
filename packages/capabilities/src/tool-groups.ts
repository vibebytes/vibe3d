import { CAPABILITIES, type CapabilityName } from './registry';
import { TOOL_GROUP_TABLE } from './tool-groups.data';
import type { ResolvedAnnotations } from './types';
import { resolveAnnotations } from './types';

/** 一条 [op, 能力名, 旧版扁平工具名后缀]；旧名为 `vibe3d_` + 后缀 */
export type GroupOp = readonly [op: string, capability: CapabilityName, legacy: string];

export interface ToolGroup {
  tool: `vibe3d_${string}`;
  title: string;
  ops: readonly GroupOp[];
}

export const TOOL_GROUPS: readonly ToolGroup[] = TOOL_GROUP_TABLE;

const OP_PATTERN = /^[a-z][a-z0-9_]*$/;

export const GROUP_BY_CAPABILITY = new Map<CapabilityName, { group: ToolGroup; op: string }>();
export const LEGACY_OF = new Map<CapabilityName, string>();
export const LEGACY_TOOL_ALIASES = new Map<string, { tool: string; op: string; capability: CapabilityName }>();

function fail(message: string): never {
  throw new Error(`tool-groups: ${message}`);
}

for (const group of TOOL_GROUPS) {
  if (!group.tool.startsWith('vibe3d_')) fail(`${group.tool} 必须以 vibe3d_ 开头`);
  if (group.ops.length === 0) fail(`${group.tool} 没有 op`);
  const seenOps = new Set<string>();
  for (const [op, capability, legacy] of group.ops) {
    if (!OP_PATTERN.test(op)) fail(`${group.tool}.${op} 不是合法 op 名`);
    if (seenOps.has(op)) fail(`${group.tool}.${op} 重复`);
    seenOps.add(op);
    if (!(capability in CAPABILITIES)) fail(`${capability} 不存在`);
    if (GROUP_BY_CAPABILITY.has(capability)) fail(`${capability} 出现在多个分组`);
    GROUP_BY_CAPABILITY.set(capability, { group, op });
    const legacyName = `vibe3d_${legacy}`;
    LEGACY_OF.set(capability, legacyName);
    if (legacyName !== group.tool) {
      if (LEGACY_TOOL_ALIASES.has(legacyName)) fail(`旧工具名 ${legacyName} 重复`);
      LEGACY_TOOL_ALIASES.set(legacyName, { tool: group.tool, op, capability });
    }
  }
}

for (const capability of Object.keys(CAPABILITIES) as CapabilityName[]) {
  if (!GROUP_BY_CAPABILITY.has(capability)) fail(`${capability} 没有被任何工具覆盖`);
}

const specOf = (capability: CapabilityName) => CAPABILITIES[capability];

/** 多 op 工具的整体 hint：全读才算只读，任一破坏性就算破坏性 */
export function groupAnnotations(group: ToolGroup): ResolvedAnnotations {
  const all = group.ops.map(([, capability]) => resolveAnnotations(specOf(capability)));
  const readOnlyHint = all.every((a) => a.readOnlyHint);
  return {
    readOnlyHint,
    destructiveHint: all.some((a) => a.destructiveHint),
    idempotentHint: all.every((a) => a.idempotentHint),
    openWorldHint: all.some((a) => a.openWorldHint),
  };
}

export const isFlatTool = (group: ToolGroup): boolean => group.ops.length === 1;
