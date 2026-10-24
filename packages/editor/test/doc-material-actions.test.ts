import { emptyDoc } from '@vibebyte/vibe3d-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { calls } = vi.hoisted(() => ({ calls: [] as Array<[string, Record<string, unknown>, string]> }));

vi.mock('../src/lib/rpc', () => ({
  rpc: async (method: string, params: Record<string, unknown>, roomId: string) => {
    calls.push([method, params, roomId]);
    if (method === 'scene.get') return { doc: emptyDoc('t') };
    if (method === 'material.create') return { revision: 2, materialId: 'm_0000abcd' };
    return { revision: 2 };
  },
}));

const { useDoc } = await import('../src/stores/doc');

const MATERIAL = {
  baseColor: [1, 1, 1, 1],
  metalness: 0.1,
  roughness: 0.6,
  emissive: [0, 0, 0],
  emissiveIntensity: 0,
  opacity: 1,
  doubleSided: false,
} as const;

beforeEach(() => {
  calls.length = 0;
  useDoc.setState({ roomId: 'r_00000001', doc: emptyDoc('t') });
});

describe('编辑器材质动作', () => {
  it('patchMaterial 走 material.set op', async () => {
    await useDoc.getState().patchMaterial('m_00000001', { ...MATERIAL });
    expect(calls[0]).toEqual([
      'ops.apply',
      { ops: [{ op: 'material.set', id: 'm_00000001', material: MATERIAL }] },
      'r_00000001',
    ]);
  });

  it('mapMaterial 走 material.map op，可只传增量', async () => {
    await useDoc.getState().mapMaterial('m_00000001', { tiling: [2, 2] });
    expect(calls[0]).toEqual([
      'ops.apply',
      { ops: [{ op: 'material.map', id: 'm_00000001', map: { tiling: [2, 2] } }] },
      'r_00000001',
    ]);
  });

  it('createMaterial 调 material.create 并返回 materialId', async () => {
    const id = await useDoc.getState().createMaterial('rust');
    expect(calls[0]).toEqual(['material.create', { preset: 'rust' }, 'r_00000001']);
    expect(id).toBe('m_0000abcd');
  });

  it('未绑定房间时 createMaterial 不发起请求', async () => {
    useDoc.setState({ roomId: null });
    const id = await useDoc.getState().createMaterial('rust');
    expect(calls).toEqual([]);
    expect(id).toBeNull();
  });
});
