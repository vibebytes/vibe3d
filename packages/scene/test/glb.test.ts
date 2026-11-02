import { describe, expect, it } from 'vitest';
import { type SkinnedModel, toGlb } from '../src/glb';

const twoBoneModel = (): SkinnedModel => ({
  name: 'stick',
  bones: [
    { name: 'Root', parent: null, translation: [0, 0, 0] },
    { name: 'Tip', parent: 0, translation: [0, 1, 0] },
  ],
  materials: [{ name: 'skin', color: [1, 0.8, 0.6, 1], roughness: 0.8, metallic: 0 }],
  primitives: [
    {
      material: 0,
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 2, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      joints: new Uint16Array([0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0]),
      weights: new Float32Array([1, 0, 0, 0, 0.5, 0.5, 0, 0, 1, 0, 0, 0]),
      indices: new Uint32Array([0, 1, 2]),
    },
  ],
  extras: { kind: 'test' },
});

function chunks(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  return { view, json, jsonLength };
}

describe('toGlb', () => {
  it('writes a valid, 4-byte aligned GLB 2.0 container', () => {
    const bytes = toGlb(twoBoneModel());
    const { view, jsonLength } = chunks(bytes);
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(8, true)).toBe(bytes.byteLength);
    expect(bytes.byteLength % 4).toBe(0);
    expect(jsonLength % 4).toBe(0);
    expect(view.getUint32(16, true)).toBe(0x4e4f534a);
    expect(view.getUint32(20 + jsonLength + 4, true)).toBe(0x004e4942);
  });

  it('declares one skin with joints and inverse bind matrices', () => {
    const { json } = chunks(toGlb(twoBoneModel()));
    expect(json.skins).toHaveLength(1);
    expect(json.skins[0].joints).toHaveLength(2);
    const ibm = json.accessors[json.skins[0].inverseBindMatrices];
    expect(ibm.type).toBe('MAT4');
    expect(ibm.count).toBe(2);
    expect(json.nodes.map((n: { name: string }) => n.name)).toEqual(expect.arrayContaining(['Root', 'Tip']));
    expect(json.extras).toEqual({ kind: 'test' });
  });

  it('primitives carry JOINTS_0 / WEIGHTS_0 and POSITION has min/max', () => {
    const { json } = chunks(toGlb(twoBoneModel()));
    const prim = json.meshes[0].primitives[0];
    expect(prim.attributes.JOINTS_0).toBeTypeOf('number');
    expect(prim.attributes.WEIGHTS_0).toBeTypeOf('number');
    const pos = json.accessors[prim.attributes.POSITION];
    expect(pos.min).toEqual([0, 0, 0]);
    expect(pos.max).toEqual([1, 2, 0]);
    expect(json.materials[0].pbrMetallicRoughness.baseColorFactor).toEqual([1, 0.8, 0.6, 1]);
  });
});
