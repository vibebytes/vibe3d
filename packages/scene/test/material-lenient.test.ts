import { type Op, emptyDoc } from '@vibebyte/vibe3d-protocol';
import { applyOps } from '@vibebyte/vibe3d-scene';
import { describe, expect, it } from 'vitest';
import { resolveMaterialPreset } from '../src/material';

const meshWithoutMaterial = {
  op: 'node.create',
  node: {
    id: 'n_00000003',
    kind: 'mesh',
    name: '无材质盒子',
    parent: null,
    visible: true,
    transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
    geometry: { type: 'box', size: [1, 1, 1] },
  },
} as unknown as Op;

describe('resolveMaterialPreset', () => {
  it('keeps a canonical preset name', () => {
    expect(resolveMaterialPreset('glass').preset).toBe('glass');
  });

  it('maps matte-white to concrete with a near-white base colour', () => {
    const result = resolveMaterialPreset('matte-white');
    expect(result.preset).toBe('concrete');
    expect(result.params?.baseColor?.[0]).toBeGreaterThan(0.8);
    expect(result.note).toContain('matte-white');
  });

  it('maps brushed-steel to a metallic surface', () => {
    const result = resolveMaterialPreset('brushed-steel');
    expect(result.preset).toBe('concrete');
    expect(result.params?.metalness).toBeGreaterThan(0.5);
  });

  it('maps moss to wet_moss', () => {
    expect(resolveMaterialPreset('moss').preset).toBe('wet_moss');
  });

  it('falls back to concrete for an unknown name and says so', () => {
    const result = resolveMaterialPreset('unobtainium');
    expect(result.preset).toBe('concrete');
    expect(result.note).toContain('unobtainium');
  });

  it('defaults to a light concrete when preset is omitted', () => {
    const result = resolveMaterialPreset(undefined);
    expect(result.preset).toBe('concrete');
    expect(result.params?.baseColor?.[0]).toBeGreaterThan(0.8);
  });

  it('lets explicit params win over the alias colour', () => {
    const result = resolveMaterialPreset('white', { baseColor: [1, 0, 0, 1] });
    expect(result.params?.baseColor).toEqual([1, 0, 0, 1]);
  });
});

describe('lenient material ops', () => {
  it('creates a default material when node.create omits material', () => {
    const result = applyOps(emptyDoc('test'), [meshWithoutMaterial]);
    const node = result.doc.nodes['n_00000003'];
    expect(node?.kind).toBe('mesh');
    const materialId = node && 'material' in node ? node.material : undefined;
    expect(materialId).toBeTruthy();
    expect(materialId && result.doc.materials[materialId]).toBeTruthy();
    expect(result.warnings.join(' ')).toContain('材质');
  });

  it('reuses one shared default material across nodes', () => {
    const second = structuredClone(meshWithoutMaterial) as Op & { node: { id: string; name: string } };
    second.node.id = 'n_00000004';
    second.node.name = '第二个';
    const result = applyOps(emptyDoc('test'), [meshWithoutMaterial, second]);
    const ids = ['n_00000003', 'n_00000004'].map((id) => {
      const node = result.doc.nodes[id];
      return node && 'material' in node ? node.material : undefined;
    });
    expect(ids[0]).toBe(ids[1]);
    expect(Object.keys(result.doc.materials)).toHaveLength(1);
  });

  it('material.create accepts a fuzzy preset name', () => {
    const op = { op: 'material.create', id: 'm_00000011', preset: 'matte-white' } as unknown as Op;
    const result = applyOps(emptyDoc('test'), [op]);
    const material = result.doc.materials['m_00000011'];
    expect(material?.baseColor[0]).toBeGreaterThan(0.8);
    expect(result.warnings.join(' ')).toContain('matte-white');
  });

  it('material.patch maps color onto baseColor and drops the alias', () => {
    const doc = emptyDoc('test');
    doc.materials['m_00000012'] = {
      baseColor: [0.2, 0.2, 0.2, 1],
      metalness: 0,
      roughness: 0.5,
      emissive: [0, 0, 0],
      emissiveIntensity: 0,
      opacity: 1,
      doubleSided: false,
    };
    const op = {
      op: 'material.patch',
      id: 'm_00000012',
      patch: { color: [1, 0, 0, 1] },
    } as unknown as Op;
    const result = applyOps(doc, [op]);
    expect(result.doc.materials['m_00000012']?.baseColor).toEqual([1, 0, 0, 1]);
    expect(result.doc.materials['m_00000012']).not.toHaveProperty('color');
  });
});
