export { CAPABILITIES, CAPABILITY_NAMES, type CapabilityName, type RoomCapability } from './registry';
export {
  defineCapabilities,
  WIRE_METHODS,
  type CapabilitySpec,
  type CliSpec,
  type McpSpec,
  type McpOpDoc,
  type McpToolDoc,
  type ToolAnnotations,
} from './types';
export { MCP_TOOLS, MCP_LEGACY_ALIASES } from '../generated/mcp';
export {
  TOOL_GROUPS,
  GROUP_BY_CAPABILITY,
  LEGACY_OF,
  LEGACY_TOOL_ALIASES,
  groupAnnotations,
  isFlatTool,
  type ToolGroup,
  type GroupOp,
} from './tool-groups';
export { describeCapability, type ParamDoc } from './help';
export { describeOpField, mergedFieldDocs, opFieldDoc, opFieldDocs, type OpFieldDoc } from './op-fields';
export { buildOpSample, opExample } from './op-example';
export { describeIssues, type ParamIssue, toIssues } from './issues';
export { GLOBAL_CONVENTIONS, conventionMap, conventionText, type ConventionEntry } from './conventions';
