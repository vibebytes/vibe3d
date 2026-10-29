import { emptyDoc } from '@vibebyte/vibe3d-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { calls } = vi.hoisted(() => ({ calls: [] as Array<[string, Record<string, unknown>, string]> }));

vi.mock('../src/lib/rpc', () => ({
  rpc: async (method: string, params: Record<string, unknown>, roomId: string) => {
    calls.push([method, params, roomId]);
    if (method === 'scene.get') return { doc: emptyDoc('t') };
    return { revision: 2, camera: emptyDoc('t').camera, cameras: {} };
  },
}));

const { useDoc } = await import('../src/stores/doc');

beforeEach(() => {
  calls.length = 0;
  useDoc.setState({ roomId: 'r_00000001', doc: emptyDoc('t') });
});

describe('编辑器机位动作', () => {
  it('saveCamera 把当前机位存成命名槽位', async () => {
    await useDoc.getState().saveCamera('hero');
    expect(calls[0]).toEqual(['camera.save', { name: 'hero', camera: emptyDoc('t').camera }, 'r_00000001']);
  });

  it('deleteCamera 调 camera.delete', async () => {
    await useDoc.getState().deleteCamera('hero');
    expect(calls[0]).toEqual(['camera.delete', { name: 'hero' }, 'r_00000001']);
  });

  it('useCamera 按名字恢复机位', async () => {
    await useDoc.getState().useCamera('hero');
    expect(calls[0]).toEqual(['camera.set', { name: 'hero' }, 'r_00000001']);
  });

  it('camera.set 与 HUD 切机位清空选中，已存机位默认打开遮幅', async () => {
    const { useSelection } = await import('../src/stores/selection');
    const { useUi } = await import('../src/stores/ui');
    useSelection.getState().select('n_hero0001');
    useUi.setState({ letterbox: false });
    await useDoc.getState().setCamera({ p: [0, 1, 4], target: [0, 0, 0], fov: 40 });
    expect(useSelection.getState().primary).toBeNull();
    useSelection.getState().select('n_hero0001');
    await useDoc.getState().useCamera('hero');
    expect(useSelection.getState().primary).toBeNull();
    expect(useUi.getState().letterbox).toBe(true);
  });

  it('applyCameraPreset 走 camera.set 的 preset 字段', async () => {
    await useDoc.getState().applyCameraPreset('miniature_45');
    expect(calls[0]).toEqual(['camera.set', { preset: 'miniature_45' }, 'r_00000001']);
  });
});
