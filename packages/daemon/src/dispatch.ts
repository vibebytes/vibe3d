import {
  CAPABILITIES,
  CAPABILITY_NAMES,
  type CapabilityName,
  describeIssues,
  toIssues,
} from '@vibebyte/vibe3d-capabilities';
import { AppError, DAEMON_VERSION, PROTOCOL_VERSION } from '@vibebyte/vibe3d-protocol';
import type { AutoOpenState, DispatchContext, HelloResult } from './context';
import { assetHandlers } from './handlers/asset';
import { booleanHandlers } from './handlers/boolean';
import { checkpointHandlers } from './handlers/checkpoints';
import { decalHandlers } from './handlers/decal';
import { editorUrl } from './handlers/editor-url';
import { renderHandlers } from './handlers/render';
import { roomHandlers } from './handlers/room';
import { sceneHandlers } from './handlers/scene';

type AnyHandler = (p: never, ctx: DispatchContext) => Promise<unknown>;

const VISUAL_MUTATIONS = new Set<CapabilityName>([
  'room.create',
  'ops.apply',
  'node.create',
  'node.update',
  'node.delete',
  'node.clone',
  'node.import',
  'stage.set',
  'camera.set',
  'animation.play',
  'scene.undo',
  'scene.redo',
  'scene.import',
  'scene.restore',
  'asset.put',
  'asset.delete',
  'decal.create',
  'mesh.boolean',
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
  const fail = (): void => {
    state.set(roomId, 'failed');
  };
  try {
    void Promise.resolve(open(editorUrl(ctx, roomId)))
      .then((ok) => state.set(roomId, ok ? 'opened' : 'failed'))
      .catch(fail);
  } catch {
    // 打不开浏览器不影响写场景
    fail();
  }
}

const HANDLERS = {
  ...roomHandlers,
  ...sceneHandlers,
  ...checkpointHandlers,
  ...assetHandlers,
  ...decalHandlers,
  ...booleanHandlers,
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

export async function dispatch(method: string, params: unknown, ctx: DispatchContext): Promise<unknown> {
  const name = resolveMethod(method);
  const spec = CAPABILITIES[name];
  const input = spec.input.safeParse(params ?? {});
  if (!input.success) {
    const issues = toIssues(input.error.issues);
    throw new AppError('E_INVALID_PARAMS', `${name} 参数校验失败：${describeIssues(input.error.issues)}`, {
      issues,
    });
  }

  const result = await HANDLERS[name](input.data as never, ctx);
  const output = spec.output.safeParse(result);
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
