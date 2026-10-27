import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;
const SHA = 'a'.repeat(64);

describe('material.create', () => {
  async function bareRoom(h: Harness): Promise<string> {
    const { body } = await call(h, 'room.create', { name: '材质' });
    return body.result.roomId;
  }

  it('lets params override the preset defaults and reads the final material back', async () => {
    const h = makeHarness();
    const roomId = await bareRoom(h);
    const { body } = await call(
      h,
      'material.create',
      { roomId, preset: 'concrete', params: { roughness: 0.9 } },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(body.result.preset).toBe('concrete');
    expect(body.result.material.roughness).toBe(0.9);
    expect(body.result.material.baseColor).toBeDefined();
  });

  it('normalizes an alias preset and reports the resolution note', async () => {
    const h = makeHarness();
    const roomId = await bareRoom(h);
    const { body } = await call(h, 'material.create', { roomId, preset: 'matte-white' }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.preset).toBe('concrete');
    expect(body.result.presetNote).toContain('concrete');
    expect(body.result.material).toBeDefined();
  });

  it('falls back to concrete with a warning for unrecognizable presets', async () => {
    const h = makeHarness();
    const roomId = await bareRoom(h);
    const { body } = await call(h, 'material.create', { roomId, preset: 'zzz-unknown' }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.preset).toBe('concrete');
    expect(body.result.presetNote).toContain('zzz-unknown');
  });
});

async function roomWithBox(h: Harness): Promise<{ roomId: string; nodeId: string; materialId: string }> {
  const { body } = await call(h, 'room.create', { name: '材质' });
  const roomId = body.result.roomId;
  const created = await call(
    h,
    'node.create',
    { roomId, kind: 'mesh', name: 'box', shape: 'box', size: [1, 1, 1] },
    roomId,
  );
  const nodeId = created.body.result.nodeId;
  const doc = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc;
  return { roomId, nodeId, materialId: doc.nodes[nodeId].material };
}

async function registerImage(h: Harness, roomId: string, sha: string): Promise<void> {
  const { body } = await call(
    h,
    'ops.apply',
    {
      roomId,
      ops: [
        {
          op: 'asset.register',
          asset: {
            sha,
            bytes: 8,
            name: 't.png',
            mime: 'image/png',
            kind: 'image',
            image: { width: 8, height: 8, hdri: false },
          },
        },
      ],
    },
    roomId,
  );
  expect(body.error).toBeUndefined();
}

describe('material.patch', () => {
  it('updates only the given fields', async () => {
    const h = makeHarness();
    const { roomId, materialId } = await roomWithBox(h);
    const before = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc.materials[materialId];

    const { body } = await call(
      h,
      'material.patch',
      { roomId, materialId, patch: { roughness: 0.2 } },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(body.result.material.roughness).toBe(0.2);

    const after = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc.materials[materialId];
    expect(after.roughness).toBe(0.2);
    expect(after.baseColor).toEqual(before.baseColor);
    expect(after.metalness).toBe(before.metalness);
    expect(after.doubleSided).toBe(before.doubleSided);
  });

  it('restores the previous material on undo', async () => {
    const h = makeHarness();
    const { roomId, materialId } = await roomWithBox(h);
    const before = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc.materials[materialId];

    await call(h, 'material.patch', { roomId, materialId, patch: { metalness: 0.9 } }, roomId);
    await call(h, 'scene.undo', { roomId }, roomId);

    const after = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc.materials[materialId];
    expect(after).toEqual(before);
  });

  it('rejects an unknown materialId', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBox(h);
    const { body } = await call(
      h,
      'material.patch',
      { roomId, materialId: 'm_ffffffff', patch: { roughness: 0.4 } },
      roomId,
    );
    expect(codeOf(body)).toBe('E_MATERIAL_NOT_FOUND');
  });
});

describe('material.map', () => {
  it('stores tiling and offset alongside the sha', async () => {
    const h = makeHarness();
    const { roomId, materialId } = await roomWithBox(h);
    await registerImage(h, roomId, SHA);
    const { body } = await call(
      h,
      'material.map',
      { roomId, materialId, sha: SHA, tiling: [4, 4], offset: [0, 0], rotation: 0 },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(body.result.material.map).toEqual({ sha: SHA, tiling: [4, 4], offset: [0, 0], rotation: 0 });

    const after = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc.materials[materialId];
    expect(after.map).toEqual({ sha: SHA, tiling: [4, 4], offset: [0, 0], rotation: 0 });
  });

  it('normalizes a legacy string map when patching', async () => {
    const h = makeHarness();
    const { roomId, materialId } = await roomWithBox(h);
    await registerImage(h, roomId, SHA);
    await call(h, 'material.patch', { roomId, materialId, patch: { map: SHA } }, roomId);

    const { body } = await call(h, 'material.map', { roomId, materialId, tiling: [2, 2] }, roomId);
    expect(body.error).toBeUndefined();

    const after = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc.materials[materialId];
    expect(after.map).toEqual({ sha: SHA, tiling: [2, 2] });
  });
});

describe('material.create', () => {
  it('creates a preset material with all seven fields', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBox(h);
    const { body } = await call(h, 'material.create', { roomId, preset: 'wet_moss' }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.materialId).toMatch(/^m_[a-z0-9]{8}$/);

    const doc = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc;
    const mat = doc.materials[body.result.materialId];
    for (const key of [
      'baseColor',
      'doubleSided',
      'emissive',
      'emissiveIntensity',
      'metalness',
      'opacity',
      'roughness',
    ]) {
      expect(mat).toHaveProperty(key);
    }
    expect(mat.roughness).toBeGreaterThan(0.6);
    expect(mat.baseColor[1]).toBeGreaterThan(mat.baseColor[0]);
  });

  it('applies params on top of the preset', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBox(h);
    const { body } = await call(
      h,
      'material.create',
      { roomId, preset: 'concrete', params: { baseColor: [0.1, 0.2, 0.3, 1], roughness: 0.42 } },
      roomId,
    );
    const doc = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc;
    expect(doc.materials[body.result.materialId].baseColor).toEqual([0.1, 0.2, 0.3, 1]);
    expect(doc.materials[body.result.materialId].roughness).toBe(0.42);
  });

  it('maps an unknown preset instead of rejecting it', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBox(h);
    const { body } = await call(h, 'material.create', { roomId, preset: 'lava' }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.preset).toBe('concrete');
    expect(body.result.presetNote).toContain('lava');
  });

  it('accepts matte-white and returns a light material', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBox(h);
    const { body } = await call(h, 'material.create', { roomId, preset: 'matte-white' }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.preset).toBe('concrete');
    const doc = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc;
    expect(doc.materials[body.result.materialId].baseColor[0]).toBeGreaterThan(0.8);
  });
});

