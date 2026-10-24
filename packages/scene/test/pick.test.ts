import { type SceneDoc, type SceneNode, emptyDoc } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { pickNode } from '../src/pick';
import { MAT } from './helpers';

function node(over: Partial<SceneNode> & Pick<SceneNode, 'id'>): SceneNode {
  return {
    kind: 'mesh',
    name: over.id,
    parent: null,
    visible: true,
    transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
    geometry: { type: 'box', size: [2, 2, 2] },
    material: 'm_00000001',
    ...over,
  } as SceneNode;
}

function docOf(...nodes: SceneNode[]): SceneDoc {
  const doc = emptyDoc('pick');
  for (const n of nodes) doc.nodes[n.id] = n;
  doc.roots = nodes.filter((n) => !n.parent).map((n) => n.id);
  doc.materials['m_00000001'] = structuredClone(MAT);
  return doc;
}

const RAY_DOWN_Z = { origin: [0, 0, 5] as [number, number, number], direction: [0, 0, -1] as [number, number, number] };

describe('pickNode', () => {
  it('hits the nearest box and reports distance, point and candidates', () => {
    const doc = docOf(
      node({ id: 'n_00000001', name: '近处' }),
      node({
        id: 'n_00000002',
        name: '远处',
        transform: { p: [0, 0, -10], r: [0, 0, 0], s: [1, 1, 1] },
      }),
    );
    const hit = pickNode(doc, { ray: RAY_DOWN_Z });
    expect(hit.nodeId).toBe('n_00000001');
    expect(hit.distance).toBeCloseTo(4, 6);
    expect(hit.hitPoint).toEqual([0, 0, 1]);
    expect(hit.candidates.map((c) => c.nodeId)).toEqual(['n_00000001', 'n_00000002']);
    expect(hit.candidates[1]!.distance).toBeCloseTo(14, 6);
  });

  it('returns nulls instead of throwing when the ray misses everything', () => {
    const doc = docOf(node({ id: 'n_00000001' }));
    const hit = pickNode(doc, { ray: { origin: [0, 0, 5], direction: [0, 1, 0] } });
    expect(hit).toMatchObject({ nodeId: null, hitPoint: null, distance: null, candidates: [] });
  });

  it('ignores hidden nodes and children of hidden groups', () => {
    const doc = docOf(
      node({ id: 'n_00000001', name: '自己隐藏', visible: false }),
      node({ id: 'n_00000002', kind: 'group', name: '父组', visible: false }),
      node({ id: 'n_00000003', name: '子盒', parent: 'n_00000002' }),
    );
    expect(pickNode(doc, { ray: RAY_DOWN_Z }).nodeId).toBeNull();
  });

  it('skips groups as pick targets but still picks the meshes inside them', () => {
    const doc = docOf(
      node({ id: 'n_00000002', kind: 'group', name: '父组' }),
      node({ id: 'n_00000003', name: '子盒', parent: 'n_00000002' }),
    );
    expect(pickNode(doc, { ray: RAY_DOWN_Z }).nodeId).toBe('n_00000003');
  });

  it('turns a screen point into a ray through the doc camera', () => {
    const doc = docOf(
      node({ id: 'n_00000001', name: '中间' }),
      node({
        id: 'n_00000002',
        name: '左边',
        transform: { p: [-6, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
      }),
    );
    doc.camera = { mode: 'persp', p: [0, 0, 12], target: [0, 0, 0], fov: 45, zoom: 1 };
    const center = pickNode(doc, { point: [0.5, 0.5], width: 1600, height: 900 });
    expect(center.nodeId).toBe('n_00000001');
    expect(center.ray.direction[2]).toBeCloseTo(-1, 6);
    expect(pickNode(doc, { point: [0.02, 0.5], width: 1600, height: 900 }).nodeId).toBeNull();
  });

  it('expands boxes by tolerance so thin gaps stay clickable', () => {
    const doc = docOf(node({ id: 'n_00000001' }));
    const grazing = { origin: [1.05, 0, 5] as [number, number, number], direction: [0, 0, -1] as [number, number, number] };
    expect(pickNode(doc, { ray: grazing }).nodeId).toBeNull();
    expect(pickNode(doc, { ray: grazing, tolerance: 0.1 }).nodeId).toBe('n_00000001');
  });

  it('honours maxDistance and candidate limit', () => {
    const doc = docOf(
      node({ id: 'n_00000001' }),
      node({ id: 'n_00000002', transform: { p: [0, 0, -4], r: [0, 0, 0], s: [1, 1, 1] } }),
    );
    expect(pickNode(doc, { ray: RAY_DOWN_Z, maxDistance: 3 }).nodeId).toBeNull();
    expect(pickNode(doc, { ray: RAY_DOWN_Z, limit: 1 }).candidates).toHaveLength(1);
  });
});
