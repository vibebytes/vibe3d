import {
  CAPABILITIES,
  type CapabilityName,
  MCP_LEGACY_ALIASES,
  MCP_TOOLS,
  type McpToolDoc,
  describeCapability,
  describeIssues,
  toIssues,
} from '@vibebyte/vibe3d-capabilities';
import { type RoomHandle, type Studio, Vibe3DError } from '@vibebyte/vibe3d-client';
import { coerceForSchema, deepCamel } from './coerce';
import { paramHint, schemaHint } from './hints';
import { describeTool, presentSchema } from './presentation';
import { RoomSession } from './session';

export type ToolDef = McpToolDoc;

export const HELP_TOOL = {
  name: 'vibe3d_help',
  title: '查参数契约：给 tool(+op) 返回该 op 的参数字段/必填/枚举/错误码与示例；不给 tool 则列出全部工具与 op',
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      tool: { type: 'string', description: '如 vibe3d_node' },
      op: { type: 'string', description: '如 create' },
    },
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
} as const;

export interface TextContent {
  type: 'text';
  text: string;
}
export interface ImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}
export interface ToolResult {
  content: Array<TextContent | ImageContent>;
  structuredContent?: unknown;
  isError?: boolean;
}

interface SpecView {
  scope: 'daemon' | 'room';
  mcp?: { roomArg?: boolean };
}

const viewOf = (capability: CapabilityName): SpecView => CAPABILITIES[capability] as SpecView;

