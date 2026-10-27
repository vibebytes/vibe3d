import {
  CAPABILITIES,
  CAPABILITY_NAMES,
  type CapabilityName,
  buildOpSample,
  describeIssues,
  toIssues,
} from '@vibebyte/vibe3d-capabilities';
import { AppError, DAEMON_VERSION, GEOMETRY_FIELD_ALIASES, PROTOCOL_VERSION, legacyGeometryNotes } from '@vibebyte/vibe3d-protocol';
import type { AutoOpenState, DispatchContext, HelloResult } from './context';
import { assetHandlers } from './handlers/asset';
import { backdropHandlers } from './handlers/backdrop';
import { booleanHandlers } from './handlers/boolean';
import { checkpointHandlers } from './handlers/checkpoints';
import { decalHandlers } from './handlers/decal';
import { editorUrl } from './handlers/editor-url';
import { renderHandlers } from './handlers/render';
import { roomHandlers } from './handlers/room';
import { sceneHandlers } from './handlers/scene';
import { systemHandlers } from './handlers/system';
import { tubeHandlers } from './handlers/tube';

type AnyHandler = (p: never, ctx: DispatchContext) => Promise<unknown>;

const VISUAL_MUTATIONS = new Set<CapabilityName>([
  'room.create',
  'ops.apply',
  'node.create',
  'node.update',
  'node.delete',
  'node.clone',
  'node.merge',
  'node.import',
  'stage.set',
  'camera.set',
  'animation.play',
  'animation.stop',
  'scene.undo',
  'scene.redo',
  'scene.import',
  'scene.restore',
  'asset.put',
  'asset.delete',
  'decal.create',
  'mesh.boolean',
  'mesh.tube',
  'mesh.backdrop',
]);

// Routes build a fresh ctx per request (spread), so dedupe must key on a stable instance.
const nudged = new WeakMap<object, Map<string, AutoOpenState>>();

function autoOpenState(ctx: DispatchContext): Map<string, AutoOpenState> {
  if (ctx.autoOpen) return ctx.autoOpen;
  let state = nudged.get(ctx.rooms);
  if (!state) {
    state = new Map<string, AutoOpenState>();
    nudged.set(ctx.rooms, state);
  }
  return state;
}

function roomIdOf(params: unknown, result: unknown): string | undefined {
  const fromParams = (params as { roomId?: unknown } | null)?.roomId;
  if (typeof fromParams === 'string') return fromParams;
  const fromResult = (result as { roomId?: unknown } | null)?.roomId;
  return typeof fromResult === 'string' ? fromResult : undefined;
}

function autoOpenEditor(name: CapabilityName, params: unknown, result: unknown, ctx: DispatchContext): void {
  const open = ctx.openExternal;
  if (!open || !VISUAL_MUTATIONS.has(name)) return;
  const roomId = roomIdOf(params, result);
  if (!roomId) return;
  if ((ctx.surfaces?.(roomId) ?? 0) > 0) return;
  const state = autoOpenState(ctx);
  if (state.has(roomId)) return;
  state.set(roomId, 'pending');
  const log = ctx.logger;
  const fail = (err?: unknown): void => {
    state.set(roomId, 'failed');
    log?.warn({ event: 'surface.autoopen', roomId, trigger: name, ok: false, err: err ? String(err) : undefined });
  };
  try {
    void Promise.resolve(open({ url: editorUrl(ctx, roomId), roomId }))
      .then((ok) => {
        state.set(roomId, ok ? 'opened' : 'failed');
        log?.info({ event: 'surface.autoopen', roomId, trigger: name, ok });
      })
      .catch(fail);
  } catch (err) {
    // 打不开浏览器不影响写场景
    fail(err);
  }
}

const HANDLERS = {
  ...systemHandlers,
  ...roomHandlers,
  ...sceneHandlers,
  ...checkpointHandlers,
  ...assetHandlers,
  ...decalHandlers,
  ...booleanHandlers,
  ...tubeHandlers,
  ...backdropHandlers,
  ...renderHandlers,
} as unknown as Record<CapabilityName, AnyHandler>;

const ALIASES: Record<string, CapabilityName> = {
  'scene.apply': 'ops.apply',
};

for (const name of CAPABILITY_NAMES) {
  if (!HANDLERS[name]) throw new Error(`capability ${name} 缺少 daemon handler`);
}

export function hello(ctx: DispatchContext): HelloResult {
  return {
    protocolVersion: PROTOCOL_VERSION,
    daemonVersion: DAEMON_VERSION,
    renderer: ctx.renderer?.name ?? 'none',
    capabilities: [...CAPABILITY_NAMES],
  };
}

export function resolveMethod(method: string): CapabilityName {
  const name = (ALIASES[method] ?? method) as CapabilityName;
  if (!CAPABILITIES[name]) {
    throw new AppError('E_NO_METHOD', `方法不存在：${method}`);
  }
  return name;
}

// 迁移提示只能用未解析的入参算：geometrySchema 解析时就把 radius 展开掉了
function withMigrationNotes(name: CapabilityName, raw: unknown, result: unknown): unknown {
  if (name !== 'ops.apply' || !result || typeof result !== 'object') return result;
  const notes = legacyGeometryNotes((raw ?? {}) as { ops?: ReadonlyArray<unknown> });
  if (notes.length === 0) return result;
  const { warnings } = result as { warnings?: unknown };
  return { ...result, warnings: [...(Array.isArray(warnings) ? warnings : []), ...notes] };
}

const MAX_HINT_EXAMPLE_CHARS = 400;

const buildHint = (name: CapabilityName, issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string => {
  const first = issues[0];
  const head = first?.path?.length
    ? `检查参数 ${first.path.join('.')}：${first.message}`
    : `检查 ${name} 参数：${first?.message ?? '请求体不完整'}`;
  const sample = buildOpSample(name);
  if (sample === undefined) return head;
  const rendered = JSON.stringify(sample);
  const trimmed = rendered.length > MAX_HINT_EXAMPLE_CHARS ? `${rendered.slice(0, MAX_HINT_EXAMPLE_CHARS)}…` : rendered;
  return `${head}；最小示例 ${trimmed}`;
};

const normalizeFieldAliases = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(normalizeFieldAliases);
  if (!v || typeof v !== 'object') return v;
  const out: Record<string, unknown> = {};
  let changed = false;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const to = GEOMETRY_FIELD_ALIASES[k];
    if (to !== undefined) {
      if (out[to] === undefined) out[to] = val;
      changed = true;
      continue;
    }
    out[k] = normalizeFieldAliases(val);
  }
  return changed ? out : v;
};

export async function dispatch(method: string, params: unknown, ctx: DispatchContext): Promise<unknown> {
  const name = resolveMethod(method);
  const spec = CAPABILITIES[name];
  const input = spec.input.safeParse(normalizeFieldAliases(params ?? {}));
  if (!input.success) {
    const issues = toIssues(input.error.issues);
    throw new AppError('E_INVALID_PARAMS', `${name} 参数校验失败：${describeIssues(input.error.issues)}`, {
      issues,
      hint: buildHint(name, input.error.issues),
      docRef: `#${name.replaceAll('.', '-')}`,
    });
  }

  const result = await HANDLERS[name](input.data as never, ctx);
  const output = spec.output.safeParse(withMigrationNotes(name, params, result));
  if (!output.success) {
    throw new AppError('E_INTERNAL', `${name} 返回值不符合协议`, {
      issues: output.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  autoOpenEditor(name, input.data, output.data, ctx);
  return output.data;
}
