import { CAPABILITIES, type CapabilityName, MCP_TOOLS } from '@vibebyte/vibe3d-capabilities';
import { type RoomHandle, type Studio, Vibe3DError } from '@vibebyte/vibe3d-client';

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

const toCamel = (key: string): string => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function deepCamel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepCamel);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, sub] of Object.entries(value as Record<string, unknown>))
    out[toCamel(key)] = deepCamel(sub);
  return out;
}

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
    description: tool.title,
    inputSchema: tool.inputSchema,
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

export class ToolRuntime {
  private readonly studio: Studio;
  defaultRoomId?: string;

  constructor(studio: Studio, defaultRoomId?: string) {
    this.studio = studio;
    this.defaultRoomId = defaultRoomId ?? process.env.VIBE3D_ROOM;
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
      if (spec.scope === 'room' && !input.roomId) {
        if (!this.defaultRoomId) {
          throw new Vibe3DError(
            'E_INVALID_PARAMS',
            '缺少 room_id：先调用 vibe3d_create_room，或显式传 room_id',
          );
        }
        input.roomId = this.defaultRoomId;
      }
      const params = spec.input.safeParse(input);
      if (!params.success) {
        throw new Vibe3DError('E_INVALID_PARAMS', `${capability} 参数校验失败`, {
          issues: params.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      const result = await this.dispatch(capability, params.data as Record<string, unknown>);
      if (capability === 'room.create') this.defaultRoomId = (result as { roomId: string }).roomId;
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

  private async dispatch(capability: CapabilityName, params: Record<string, unknown>): Promise<unknown> {
    if (spec_of(capability).scope === 'daemon') {
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

function spec_of(capability: CapabilityName): { scope: 'daemon' | 'room' } {
  return CAPABILITIES[capability] as { scope: 'daemon' | 'room' };
}
