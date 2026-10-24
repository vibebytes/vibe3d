import { emptyDoc } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { RoomHandle } from '../src/room';
import type { CallOptions, HealthInfo, Transport } from '../src/transport';

interface Call {
  method: string;
  params: Record<string, unknown>;
  opts?: CallOptions;
}

function recorder(reply: (method: string) => unknown): { calls: Call[]; transport: Transport } {
  const calls: Call[] = [];
  const transport: Transport = {
    async call<T>(method: string, params: Record<string, unknown> = {}, opts?: CallOptions) {
      calls.push({ method, params, opts });
      return reply(method) as T;
    },
    async uploadAsset() {
      return { sha: 'a'.repeat(64) };
    },
    async health(): Promise<HealthInfo> {
      return { ok: true, version: '0', protocolVersion: '1', rooms: 0, renderer: 'none' };
    },
  };
  return { calls, transport };
}

describe('RoomHandle scene io / checkpoints', () => {
  it('exportScene 走 scene.export 并自动补 roomId', async () => {
    const doc = emptyDoc();
    const { calls, transport } = recorder(() => ({ revision: 7, doc }));
    const room = new RoomHandle(transport, 'r_00000001');
    const out = await room.exportScene();
    expect(out.revision).toBe(7);
    expect(calls[0]?.method).toBe('scene.export');
    expect(calls[0]?.params.roomId).toBe('r_00000001');
    expect(calls[0]?.opts?.roomId).toBe('r_00000001');
  });

  it('importScene 透传 doc 与 expectRevision', async () => {
    const doc = emptyDoc();
    const { calls, transport } = recorder(() => ({ revision: 9 }));
    const room = new RoomHandle(transport, 'r_00000001');
    const out = await room.importScene({ doc, expectRevision: 8 });
    expect(out.revision).toBe(9);
    expect(calls[0]?.method).toBe('scene.import');
    expect(calls[0]?.params.doc).toEqual(doc);
    expect(calls[0]?.params.expectRevision).toBe(8);
    expect(calls[0]?.params.roomId).toBe('r_00000001');
  });

  it('checkpoint / checkpoints / restore 参数与返回值', async () => {
    const { calls, transport } = recorder((method) => {
      if (method === 'scene.checkpoint') return { checkpointId: 'ck_0001', revision: 3 };
      if (method === 'scene.checkpoints') {
        return { items: [{ id: 'ck_0001', revision: 3, bytes: 12, createdAt: '2026-01-01T00:00:00Z' }] };
      }
      return { revision: 4 };
    });
    const room = new RoomHandle(transport, 'r_00000001');
    const made = await room.checkpoint({ name: 'baseline' });
    expect(made).toEqual({ checkpointId: 'ck_0001', revision: 3 });
    const list = await room.checkpoints();
    expect(list.items[0]?.id).toBe('ck_0001');
    const restored = await room.restore('ck_0001');
    expect(restored.revision).toBe(4);
    expect(calls.map((c) => c.method)).toEqual(['scene.checkpoint', 'scene.checkpoints', 'scene.restore']);
    expect(calls[0]?.params).toEqual({ roomId: 'r_00000001', name: 'baseline' });
    expect(calls[2]?.params).toEqual({ roomId: 'r_00000001', checkpointId: 'ck_0001' });
  });

  it('putAsset / listAssets / deleteAsset 自动补 roomId', async () => {
    const sha = 'a'.repeat(64);
    const { calls, transport } = recorder((method) => {
      if (method === 'asset.put') return { sha, revision: 2 };
      if (method === 'asset.list') return { assets: [], refs: {} };
      return { sha };
    });
    const room = new RoomHandle(transport, 'r_00000001');
    await room.putAsset({ src: './wall.png', name: 'wall' });
    await room.listAssets();
    await room.deleteAsset(sha);
    expect(calls.map((c) => c.method)).toEqual(['asset.put', 'asset.list', 'asset.delete']);
    expect(calls[0]?.params).toEqual({ roomId: 'r_00000001', src: './wall.png', name: 'wall' });
    expect(calls[2]?.params).toEqual({ roomId: 'r_00000001', sha });
    expect(calls.every((c) => c.opts?.roomId === 'r_00000001')).toBe(true);
  });
});
