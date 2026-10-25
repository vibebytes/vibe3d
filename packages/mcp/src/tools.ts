import {
  CAPABILITIES,
  type CapabilityName,
  MCP_TOOLS,
  describeIssues,
  toIssues,
} from '@vibebyte/vibe3d-capabilities';
import { type RoomHandle, type Studio, Vibe3DError } from '@vibebyte/vibe3d-client';
import { coerceForSchema, deepCamel } from './coerce';
import { paramHint, schemaHint } from './hints';
import { describeTool, presentSchema } from './presentation';
import { RoomSession } from './session';

export type ToolDef = (typeof MCP_TOOLS)[number];

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

export function toolByName(name: string): ToolDef | undefined {
  return MCP_TOOLS.find((tool) => tool.name === name);
}

export function listTools(): Array<{
  name: string;
  description: string;
  inputSchema: unknown;
  annotations?: unknown;
}> {
  return MCP_TOOLS.map((tool) => ({
    name: tool.name,
    description: describeTool(tool),
    inputSchema: presentSchema(tool),
    annotations: tool.annotations,
  }));
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
    const tool = toolByName(name);
    if (!tool) {
      return {
        content: [
          { type: 'text', text: JSON.stringify({ code: 'E_NO_METHOD', message: `未知工具：${name}` }) },
        ],
        isError: true,
      };
    }
    const capability = tool.capability as CapabilityName;
    const spec = CAPABILITIES[capability];
    try {
      const input = deepCamel(rawArgs ?? {}) as Record<string, unknown>;
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
