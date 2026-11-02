import { mcpInputSchema } from './gen/generate';
export { usageOf } from './usage';
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
  fields?: ParamDoc[];
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
  properties?: Record<string, PropSchema>;
  required?: string[];
  items?: PropSchema;
};

const MAX_DEPTH = 3;

function propDocs(schema: PropSchema, depth: number): ParamDoc[] {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([name, prop]) => {
    const element = prop.type === 'array' && prop.items?.properties ? prop.items : undefined;
    const doc: ParamDoc = { name: element ? `${name}[]` : name, required: required.has(name) };
    const type =
      prop.type ??
      prop.anyOf
        ?.map((arm) => arm.type)
        .filter(Boolean)
        .join(' | ');
    if (type) doc.type = type;
    if (prop.description) doc.description = prop.description;
    if (prop.enum) doc.values = prop.enum;
    if (prop.default !== undefined) doc.default = prop.default;
    const nested = element ?? (prop.properties ? prop : undefined);
    if (nested && depth < MAX_DEPTH) doc.fields = propDocs(nested, depth + 1);
    return doc;
  });
}

export function paramDocs(capability: CapabilityName): ParamDoc[] {
  return propDocs(mcpInputSchema(CAPABILITIES[capability]) as PropSchema, 0);
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
    roomArg: (spec as { mcp?: McpSpec }).mcp?.roomArg ?? spec.scope === 'room',
    errors: 'errors' in spec ? (spec.errors ?? []) : [],
    params: paramDocs(capability),
  };
}
