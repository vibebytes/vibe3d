export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
export const DEFAULT_HEARTBEAT_IDLE_MS = 90_000;

export interface HeartbeatTarget {
  pingAll(): void;
  sweep(idleMs: number, now?: number): number;
}

export interface HeartbeatOptions {
  hub: HeartbeatTarget;
  intervalMs?: number;
  idleMs?: number;
  onEvict?: (count: number) => void;
}

export interface Heartbeat {
  tick(): number;
  start(): void;
  stop(): void;
}

export function createHeartbeat(opts: HeartbeatOptions): Heartbeat {
  const intervalMs = opts.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const idleMs = opts.idleMs ?? DEFAULT_HEARTBEAT_IDLE_MS;
  let timer: ReturnType<typeof setInterval> | undefined;

  const tick = (): number => {
    opts.hub.pingAll();
    const evicted = opts.hub.sweep(idleMs);
    if (evicted > 0) opts.onEvict?.(evicted);
    return evicted;
  };

  return {
    tick,
    start() {
      if (timer) return;
      timer = setInterval(tick, intervalMs);
      timer.unref?.();
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    },
  };
}
