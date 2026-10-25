import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHeartbeat } from '../src/ws/heartbeat';

function fakeHub() {
  const calls: string[] = [];
  return {
    calls,
    hub: {
      pingAll: () => calls.push('ping'),
      sweep: (idleMs: number) => {
        calls.push(`sweep:${idleMs}`);
        return 1;
      },
    },
  };
}

afterEach(() => vi.useRealTimers());

describe('createHeartbeat', () => {
  it('pings, sweeps and reports evictions on each tick', () => {
    const { hub, calls } = fakeHub();
    const evicted: number[] = [];
    const beat = createHeartbeat({
      hub,
      intervalMs: 1_000,
      idleMs: 5_000,
      onEvict: (n) => evicted.push(n),
    });
    expect(beat.tick()).toBe(1);
    expect(calls).toEqual(['ping', 'sweep:5000']);
    expect(evicted).toEqual([1]);
  });

  it('stays quiet when nothing was evicted', () => {
    const evicted: number[] = [];
    const beat = createHeartbeat({
      hub: { pingAll: () => undefined, sweep: () => 0 },
      onEvict: (n) => evicted.push(n),
    });
    beat.tick();
    expect(evicted).toEqual([]);
  });

  it('ticks on the configured interval and stops cleanly', () => {
    vi.useFakeTimers();
    const { hub, calls } = fakeHub();
    const beat = createHeartbeat({ hub, intervalMs: 1_000, idleMs: 10 });
    beat.start();
    vi.advanceTimersByTime(3_000);
    expect(calls.filter((c) => c === 'ping')).toHaveLength(3);
    beat.stop();
    vi.advanceTimersByTime(3_000);
    expect(calls.filter((c) => c === 'ping')).toHaveLength(3);
  });
});
