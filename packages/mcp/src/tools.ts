import { appendFileSync } from 'node:fs';
import {
  CAPABILITIES,
  type CapabilityName,
  MCP_LEGACY_ALIASES,
  MCP_TOOLS,
  type McpToolDoc,
  describeCapability,
  describeIssues,
  mergedFieldDocs,
  opExample,
  toIssues,
} from '@vibebyte/vibe3d-capabilities';
import { type CallOptions, type RoomHandle, type Studio, Vibe3DError } from '@vibebyte/vibe3d-client';
import { coerceForSchema, deepCamel, lenientRecord } from './coerce';
import { opItemAt, opNameAt, paramHint, schemaHint } from './hints';
import { describeTool, presentSchema } from './presentation';
import { repairInput } from './repair';
import { recordRepair } from './repair-stats';
import { RoomSession } from './session';

export type ToolDef = McpToolDoc;

const TOOL_NAMES = MCP_TOOLS.map((tool) => tool.name as string);
const ALL_OP_NAMES = [...new Set(MCP_TOOLS.flatMap((tool) => tool.ops.map((op) => op.op)))];

export const HELP_TOOL = {
  name: 'vibe3d_help',
  title:
    '查参数契约：给 tool(+op) 返回该 op 的参数字段/必填/枚举/错误码与示例；不给 tool 则列出全部工具与 op',
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      tool: { type: 'string', enum: TOOL_NAMES, description: '工具名；省略则列出全部工具与 op' },
      op: { type: 'string', enum: ALL_OP_NAMES, description: '该工具下的 op；省略则返回该工具全部 op' },
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

interface EditorOpenResult {
  url: string;
  reused: boolean;
  opened: boolean;
  editors: number;
  hint?: string;
}

function editorOpenView(result: unknown): Record<string, unknown> {
  const r = (result ?? {}) as Partial<EditorOpenResult>;
  const editors = typeof r.editors === 'number' ? r.editors : 0;
  const state = editors > 0 ? 'connected' : r.opened ? 'opening' : 'not_connected';
  const next =
    editors > 0
      ? '编辑器已连接：直接改场景，画面会实时推送；不要再调用 vibe3d_open_editor。'
      : r.opened
        ? '窗口已弹出，页面连接需要 1–2 秒；先做别的改动，稍后用 vibe3d_render_snapshot 或 vibe3d_room {op:"get"} 的 editors 确认。'
        : '没有窗口连接：把 url 交给用户手动打开，或改用 vibe3d_render_snapshot 出图。';
  return { ...r, state, next };
}

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

export const DAEMON_LINK_CODES = new Set<string>([
  'E_NETWORK',
  'E_NO_DAEMON',
  'E_UNAUTHORIZED',
  'E_DAEMON_OUTDATED',
  'E_PROTOCOL',
]);

interface Picked {
  capability: CapabilityName;
  op: string;
  input: Record<string, unknown>;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined => lenientRecord(value);

function unwrapWrapper(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  for (const key of keys) {
    const inner = asRecord(input[key]);
    if (!inner) continue;
    const { [key]: _wrapped, ...rest } = input;
    return { ...rest, ...inner };
  }
  return input;
}

const wrapperKeys = (tool: ToolDef, op: string): string[] => [op, tool.name.replace(/^vibe3d_/, '')];

const IGNORED_KEYS = new Set(['op', 'params', 'roomId']);

const unwrapSchema = (spec: unknown, hops = 4): unknown => {
  let cur: unknown = spec;
  for (let i = 0; i < hops; i += 1) {
    if (cur && typeof cur === 'object' && 'shape' in cur && (cur as { shape: unknown }).shape) return cur;
    const inner = cur as { unwrap?: () => unknown; removeDefault?: () => unknown } | null;
    if (inner && typeof inner.unwrap === 'function') {
      cur = inner.unwrap();
      continue;
    }
    if (inner && typeof inner.removeDefault === 'function') {
      cur = inner.removeDefault();
      continue;
    }
    break;
  }
  return cur && typeof cur === 'object' && 'shape' in cur ? cur : undefined;
};

function droppedKeys(spec: unknown, payload: unknown, depth = 0): string[] {
  if (depth > 3 || payload === null || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const unwrapped = unwrapSchema(spec);
  const shape = (unwrapped as { shape?: Record<string, unknown> } | undefined)?.shape;
  if (!shape) return [];
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (!(key in shape)) {
      if (!IGNORED_KEYS.has(key)) dropped.push(key);
      continue;
    }
    for (const nested of droppedKeys(shape[key], value, depth + 1)) {
      dropped.push(`${key}.${nested}`);
    }
  }
  return dropped;
}

function pickOp(tool: ToolDef, rawArgs: unknown, pinnedOp?: string): Picked | { error: string } {
  const raw = (rawArgs ?? {}) as Record<string, unknown>;
  const given = asRecord(raw.params);
  const top = Object.fromEntries(Object.entries(raw).filter(([k]) => k !== 'op' && k !== 'params'));
  const merged = { ...(given ?? {}), ...(deepCamel(top) as Record<string, unknown>) };
  const names = tool.ops.map((o) => o.op);
  const norm = (value: string): string =>
    value
      .replace(/([a-z0-9])([A-Z])/g, '$1.$2')
      .toLowerCase()
      .split(/[.\s_-]+/)
      .filter(Boolean)
      .sort()
      .join('.');
  const resolve = (value: unknown): string | undefined => {
    if (typeof value !== 'string' || !value) return undefined;
    const hit = names.find((name) => name === value) ?? names.find((name) => norm(name) === norm(value));
    if (hit) return hit;
    const tails = names.filter((name) => name.split('.').pop() === value.trim().toLowerCase());
    return tails.length === 1 ? tails[0] : undefined;
  };
  const alias =
    typeof raw.op === 'string' && raw.op
      ? { key: 'op', value: raw.op }
      : typeof given?.op === 'string' && given.op
        ? { key: 'op', value: given.op }
        : typeof raw.action === 'string' && raw.action
          ? { key: 'action', value: raw.action }
          : typeof raw.type === 'string' && raw.type
            ? { key: 'type', value: raw.type }
            : undefined;
  const asked = alias?.value ?? pinnedOp;
  const wanted = asked ? (resolve(asked) ?? asked) : undefined;
  const consumed = alias && alias.key !== 'op' && resolve(alias.value) ? alias.key : undefined;
  const stripAlias = (input: Record<string, unknown>): Record<string, unknown> => {
    if (!consumed || (given && consumed in given)) return input;
    const { [consumed]: _dropped, ...rest } = input;
    return rest;
  };
  const hasId = merged.nodeId !== undefined || merged.id !== undefined || raw.nodeId !== undefined;
  const inferred =
    !wanted && names.includes('create') && names.includes('update')
      ? hasId
        ? 'update'
        : 'kind' in merged
          ? 'create'
          : undefined
      : undefined;
  const chosen = wanted ?? inferred;

  if (tool.ops.length === 1) {
    const only = tool.ops[0];
    if (!only) return { error: `${tool.name} 没有可调用的 op` };
    if (chosen && chosen !== only.op) {
      return { error: `${tool.name} 只支持 op ${only.op}，收到 ${chosen}；直接传参数即可` };
    }
    const flat = stripAlias(given ? merged : (deepCamel(raw) as Record<string, unknown>));
    return {
      capability: only.capability,
      op: only.op,
      input: unwrapWrapper(flat, wrapperKeys(tool, only.op)),
    };
  }

  if (!chosen) {
    return {
      error: `${tool.name} 需要 op 字段（可选：${names.join(' / ')}）。形如 {"op":"${names[0]}","params":{...}}；字段细节用 vibe3d_help {tool:"${tool.name}", op}`,
    };
  }
  const hit = tool.ops.find((o) => o.op === chosen || o.capability === chosen);
  if (!hit) {
    const near = names.filter((n) => n.includes(chosen) || chosen.includes(n));
    return {
      error: `${tool.name} 没有 op「${chosen}」。可选：${names.join(' / ')}${near.length > 0 ? `；是否想用 ${near.join(' / ')}` : ''}`,
    };
  }
  return {
    capability: hit.capability,
    op: hit.op,
    input: unwrapWrapper(stripAlias(merged), wrapperKeys(tool, hit.op)),
  };
}

export const ALIAS_NOTE =
  '参数容错：id/node_id 可代替 nodeId，job_id 可代替 jobId，p/r/s 会并入 transform，缺省分量按 0/0/1 补齐；node.create 的字段可直接平铺在 op 上。';

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
  const direct = op ? tool.ops.filter((o) => o.op === op) : tool.ops;
  const entries = direct.length > 0 || !op ? direct : tool.ops.filter((o) => o.capability === op);
  if (entries.length === 0) {
    const member = op ? opContractFields(op) : {};
    if (op && member.fields) {
      return JSON.stringify({
        tool: tool.name,
        op,
        usage: '这是 ops[] 数组里的一项；整包形如 {"op":"apply","ops":[<这一项>]}',
        note: ALIAS_NOTE,
        ...member,
      });
    }
    return JSON.stringify({
      error: `${tool.name} 没有 op「${op}」；短名如 ${tool.ops[0]?.op ?? 'create'}，全名如 ${tool.ops[0]?.capability ?? 'node.create'} 都接受`,
      ops: tool.ops.map((o) => o.op),
    });
  }
  const only = entries[0];
  return JSON.stringify({
    tool: tool.name,
    title: tool.title,
    note: ALIAS_NOTE,
    ops: entries.map((entry) => describeCapability(entry.capability)),
    ...(entries.length === 1 && only ? opContractFields(only.capability) : {}),
  });
}

function opContractFields(op: string): Record<string, unknown> {
  const docs = mergedFieldDocs(op);
  if (docs.length === 0) return {};
  const example = opExample(op);
  return {
    fields: docs.map(
      (doc) =>
        `${doc.path}：${doc.type}，${doc.required ? '必填' : '可选'}${doc.description ? ` — ${doc.description}` : ''}`,
    ),
    ...(example ? { example } : {}),
  };
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

class CallTimeout extends Error {
  constructor(
    readonly capability: string,
    readonly ms: number,
    readonly elapsedMs: number,
    readonly params: Record<string, unknown>,
  ) {
    super(`${capability} timed out after ${ms}ms`);
    this.name = 'CallTimeout';
  }
}

const DEFAULT_CALL_TIMEOUT_MS = 120_000;

export const callTimeoutMs = (): number => {
  const raw = Number(process.env.VIBE3D_CALL_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CALL_TIMEOUT_MS;
};

async function withDeadline<T>(
  work: Promise<T>,
  capability: string,
  params: Record<string, unknown>,
  onCancel?: (reason: string) => void,
): Promise<T> {
  const ms = callTimeoutMs();
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onCancel?.(`deadline ${ms}ms exceeded`);
      reject(new CallTimeout(capability, ms, Date.now() - startedAt, params));
    }, ms);
    timer.unref?.();
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface NextStep {
  tool: string;
  params?: Record<string, unknown>;
  why: string;
}

const halve = (value: unknown, fallback: number): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(64, Math.round(n / 2));
};

const fogFar = (fog: unknown): number | string => {
  const far = (fog as { far?: unknown } | null | undefined)?.far;
  return typeof far === 'number' && Number.isFinite(far) ? far : '?';
};

function timeoutNextSteps(capability: string, params: Record<string, unknown>): NextStep[] {
  const steps: NextStep[] = [];
  if (capability === 'render.snapshot') {
    steps.push({
      tool: 'vibe3d_render_snapshot',
      params: {
        width: halve(params.width, 1280),
        height: halve(params.height, 720),
        ...(params.quality ? { quality: params.quality } : {}),
      },
      why: '分辨率减半重试：像素数降到 1/4，出图耗时通常同比例下降',
    });
  }
  if (capability.startsWith('render.') || capability.startsWith('export.')) {
    steps.push({
      tool: 'vibe3d_job',
      params: { op: 'list' },
      why: '大图/多视角改用 job 异步：拿 job_id 轮询 vibe3d_job {op:"get"}，不会被单次调用超时打断',
    });
  }
  steps.push({
    tool: 'vibe3d_status',
    why: '探活 daemon 与渲染器；连续超时说明渲染器卡住，重启 daemon 后重试',
  });
  return steps;
}

function echoParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key === 'base64' || key === 'doc') {
      out[key] = '[omitted]';
      continue;
    }
    if (typeof value === 'string') {
      out[key] = value.length > 120 ? `${value.slice(0, 117)}...` : value;
      continue;
    }
    if (Array.isArray(value) && value.length > 8) {
      out[key] = { length: value.length, sample: value.slice(0, 3) };
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Host-side card contract: a producer declares "this is what I created", the host renders one
 * card and owns the click. A room is a scene whose open target is its own editor surface. */
function artifactBlock(capability: CapabilityName, result: unknown): string | undefined {
  if (capability !== 'room.create') return undefined;
  const r = (result ?? {}) as { roomId?: unknown; name?: unknown; url?: unknown; openUrl?: unknown };
  const roomId = typeof r.roomId === 'string' && r.roomId ? r.roomId : undefined;
  const url = [r.openUrl, r.url].find((v): v is string => typeof v === 'string' && v.length > 0);
  if (!roomId || !url) return undefined;
  const title = typeof r.name === 'string' && r.name ? r.name : roomId;
  const spec = {
    kind: 'scene',
    title,
    meta: [roomId],
    open: {
      kind: 'surface',
      extId: 'vibe3d',
      surfaceId: 'vibe3d.editor',
      url,
      instanceKey: roomId,
      roomId,
    },
  };
  return `<fast-artifact>${JSON.stringify(spec)}</fast-artifact>`;
}

function failure(err: unknown): ToolResult {
  if (err instanceof CallTimeout) {
    const payload = {
      code: 'E_TIMEOUT',
      message: `${err.capability} 超时：等了 ${err.elapsedMs}ms 仍未返回（预算 ${err.ms}ms，可用环境变量 VIBE3D_CALL_TIMEOUT_MS 调整）`,
      hint: '按 next 里的顺序降级重试：先减分辨率 / 改 job 异步，再探活 daemon；不要原样重试同一个大请求',
      timeoutMs: err.ms,
      elapsedMs: err.elapsedMs,
      params: echoParams(err.params),
      next: timeoutNextSteps(err.capability, err.params),
      retryable: true,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(payload) }],
      structuredContent: payload,
      isError: true,
    };
  }
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

