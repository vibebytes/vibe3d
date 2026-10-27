import { describe, expect, it } from 'vitest';
import { WsHub } from '../src/ws/hub';
import { makeHarness } from './helpers/harness';

const ROOM = 'r_aaaaaaaa';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function fakeSocket(): {
  frames: Array<Record<string, unknown>>;
  socket: { send(data: string): void; close(): void };
} {
  const frames: Array<Record<string, unknown>> = [];
  return {
    frames,
    socket: {
      send(data: string) {
        frames.push(JSON.parse(data) as Record<string, unknown>);
      },
      close() {
        /* noop */
      },
    },
  };
}

function requestIdOf(frames: Array<Record<string, unknown>>): string {
  const frame = frames.find((f) => f.event === 'snapshot.request');
  const data = frame?.data as { requestId?: string } | undefined;
  if (!data?.requestId) throw new Error('snapshot.request not sent');
  return data.requestId;
}

describe('snapshot upload transport', () => {
  it('resolves a pending snapshot from uploaded bytes', async () => {
    const hub = new WsHub();
    const { frames, socket } = fakeSocket();
    hub.add(ROOM, socket);
    const pending = hub.requestSnapshot(ROOM, {}, 1000);
    const ok = hub.resolveSnapshotUpload(requestIdOf(frames), {
      bytes: PNG,
      mime: 'image/png',
      width: 1,
      height: 1,
    });
    expect(ok).toBe(true);
    const shot = await pending;
    expect(shot.mime).toBe('image/png');
    expect(shot.width).toBe(1);
    expect(shot.base64).toBe(Buffer.from(PNG).toString('base64'));
  });

  it('ignores uploads with an unknown request id', () => {
    const hub = new WsHub();
    expect(hub.resolveSnapshotUpload('nope', { bytes: PNG })).toBe(false);
  });

  it('accepts a binary upload over HTTP', async () => {
    const hub = new WsHub();
    const h = makeHarness({ hub });
    const room = h.rooms.create({ name: 'snap-upload' });
    const { frames, socket } = fakeSocket();
    hub.add(room.id, socket);
    const pending = hub.requestSnapshot(room.id, {}, 2000);
    const requestId = requestIdOf(frames);
    const res = await h.app.request(`/r/${room.id}/snapshot/${requestId}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.token}`,
        'content-type': 'application/octet-stream',
      },
      body: PNG,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, bytes: PNG.length });
    const shot = await pending;
    expect(shot.base64).toBe(Buffer.from(PNG).toString('base64'));
  });

  it('rejects an authenticated but oversized result as a payload error', async () => {
    const hub = new WsHub();
    const { frames, socket } = fakeSocket();
    hub.add(ROOM, socket);
    const pending = hub.requestSnapshot(ROOM, {}, 1000);
    hub.resolveSnapshot(requestIdOf(frames), undefined, 'editor 快照超出上限', 'E_SNAPSHOT_TOO_LARGE');
    await expect(pending).rejects.toMatchObject({ code: 'E_PAYLOAD_TOO_LARGE' });
    expect(frames.filter((f) => f.event === 'snapshot.request')).toHaveLength(1);
  });

  it('carries shot meta from the upload header onto the resolved snapshot', async () => {
    const hub = new WsHub();
    const h = makeHarness({ hub });
    const room = h.rooms.create({ name: 'snap-meta' });
    const { frames, socket } = fakeSocket();
    hub.add(room.id, socket);
    const pending = hub.requestSnapshot(room.id, {}, 2000);
    const requestId = requestIdOf(frames);
    const meta = {
      fog: { enabled: true, color: [17 / 255, 34 / 255, 51 / 255], near: 4, far: 40, mode: 'doc' },
      distanceToTarget: 12.5,
      camera: { position: [0, 0, 12.5], target: [0, 0, 0] },
    };
    const res = await h.app.request(`/r/${room.id}/snapshot/${requestId}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.token}`,
        'content-type': 'image/png',
        'x-vibe3d-shot-meta': Buffer.from(JSON.stringify(meta)).toString('base64url'),
      },
      body: PNG,
    });
    expect(res.status).toBe(200);
    expect((await pending).meta).toEqual(meta);
  });

  it('rejects a malformed or oversized shot meta header', async () => {
    const hub = new WsHub();
    const h = makeHarness({ hub });
    const room = h.rooms.create({ name: 'snap-meta-bad' });
    const { frames, socket } = fakeSocket();
    hub.add(room.id, socket);

    const first = hub.requestSnapshot(room.id, {}, 2000);
    const firstRejects = expect(first).rejects.toBeTruthy();
    const firstId = requestIdOf(frames);
    const bad = await h.app.request(`/r/${room.id}/snapshot/${firstId}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.token}`,
        'x-vibe3d-shot-meta': Buffer.from(JSON.stringify({ fog: null })).toString('base64url'),
      },
      body: PNG,
    });
    expect(bad.status).toBe(400);
    const badBody = (await bad.json()) as any;
    expect(badBody.error?.data?.code ?? badBody.error?.code).toBe('E_INVALID_PARAMS');
    hub.resolveSnapshot(firstId, undefined, 'test teardown');

    const second = hub.requestSnapshot(room.id, {}, 2000);
    const secondRejects = expect(second).rejects.toBeTruthy();
    const secondId = requestIdOf(frames);
    const huge = 'A'.repeat(3000);
    const over = await h.app.request(`/r/${room.id}/snapshot/${secondId}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${h.token}`, 'x-vibe3d-shot-meta': huge },
      body: PNG,
    });
    expect(over.status).toBe(400);
    hub.resolveSnapshot(secondId, undefined, 'test teardown');
    await firstRejects;
    await secondRejects;
  });

  it('rejects an unauthenticated upload', async () => {
    const h = makeHarness({ hub: new WsHub() });
    const room = h.rooms.create({ name: 'snap-upload-auth' });
    const res = await h.app.request(`/r/${room.id}/snapshot/abc`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: PNG,
    });
    expect(res.status).toBe(401);
  });
});
