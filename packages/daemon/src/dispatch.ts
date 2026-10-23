import { CAPABILITIES, CAPABILITY_NAMES, type CapabilityName } from '@vibebyte/vibe3d-capabilities';
import { AppError, DAEMON_VERSION, PROTOCOL_VERSION } from '@vibebyte/vibe3d-protocol';
import type { DispatchContext, HelloResult } from './context';
import { assetHandlers } from './handlers/asset';
import { renderHandlers } from './handlers/render';
import { roomHandlers } from './handlers/room';
import { sceneHandlers } from './handlers/scene';

type AnyHandler = (p: never, ctx: DispatchContext) => Promise<unknown>;

const HANDLERS = {
  ...roomHandlers,
  ...sceneHandlers,
  ...assetHandlers,
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
    throw new AppError('E_INVALID_PARAMS', `${name} 参数校验失败`, {
      issues: input.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
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
  return output.data;
}
