import { toGlb } from '@vibebyte/vibe3d-scene';
import { describe, expect, it } from 'vitest';
import { parseGltf } from '../src/assets/gltf-parse';

describe('scene toGlb → daemon parseGltf', () => {
  it('reads back one skin and the mesh bounds', () => {
    const bytes = toGlb({
      name: 'stick',
      bones: [
        { name: 'Root', parent: null, translation: [0, 0, 0] },
        { name: 'Tip', parent: 0, translation: [0, 1, 0] },
      ],
      materials: [{ name: 'skin', color: [1, 1, 1, 1], roughness: 1, metallic: 0 }],
      primitives: [
        {
          material: 0,
          positions: new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 2, 0]),
          normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
          joints: new Uint16Array(12),
          weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
          indices: new Uint32Array([0, 1, 2]),
        },
      ],
    });
    const report = parseGltf(Buffer.from(bytes), 'stick.glb');
    expect(report.skins).toBe(1);
    expect(report.bones).toEqual(['Root', 'Tip']);
    expect(report.meshes).toBe(1);
    expect(report.tris).toBe(1);
    expect(report.unsupported).toEqual([]);
    expect(report.size?.min).toEqual([-0.5, 0, 0]);
    expect(report.size?.max).toEqual([0.5, 2, 0]);
  });
});
