export const DEFAULT_TIMEOUT_MS = 30_000;
export const RENDER_TIMEOUT_MS = 120_000;

export function timeoutFor(method: string): number {
  return method.startsWith('render.') ? RENDER_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
}
