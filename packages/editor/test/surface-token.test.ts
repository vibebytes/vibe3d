import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setToken, token } from '../src/lib/rpc';
import { applyGrant } from '../src/lib/surface-grant';
import { surfaceCan, surfaceToken, useSurface } from '../src/stores/surface';

const grant = (toolScope: string[]) => ({
  surfaceId: 'vibe3d.editor',
  instanceKey: 'k1',
  theme: 'dark' as const,
  token: 'fast-surface-token',
  toolScope,
});

describe('applyGrant', () => {
  beforeEach(() => {
    useSurface.getState().setGrant(null);
    setToken('');
  });

  it('host.token 不得覆盖 daemon token（两者签发方不同）', () => {
    setToken('vibe3d-daemon-token');
    applyGrant(grant(['tool.call']));
    expect(token()).toBe('vibe3d-daemon-token');
  });

  it('grant 存进 store，surfaceToken 暴露宿主 token', () => {
    setToken('vibe3d-daemon-token');
    applyGrant(grant(['tool.call']));
    expect(surfaceToken()).toBe('fast-surface-token');
    expect(surfaceCan('tool.call')).toBe(true);
    expect(surfaceCan('clipboard')).toBe(false);
  });

  it('无 grant 时 surfaceCan 一律 false', () => {
    expect(surfaceCan('tool.call')).toBe(false);
  });

  it('收到 grant 后广播 vibe3d:token，让已连的 socket 重连', () => {
    const seen = vi.fn();
    const listeners = new Set<EventListener>();
    vi.stubGlobal('window', {
      addEventListener: (_: string, fn: EventListener) => listeners.add(fn),
      removeEventListener: (_: string, fn: EventListener) => listeners.delete(fn),
      dispatchEvent: (ev: Event) => {
        for (const fn of [...listeners]) fn(ev);
        return true;
      },
    });
    vi.stubGlobal(
      'CustomEvent',
      class {
        type: string;
        constructor(type: string) {
          this.type = type;
        }
      },
    );
    window.addEventListener('vibe3d:token', seen);
    applyGrant(grant(['tool.call']));
    expect(seen).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
