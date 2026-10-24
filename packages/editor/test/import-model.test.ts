import { describe, expect, it } from 'vitest';
import { fitTransform, importName, isGltfFile, rowOffset } from '../src/lib/import-model';

describe('isGltfFile', () => {
  it('accepts glb and gltf regardless of case or whitespace', () => {
    expect(isGltfFile(' chair.GLB ')).toBe(true);
    expect(isGltfFile('room.gltf')).toBe(true);
  });

  it('rejects other formats and extension-less names', () => {
    expect(isGltfFile('photo.png')).toBe(false);
    expect(isGltfFile('model')).toBe(false);
    expect(isGltfFile('')).toBe(false);
  });
});

describe('importName', () => {
  it('strips the extension and keeps the stem', () => {
    expect(importName('Sofa_01.GLB')).toBe('Sofa_01');
    expect(importName('a.b.gltf')).toBe('a.b');
  });

  it('falls back when the name is only an extension', () => {
    expect(importName('.glb')).toBe('model');
    expect(importName('   ')).toBe('model');
  });
});

describe('fitTransform', () => {
  const unitCube = {
    min: [-1, -1, -1] as [number, number, number],
    max: [1, 1, 1] as [number, number, number],
  };

  it('scales to the target height and drops the model onto the ground', () => {
    const t = fitTransform(unitCube);
    expect(t.s).toEqual([0.75, 0.75, 0.75]);
    expect(t.p).toEqual([0, 0.75, 0]);
    expect(t.r).toEqual([0, 0, 0]);
  });

  it('centres x/z using the bounding box centre', () => {
    const t = fitTransform({ min: [-2, 0, -4], max: [6, 3, 2] });
    expect(t.s[0]).toBeCloseTo(0.5);
    expect(t.p[0]).toBeCloseTo(-1);
    expect(t.p[1]).toBeCloseTo(0);
    expect(t.p[2]).toBeCloseTo(0.5);
  });

  it('offsets the placement on x for multi-file drops', () => {
    const t = fitTransform(unitCube, { offsetX: 2.4 });
    expect(t.p[0]).toBeCloseTo(2.4);
  });

  it('falls back to unit scale for flat or empty bounds', () => {
    const t = fitTransform({ min: [0, 0, 0], max: [1, 0, 1] });
    expect(t.s).toEqual([1, 1, 1]);
    expect(t.p).toEqual([-0.5, 0, -0.5]);
  });

  it('honours an explicit target height', () => {
    const t = fitTransform(unitCube, { targetHeight: 3 });
    expect(t.s).toEqual([1.5, 1.5, 1.5]);
    expect(t.p[1]).toBeCloseTo(1.5);
  });
});

describe('rowOffset', () => {
  it('keeps a single drop centred', () => {
    expect(rowOffset(0, 1)).toBe(0);
  });

  it('spreads a batch around the origin', () => {
    expect(rowOffset(0, 3)).toBeCloseTo(-2.2);
    expect(rowOffset(1, 3)).toBe(0);
    expect(rowOffset(2, 3)).toBeCloseTo(2.2);
  });
});