describe('material.patch color alias', () => {
  it('writes baseColor when the caller says color', async () => {
    const h = makeHarness();
    const { roomId, materialId } = await roomWithBox(h);
    const { body } = await call(
      h,
      'material.patch',
      { roomId, materialId, patch: { color: [1, 0, 0, 1] } },
      roomId,
    );
    expect(body.error).toBeUndefined();
    const after = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc.materials[materialId];
    expect(after.baseColor).toEqual([1, 0, 0, 1]);
    expect(after).not.toHaveProperty('color');
  });
});

describe('node.create without material', () => {
  it('creates a default material instead of failing', async () => {
    const h = makeHarness();
    const room = await call(h, 'room.create', { name: '无材质' });
    const roomId = room.body.result.roomId;
    const { body } = await call(
      h,
      'ops.apply',
      {
        roomId,
        ops: [
          {
            op: 'node.create',
            node: {
              kind: 'mesh',
              name: 'box',
              parent: null,
              visible: true,
              geometry: { type: 'box', size: [1, 1, 1] },
              transform: { p: [0, 0.5, 0], r: [0, 0, 0], s: [1, 1, 1] },
            },
          },
        ],
      },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(body.result.warnings.join(' ')).toContain('默认材质');
    const doc = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc;
    const nodeId = body.result.assigned[0].id;
    expect(doc.materials[doc.nodes[nodeId].material]).toBeDefined();
  });
});