function receivedSample(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value).slice(0, 40);
  if (typeof value === 'object' && value !== null) return Array.isArray(value) ? 'array' : 'object';
  return String(value);
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
    sample: field ? receivedSample(input[field]) : undefined,
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
      const repaired = repairInput(spec.input, input);
      if (repaired.fixes.length > 0) {
        process.stderr.write(
          `${JSON.stringify({ event: 'tool.repair', tool: name, capability, fixes: repaired.fixes })}\n`,
        );
        recordRepair({ tool: name, capability, fixes: repaired.fixes }, this.studio.home);
      }
      const payload = repaired.value as Record<string, unknown>;
      const params = spec.input.safeParse(coerceForSchema(spec.input, payload));
      if (!params.success) {
        reportToolError(name, params.error.issues, payload);
        throw new Vibe3DError(
          'E_INVALID_PARAMS',
          `${capability} 参数校验失败：${describeIssues(params.error.issues)}${paramHint(params.error.issues, opNameAt(payload, params.error.issues), opItemAt(payload, params.error.issues), payload)}${schemaHint(payload, params.error.issues, spec.input)}`,
          { issues: toIssues(params.error.issues) },
        );
      }
      const data = params.data as Record<string, unknown>;
      const dropped = droppedKeys(spec.input, payload);
      if (dropped.length > 0) {
        process.stderr.write(
          `${JSON.stringify({ event: 'tool.dropped', tool: name, capability, keys: dropped })}\n`,
        );
      }
      const droppedNote =
        dropped.length > 0
          ? `⚠ 以下字段不属于 ${capability}，本次未采用（结果按其余参数与 doc 当前机位执行）：${dropped.join(', ')}。参数平铺在顶层；正确键名用 vibe3d_help {tool:"${tool.name}", op:"${op}"} 查。`
          : '';
      const abort = new AbortController();
      const result = await withDeadline(
        this.dispatch(capability, data, abort.signal),
        capability,
        data,
        (reason) => abort.abort(new Error(reason)),
      );
      this.afterCall(capability, data, result);
      if (capability === 'render.snapshot') {
        const shot = result as {
          base64: string;
          mime: string;
          width: number;
          height: number;
          revision: number;
          quality?: string;
          fog?: unknown;
          distanceToTarget?: number | null;
          camera?: unknown;
          warning?: string | null;
        };
        const meta = {
          width: shot.width,
          height: shot.height,
          revision: shot.revision,
          mime: shot.mime,
          ...(shot.quality ? { quality: shot.quality } : {}),
          fog: shot.fog ?? null,
          distanceToTarget: shot.distanceToTarget ?? null,
          camera: shot.camera ?? null,
          warning: shot.warning ?? null,
        };
        const warningNote = shot.warning
          ? `⚠ ${shot.warning}（distanceToTarget=${shot.distanceToTarget ?? '?'}，fog.far=${fogFar(shot.fog)}）。先调 vibe3d_camera {op:"set"} 或 vibe3d_stage {op:"env"} 的 fog，再重出图。`
          : '';
        return {
          content: [
            { type: 'image', data: shot.base64, mimeType: shot.mime },
            { type: 'text', text: JSON.stringify(meta) },
            ...(warningNote ? [{ type: 'text' as const, text: warningNote }] : []),
            ...(droppedNote ? [{ type: 'text' as const, text: droppedNote }] : []),
          ],
          structuredContent: meta,
        };
      }
      const card = artifactBlock(capability, result);
      const content: Array<TextContent | ImageContent> = [
        { type: 'text', text: JSON.stringify(capability === 'editor.open' ? editorOpenView(result) : result) },
        ...(card ? [{ type: 'text' as const, text: card }] : []),
      ];
      if (droppedNote) content.push({ type: 'text', text: droppedNote });
      return { content, structuredContent: result };
    } catch (err) {
      if (err instanceof Vibe3DError && DAEMON_LINK_CODES.has(err.code)) throw err;
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

  private async dispatch(
    capability: CapabilityName,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (viewOf(capability).scope === 'daemon') {
      return this.studio.client.call(capability, params, { signal });
    }
    const room = this.studio.room(String(params.roomId)) as RoomHandle;
    const { roomId: _ignored, ...rest } = params;
    return (room.invoke as (method: CapabilityName, input: Record<string, unknown>, opts?: CallOptions) => Promise<unknown>)(
      capability,
      rest,
      { signal },
    );
  }
}
