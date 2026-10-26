export const DEFAULT_TIMEOUT_MS = 30_000;
// 低于 fast 引擎 120s 的 callTimeout：保证 daemon 侧超时能以优雅错误先回到调用方，而不是被打成 transport timeout
export const RENDER_TIMEOUT_MS = 110_000;

export function timeoutFor(method: string): number {
  return method.startsWith('render.') ? RENDER_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
}