interface Picked {
  capability: CapabilityName;
  op: string;
  input: Record<string, unknown>;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (deepCamel(value) as Record<string, unknown>)
    : undefined;

function pickOp(tool: ToolDef, rawArgs: unknown, pinnedOp?: string): Picked | { error: string } {
  const raw = (rawArgs ?? {}) as Record<string, unknown>;
  const given = asRecord(raw.params);
  const top = Object.fromEntries(Object.entries(raw).filter(([k]) => k !== 'op' && k !== 'params'));
  const merged = { ...(given ?? {}), ...(deepCamel(top) as Record<string, unknown>) };
  const wanted = (typeof raw.op === 'string' && raw.op) || pinnedOp;

  if (tool.ops.length === 1) {
    const only = tool.ops[0];
    if (!only) return { error: `${tool.name} 没有可调用的 op` };
    if (wanted && wanted !== only.op) {
      return { error: `${tool.name} 只支持 op ${only.op}，收到 ${wanted}；直接传参数即可` };
    }
    const flat = given ? merged : (deepCamel(raw) as Record<string, unknown>);
    return { capability: only.capability, op: only.op, input: flat };
  }

  const names = tool.ops.map((o) => o.op);
  if (!wanted) {
    return {
      error: `${tool.name} 需要 op 字段（可选：${names.join(' / ')}）。形如 {"op":"${names[0]}","params":{...}}；字段细节用 vibe3d_help {tool:"${tool.name}", op}`,
    };
  }
  const hit = tool.ops.find((o) => o.op === wanted);
  if (!hit) {
    const near = names.filter((n) => n.includes(wanted) || wanted.includes(n));
    return {
      error: `${tool.name} 没有 op「${wanted}」。可选：${names.join(' / ')}${near.length > 0 ? `；是否想用 ${near.join(' / ')}` : ''}`,
    };
  }
  return { capability: hit.capability, op: hit.op, input: merged };
}

function helpText(rawArgs: unknown): string {
  const raw = (rawArgs ?? {}) as { tool?: unknown; op?: unknown };
  const index = MCP_TOOLS.map((tool) => ({ tool: tool.name, ops: tool.ops.map((o) => o.op) }));
  if (typeof raw.tool !== 'string' || !raw.tool) {
    return JSON.stringify({ tools: index, hint: '传 {tool, op} 查单个 op 的参数契约' });
  }
  const tool = toolByName(raw.tool);
  if (!tool) {
    return JSON.stringify({ error: `未知 tool：${raw.tool}`, tools: index.map((t) => t.tool) });
  }
  const op = typeof raw.op === 'string' && raw.op ? raw.op : undefined;
  const entries = op ? tool.ops.filter((o) => o.op === op) : tool.ops;
  if (entries.length === 0) {
    return JSON.stringify({ error: `${tool.name} 没有 op「${op}」`, ops: tool.ops.map((o) => o.op) });
  }
  return JSON.stringify({
    tool: tool.name,
    title: tool.title,
    ops: entries.map((entry) => describeCapability(entry.capability)),
  });
}

export function helpResult(rawArgs: unknown): ToolResult {
  return { content: [{ type: 'text', text: helpText(rawArgs) }] };
}

export function toolByName(name: string): ToolDef | undefined {
  const direct = MCP_TOOLS.find((tool) => tool.name === name);
  if (direct) return direct;
  const alias = MCP_LEGACY_ALIASES[name as keyof typeof MCP_LEGACY_ALIASES];
  return alias ? MCP_TOOLS.find((tool) => tool.name === alias.tool) : undefined;
}

export function listTools(): Array<{
  name: string;
  description: string;
  inputSchema: unknown;
  annotations?: unknown;
}> {
  return [
    {
      name: HELP_TOOL.name,
      description: HELP_TOOL.title,
      inputSchema: HELP_TOOL.inputSchema,
      annotations: HELP_TOOL.annotations,
    },
    ...MCP_TOOLS.map((tool) => ({
      name: tool.name,
      description: describeTool(tool),
      inputSchema: presentSchema(tool),
      annotations: tool.annotations,
    })),
  ];
}

function failure(err: unknown): ToolResult {
  if (err instanceof Vibe3DError) {
    return {
      content: [{ type: 'text', text: JSON.stringify(err.toJSON()) }],
      structuredContent: err.toJSON(),
      isError: true,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text', text: JSON.stringify({ code: 'E_INTERNAL', message }) }],
    isError: true,
  };
}

function receivedType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function reportToolError(
  tool: string,
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>,
  input: Record<string, unknown>,
): void {
  const first = issues[0];
  const field = first && first.path.length > 0 ? String(first.path[0]) : undefined;
  const entry = {
    event: 'tool.error',
    tool,
    code: 'E_INVALID_PARAMS',
    field,
    received: field ? receivedType(input[field]) : undefined,
    reason: first?.message,
  };
  process.stderr.write(`${JSON.stringify(entry)}\n`);
}

export class ToolRuntime {
  private readonly studio: Studio;
  readonly session: RoomSession;

  constructor(studio: Studio, roomId?: string) {
    this.studio = studio;
    this.session = new RoomSession(roomId ?? process.env.VIBE3D_ROOM);
  }

  async call(name: string, rawArgs: unknown): Promise<ToolResult> {
    if (name === HELP_TOOL.name) {
      return { content: [{ type: 'text', text: helpText(rawArgs) }] };
    }
    const tool = toolByName(name);
    if (!tool) {
      return {
        content: [
          { type: 'text', text: JSON.stringify({ code: 'E_NO_METHOD', message: `未知工具：${name}` }) },
        ],
        isError: true,
      };
    }
    const picked = pickOp(tool, rawArgs, MCP_LEGACY_ALIASES[name]?.op);
    if ('error' in picked) return failure(new Vibe3DError('E_INVALID_PARAMS', picked.error));
    const { capability, op } = picked;
    const spec = CAPABILITIES[capability];
    if (name !== tool.name) {
      process.stderr.write(`${JSON.stringify({ event: 'tool.alias', called: name, tool: tool.name, op })}\n`);
    }
    try {
      const input = picked.input;
      if (viewOf(capability).scope === 'room') await this.resolveRoom(capability, input);
      const params = spec.input.safeParse(coerceForSchema(spec.input, input));
      if (!params.success) {
        reportToolError(name, params.error.issues, input);
        throw new Vibe3DError(
          'E_INVALID_PARAMS',
          `${capability} 参数校验失败：${describeIssues(params.error.issues)}${paramHint(params.error.issues)}${schemaHint(input, params.error.issues, spec.input)}`,
          { issues: toIssues(params.error.issues) },
        );
      }
      const data = params.data as Record<string, unknown>;
      const result = await this.dispatch(capability, data);
      this.afterCall(capability, data, result);
      if (capability === 'render.snapshot') {
        const shot = result as {
          base64: string;
          mime: string;
          width: number;
          height: number;
          revision: number;
        };
        return {
          content: [
            { type: 'image', data: shot.base64, mimeType: shot.mime },
            {
              type: 'text',
              text: JSON.stringify({
                width: shot.width,
                height: shot.height,
                revision: shot.revision,
                mime: shot.mime,
              }),
            },
          ],
          structuredContent: {
            width: shot.width,
            height: shot.height,
            revision: shot.revision,
            mime: shot.mime,
          },
        };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch (err) {
      return failure(err);
    }
  }

  private async resolveRoom(capability: CapabilityName, input: Record<string, unknown>): Promise<void> {
    const explicit = typeof input.roomId === 'string' && input.roomId ? input.roomId : undefined;
    if (!viewOf(capability).mcp?.roomArg) {
      if (explicit && explicit !== this.session.current) {
        throw new Vibe3DError(
          'E_INVALID_PARAMS',
          `${capability} 不接受 room_id：房间由会话绑定（当前 ${this.session.current ?? '未绑定'}）。换房间请用 vibe3d_use_room（纯绑定不弹窗），或用 vibe3d_get_room / vibe3d_open_editor 传 room_id。`,
        );
      }
      input.roomId = this.session.require();
      return;
    }
    if (capability === 'room.use' && !explicit) {
      throw new Vibe3DError(
        'E_INVALID_PARAMS',
        'vibe3d_use_room 需要 room_id：它把当前会话切到指定房间（只换绑定，不弹窗）。房间列表用 vibe3d_list_rooms。',
      );
    }
    if (explicit) {
      input.roomId = explicit;
      return;
    }
    input.roomId = capability === 'editor.open' ? await this.ensureRoom() : this.session.require();
  }

  private async ensureRoom(): Promise<string> {
    const room = await this.studio.createRoom({ name: 'MCP 会话房间' });
    this.session.bind(room.id);
    return room.id;
  }

  private afterCall(capability: CapabilityName, params: Record<string, unknown>, result: unknown): void {
    if (capability === 'room.create') {
      this.session.bind((result as { roomId: string }).roomId);
      return;
    }
    if (capability === 'room.close') {
      this.session.release(String(params.roomId));
      return;
    }
    if (capability === 'room.use' || capability === 'room.get' || capability === 'editor.open') {
      const roomId = params.roomId;
      if (typeof roomId === 'string') this.session.bind(roomId);
    }
  }

  private async dispatch(capability: CapabilityName, params: Record<string, unknown>): Promise<unknown> {
    if (viewOf(capability).scope === 'daemon') {
      return this.studio.client.call(capability, params);
    }
    const room = this.studio.room(String(params.roomId)) as RoomHandle;
    const { roomId: _ignored, ...rest } = params;
    return (room.invoke as (method: CapabilityName, input: Record<string, unknown>) => Promise<unknown>)(
      capability,
      rest,
    );
  }
}
