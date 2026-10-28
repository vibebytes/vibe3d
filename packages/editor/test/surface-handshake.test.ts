import { describe, expect, it, vi } from 'vitest';
import { installSurfaceHandshake, isFromParent } from '../src/lib/surface-handshake';

type Listener = (ev: MessageEvent) => void;

function fakeWindow() {
  const listeners = new Set<Listener>();
  const posted: unknown[] = [];
  const parent = { postMessage: (msg: unknown) => posted.push(msg) };
  const win = {
    parent,
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
  };
  const send = (data: unknown, source: unknown = parent) => {
    for (const fn of [...listeners]) fn({ data, source } as MessageEvent);
  };
  return { win, parent, posted, send, listeners };
}

const mount = (w: ReturnType<typeof fakeWindow>, onGrant = vi.fn()) => {
  const stop = installSurfaceHandshake({
    win: w.win as unknown as Window,
    capabilities: ['tool.call'],
    onGrant,
  });
  return { stop, onGrant };
};

describe('installSurfaceHandshake', () => {
  it('独立标签页（无父窗口）不安装任何监听', () => {
    const w = fakeWindow();
    w.win.parent = w.win as unknown;
    const { stop } = mount(w);
    expect(w.listeners.size).toBe(0);
    stop();
  });

  it('挂载即主动 announce 一次 surface.ready', () => {
    const w = fakeWindow();
    mount(w);
    expect(w.posted).toEqual([{ kind: 'surface.ready', capabilities: ['tool.call'] }]);
  });

  it('host.ready → 回 surface.ready，且只回一次', () => {
    const w = fakeWindow();
    mount(w);
    const ready = {
      kind: 'host.ready',
      surfaceId: 'vibe3d.editor',
      instanceKey: 'k1',
      theme: 'dark',
      size: { width: 1, height: 1 },
    };
    w.send(ready);
    w.send(ready);
    expect(w.posted).toEqual([
      { kind: 'surface.ready', capabilities: ['tool.call'] },
      { kind: 'surface.ready', capabilities: ['tool.call'] },
    ]);
  });

  it('host.token → onGrant 带上 ready 里的 surfaceId / instanceKey', () => {
    const w = fakeWindow();
    const { onGrant } = mount(w);
    w.send({
      kind: 'host.ready',
      surfaceId: 'vibe3d.editor',
      instanceKey: 'k1',
      theme: 'light',
      size: { width: 1, height: 1 },
    });
    w.send({ kind: 'host.token', token: 'tok', toolScope: ['vibe3d_status', 7] });
    expect(onGrant).toHaveBeenCalledWith({
      surfaceId: 'vibe3d.editor',
      instanceKey: 'k1',
      theme: 'light',
      token: 'tok',
      toolScope: ['vibe3d_status'],
    });
  });

  it('非父窗口 / 畸形消息一律丢弃', () => {
    const w = fakeWindow();
    const { onGrant } = mount(w);
    w.send({ kind: 'host.token', token: 'tok', toolScope: [] }, { other: true });
    w.send({ kind: 'host.token', token: '', toolScope: [] });
    w.send({ kind: 'host.ready', surfaceId: 1 });
    w.send('nope');
    expect(w.posted).toEqual([{ kind: 'surface.ready', capabilities: ['tool.call'] }]);
    expect(onGrant).not.toHaveBeenCalled();
  });

  it('dispose 后不再响应', () => {
    const w = fakeWindow();
    const { stop, onGrant } = mount(w);
    stop();
    w.send({ kind: 'host.token', token: 'tok', toolScope: [] });
    expect(onGrant).not.toHaveBeenCalled();
  });
});

describe('isFromParent', () => {
  it('只认 window.parent', () => {
    const w = fakeWindow();
    expect(isFromParent(w.win as unknown as Window, w.parent as unknown as MessageEventSource)).toBe(true);
    expect(isFromParent(w.win as unknown as Window, null)).toBe(false);
    expect(isFromParent(w.win as unknown as Window, {} as MessageEventSource)).toBe(false);
  });
});
