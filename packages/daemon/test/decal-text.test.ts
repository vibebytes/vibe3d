import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function newRoom(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '贴花' });
  return body.result.roomId;
}

async function doc(h: Harness, roomId: string): Promise<any> {
  const { body } = await call(h, 'scene.get', { roomId }, roomId);
  return body.result.doc;
}

describe('decal.create 文字 / 图片贴花', () => {
  it('文字贴花：doc 保留 text，material 注册，平面尺寸正确', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const { body } = await call(
      h,
      'decal.create',
      { roomId, text: 'SageMark 睿标', width: 3, height: 0.8, position: [0, 2, 0], color: '#5fe3c0' },
      roomId,
    );
    expect(body.error).toBeUndefined();
    const { nodeId, materialId } = body.result;

    const d = await doc(h, roomId);
    const node = d.nodes[nodeId];
    expect(node.kind).toBe('mesh');
    expect(node.decal.text).toBe('SageMark 睿标');
    expect(node.decal.color).toEqual([95 / 255, 227 / 255, 192 / 255, 1]);
    expect(node.geometry).toEqual({ type: 'plane', width: 3, height: 0.8 });
    expect(node.material).toBe(materialId);
    expect(node.transform.p).toEqual([0, 2, 0]);
    expect(d.materials[materialId].doubleSided).toBe(true);
    expect(d.materials[materialId].opacity).toBe(1);
  });

  it('text 与 imageSha 必须二选一', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const neither = await call(h, 'decal.create', { roomId }, roomId);
    expect(codeOf(neither.body)).toBe('E_INVALID_PARAMS');
    const both = await call(h, 'decal.create', { roomId, text: 'A', imageSha: 'a'.repeat(64) }, roomId);
    expect(codeOf(both.body)).toBe('E_INVALID_PARAMS');
  });

  it('未注册图片报 E_ASSET_MISSING；父节点不存在报 E_NODE_NOT_FOUND', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const missing = await call(h, 'decal.create', { roomId, imageSha: 'b'.repeat(64) }, roomId);
    expect(codeOf(missing.body)).toBe('E_ASSET_MISSING');
    const badParent = await call(h, 'decal.create', { roomId, text: 'B', parent: 'n_deadbeef' }, roomId);
    expect(codeOf(badParent.body)).toBe('E_NODE_NOT_FOUND');
  });
});
