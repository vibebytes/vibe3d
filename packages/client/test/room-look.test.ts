import { describe, expect, it } from 'vitest';
import { mockTransport } from '../src/mock';
import { RoomHandle } from '../src/room';

const PNG = { mime: 'image/png', base64: 'AAAA', width: 64, height: 64, revision: 1 };
const CAM = { p: [0, 0, 5], target: [0, 0, 0], fov: 45, mode: 'persp', zoom: 1 } as const;

function recorder() {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const transport = mockTransport({
    dispatch: async (method, params) => {
      calls.push([method, params]);
      if (method === 'render.views') {
        return {
          revision: 1,
          target: { min: [0, 0, 0], max: [1, 1, 1] },
          views: [{ view: 'front', label: '正视', ...PNG, camera: CAM }],
        };
      }
      if (method === 'render.node') {
        return { ...PNG, nodeId: 'n_00000001', target: { min: [0, 0, 0], max: [1, 1, 1] }, camera: CAM };
      }
      if (method === 'render.pick') {
        return { revision: 1, width: 64, height: 64, samples: [] };
      }
      return PNG;
    },
  });
  return { calls, room: new RoomHandle(transport, 'r_00000001') };
}

describe('SDK 渲染外观参数透传', () => {
  it('snapshot 透传 shading 与 overlay', async () => {
    const { calls, room } = recorder();
    await room.snapshot({ shading: 'wireframe', overlay: ['grid', 'bbox'] });
    expect(calls[0]?.[1]).toMatchObject({ shading: 'wireframe', overlay: ['grid', 'bbox'] });
  });

  it('views 透传 shading 与 overlay', async () => {
    const { calls, room } = recorder();
    await room.views({ views: ['front'], shading: 'normals', overlay: ['axes'] });
    expect(calls[0]?.[1]).toMatchObject({ shading: 'normals', overlay: ['axes'] });
  });

  it('closeup 透传 shading 与 overlay', async () => {
    const { calls, room } = recorder();
    await room.closeup('n_00000001', { shading: 'flat', overlay: ['bbox'] });
    expect(calls[0]?.[1]).toMatchObject({ shading: 'flat', overlay: ['bbox'] });
  });

  it('pick 透传 shading 与 overlay', async () => {
    const { calls, room } = recorder();
    await room.pick({ points: [{ x: 1, y: 1 }], shading: 'wireframe', overlay: ['grid'] });
    expect(calls[0]?.[1]).toMatchObject({ shading: 'wireframe', overlay: ['grid'] });
  });

  it('未指定时不塞入 undefined 字段', async () => {
    const { calls, room } = recorder();
    await room.snapshot({ width: 64 });
    expect('shading' in (calls[0]?.[1] ?? {})).toBe(false);
    expect('overlay' in (calls[0]?.[1] ?? {})).toBe(false);
  });
});
