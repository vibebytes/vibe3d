import type { SceneDoc, SceneNode } from '@vibebyte/vibe3d-protocol';
import { emptyDoc } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { frameCamera, frameNode, frameTarget, nodeBounds, sceneBounds } from '../src/frame';
import { CUBE, cubeDoc } from './helpers';

function group(
  id: `n_${string}`,
  p: [number, number, number],
  parent: `n_${string}` | null = null,
): SceneNode {
  return {
    id,
    kind: 'group',
    name: id,
    parent,
    visible: true,
    transform: { p, r: [0, 0, 0], s: [1, 1, 1] },
  };
}

function box(
  id: `n_${string}`,
  p: [number, number, number],
  size: [number, number, number],
  parent: `n_${string}` | null = null,
): SceneNode {
  return {
    id,
    kind: 'mesh',
    name: id,
    parent,
    visible: true,
    transform: { p, r: [0, 0, 0], s: [1, 1, 1] },
    geometry: { type: 'box', size },
    material: 'm_00000001',
  };
}

function scene(...nodes: SceneNode[]): SceneDoc {
  const doc = emptyDoc('frame-test');
  for (const node of nodes) doc.nodes[node.id] = node;
  doc.roots = nodes.filter((n) => n.parent === null).map((n) => n.id);
  return doc;
}

describe('nodeBounds', () => {
  it('returns the world AABB of a translated box', () => {
    expect(nodeBounds(cubeDoc(), CUBE.id)).toEqual({
      min: [-0.5, 0, -0.5],
      max: [0.5, 1, 0.5],
    });
  });

  it('walks the subtree of a group', () => {
    const doc = scene(group('n_10000001', [2, 0, 0]), box('n_10000002', [1, 0, 0], [1, 1, 1], 'n_10000001'));
    const expected = { min: [2.5, -0.5, -0.5], max: [3.5, 0.5, 0.5] };
    expect(nodeBounds(doc, 'n_10000001')).toEqual(expected);
    expect(nodeBounds(doc, 'n_10000002')).toEqual(expected);
  });

  it('applies rotation when computing the AABB', () => {
    const doc = scene(box('n_20000001', [0, 0, 0], [2, 1, 0.5]));
    doc.nodes.n_20000001!.transform.r = [0, Math.PI / 2, 0];
    const box3 = nodeBounds(doc, 'n_20000001')!;
    expect(box3.max[0] - box3.min[0]).toBeCloseTo(0.5, 6);
    expect(box3.max[2] - box3.min[2]).toBeCloseTo(2, 6);
    expect(box3.max[1] - box3.min[1]).toBeCloseTo(1, 6);
  });

  it('returns null for unknown or bodiless nodes', () => {
    const doc = scene(group('n_30000001', [0, 0, 0]));
    expect(nodeBounds(doc, 'n_30000001')).toBeNull();
    expect(nodeBounds(doc, 'n_99999999')).toBeNull();
  });

  it('keeps sceneBounds consistent with node bounds', () => {
    const doc = scene(box('n_40000001', [0, 0, 0], [1, 1, 1]), box('n_40000002', [4, 0, 0], [2, 2, 2]));
    expect(sceneBounds(doc)).toEqual({ min: [-0.5, -1, -1], max: [5, 1, 1] });
  });
});

describe('frameNode / frameTarget', () => {
  const doc = scene(box('n_50000001', [0, 0.5, 0], [1, 1, 1]), box('n_50000002', [10, 0.5, 0], [1, 1, 1]));

  it('centres on the node and gets closer than a whole-scene fit', () => {
    const camera = frameNode(doc, 'n_50000001')!;
    expect(camera.target[0]).toBeCloseTo(0, 6);
    expect(camera.target[1]).toBeCloseTo(0.5, 6);
    const sceneCam = frameCamera(doc, 'fit');
    const nodeDist = Math.hypot(
      camera.p[0] - camera.target[0],
      camera.p[1] - camera.target[1],
      camera.p[2] - camera.target[2],
    );
    const sceneDist = Math.hypot(
      sceneCam.p[0] - sceneCam.target[0],
      sceneCam.p[1] - sceneCam.target[1],
      sceneCam.p[2] - sceneCam.target[2],
    );
    expect(nodeDist).toBeLessThan(sceneDist / 4);
  });

  it('frames a union of ids and reports the bounds', () => {
    const framed = frameTarget(doc, { ids: ['n_50000001', 'n_50000002'], mode: 'fit', view: 'top' })!;
    expect(framed.bounds.min[0]).toBeCloseTo(-0.5, 6);
    expect(framed.bounds.max[0]).toBeCloseTo(10.5, 6);
    expect(framed.camera.target[0]).toBeCloseTo(5, 6);
    expect(framed.camera.p[1]).toBeGreaterThan(framed.camera.target[1]);
    expect(Math.abs(framed.camera.p[0] - framed.camera.target[0])).toBeLessThan(1e-3);
  });

  it('pushes the camera back by padding without moving the target', () => {
    const base = frameTarget(doc, { ids: ['n_50000001'], view: 'front' })!;
    const padded = frameTarget(doc, { ids: ['n_50000001'], view: 'front', padding: 2 })!;
    const dist = (c: { p: [number, number, number]; target: [number, number, number] }) =>
      Math.hypot(c.p[0] - c.target[0], c.p[1] - c.target[1], c.p[2] - c.target[2]);
    expect(dist(padded.camera)).toBeCloseTo(dist(base.camera) * 2, 6);
    expect(padded.camera.target).toEqual(base.camera.target);
  });

  it('puts a front view on +Z and a right view on +X', () => {
    const front = frameTarget(doc, { ids: ['n_50000001'], view: 'front' })!;
    expect(front.camera.p[2]).toBeGreaterThan(front.camera.target[2]);
    expect(Math.abs(front.camera.p[0] - front.camera.target[0])).toBeLessThan(1e-6);
    const right = frameTarget(doc, { ids: ['n_50000001'], view: 'right' })!;
    expect(right.camera.p[0]).toBeGreaterThan(right.camera.target[0]);
    expect(Math.abs(right.camera.p[2] - right.camera.target[2])).toBeLessThan(1e-6);
  });

  it('returns null when no id has geometry', () => {
    const empty = scene(group('n_60000001', [0, 0, 0]));
    expect(frameNode(empty, 'n_60000001')).toBeNull();
    expect(frameTarget(empty, { ids: ['n_60000001'] })).toBeNull();
  });

  it('uses node-less frameTarget for the whole scene', () => {
    const world = frameTarget(doc, { view: 'three_quarter', mode: 'fit' })!;
    expect(world.bounds.max[0]).toBeCloseTo(10.5, 6);
    const fit = frameCamera(doc, 'fit');
    expect(world.camera.p[0]).toBeCloseTo(fit.p[0], 6);
    expect(world.camera.p[1]).toBeCloseTo(fit.p[1], 6);
  });
});
