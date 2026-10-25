import { mcpInputSchema } from './gen/generate';
import { CAPABILITIES, type CapabilityName } from './registry';
import { GROUP_BY_CAPABILITY, LEGACY_OF } from './tool-groups';
import type { McpSpec } from './types';

export interface ParamDoc {
  name: string;
  type?: string;
  required: boolean;
  description?: string;
  values?: unknown[];
  default?: unknown;
}

export interface CapabilityDoc {
  capability: CapabilityName;
  title: string;
  tool: string;
  op: string;
  legacy: string;
  scope: 'daemon' | 'room';
  mutating: boolean;
  roomArg: boolean | 'required';
  errors: readonly string[];
  params: ParamDoc[];
}

type PropSchema = {
  type?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  anyOf?: PropSchema[];
};

export function paramDocs(capability: CapabilityName): ParamDoc[] {
  const spec = CAPABILITIES[capability];
  const schema = mcpInputSchema(spec) as {
    properties?: Record<string, PropSchema>;
    required?: string[];
  };
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([name, prop]) => {
    const doc: ParamDoc = { name, required: required.has(name) };
    const type = prop.type ?? prop.anyOf?.map((arm) => arm.type).filter(Boolean).join(' | ');
    if (type) doc.type = type;
    if (prop.description) doc.description = prop.description;
    if (prop.enum) doc.values = prop.enum;
    if (prop.default !== undefined) doc.default = prop.default;
    return doc;
  });
}

export function describeCapability(capability: CapabilityName): CapabilityDoc {
  const spec = CAPABILITIES[capability];
  const group = GROUP_BY_CAPABILITY.get(capability);
  return {
    capability,
    title: spec.title,
    tool: group?.group.tool ?? '',
    op: group?.op ?? '',
    legacy: LEGACY_OF.get(capability) ?? '',
    scope: spec.scope,
    mutating: spec.mutating,
    roomArg: (spec as { mcp?: McpSpec }).mcp?.roomArg ?? false,
    errors: 'errors' in spec ? (spec.errors ?? []) : [],
    params: paramDocs(capability),
  };
}
