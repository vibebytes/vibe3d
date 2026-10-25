import { describe, expect, it } from 'vitest';
import { WsHub } from '../src/ws/hub';

const ROOM = 'r_aaaaaaaa';

function fakeSocket() {
  const frames: any[] = [];
  const closed: Array<{ code?: number; reason?: string }> = [];
  const socket = {
    send(data: string) {
      frames.push(JSON.parse(data));
    },
    close(code?: number, reason?: string) {
      closed.push({ code, reason });
    },
    bufferedAmount: 0,
  };
  return { socket, frames, closed };
}

describe('WsHub client identity', () => {
  it('replaces the previous socket when a clientId reconnects', () => {
    const hub = new WsHub();
    const a = fakeSocket();
    const b = fakeSocket();
    hub.add(ROOM, a.socket, { clientId: 'c1' });
    hub.add(ROOM, b.socket, { clientId: 'c1' });
    expect(hub.count(ROOM)).toBe(1);
    expect(hub.total()).toBe(1);
    expect(a.closed).toEqual([{ code: 1000, reason: 'replaced' }]);
    expect(b.closed).toEqual([]);
  });

  it('keeps anonymous sockets distinct', () => {
    const hub = new WsHub();
    hub.add(ROOM, fakeSocket().socket);
    hub.add(ROOM, fakeSocket().socket);
    expect(hub.count(ROOM)).toBe(2);
  });

  it('does not count headless pages as editors', () => {
    const hub = new WsHub();
    hub.add(ROOM, fakeSocket().socket, { clientId: 'editor-1' });
    hub.add(ROOM, fakeSocket().socket, { clientId: 'h1', headless: true });
    expect(hub.count(ROOM)).toBe(1);
    expect(hub.countAll(ROOM)).toBe(2);
    expect(hub.total()).toBe(2);
  });

  it('pings every socket so idle clients can answer', () => {
    const hub = new WsHub();
    const a = fakeSocket();
    const b = fakeSocket();
    hub.add(ROOM, a.socket);
    hub.add('r_bbbbbbbb', b.socket);
    hub.pingAll();
    expect(a.frames.filter((f) => f.type === 'ping')).toEqual([{ type: 'ping' }]);
    expect(b.frames.filter((f) => f.type === 'ping')).toEqual([{ type: 'ping' }]);
  });

  it('evicts clients that stayed silent past the idle window', () => {
    const hub = new WsHub();
    const stale = fakeSocket();
    const fresh = fakeSocket();
    const a = hub.add(ROOM, stale.socket, { clientId: 'a' });
    const b = hub.add(ROOM, fresh.socket, { clientId: 'b' });
    hub.touch(a, 1_000);
    hub.touch(b, 2_000);
    const evicted = hub.sweep(500, 2_100);
    expect(evicted).toBe(1);
    expect(stale.closed).toEqual([{ code: 1000, reason: 'idle' }]);
    expect(fresh.closed).toEqual([]);
    expect(hub.countAll(ROOM)).toBe(1);
  });

  it('drops an evicted socket without waiting for its close event', () => {
    const hub = new WsHub();
    const s = fakeSocket();
    const client = hub.add(ROOM, s.socket, { clientId: 'z' });
    hub.touch(client, 1);
    hub.sweep(0, 5);
    hub.remove(client);
    expect(hub.countAll(ROOM)).toBe(0);
  });
});
