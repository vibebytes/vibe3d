import { emptyDoc } from '@vibebyte/vibe3d-protocol';
import { frameTarget, posedDoc } from '@vibebyte/vibe3d-scene';
import { describe, expect, it } from 'vitest';
import { MAT } from './helpers';

/** A hip group at y=1 with a 1m leg hanging down; the hip swings forward (about -X) over one second. */
function swingingLeg(): ReturnType<typeof emptyDoc> {
  const doc = emptyDoc('frame-at');
  doc.nodes.n_00000001 = {
    id: 'n_00000001',
    kind: 'group',
    name: 'hip',
    parent: null,
    visible: true,
    transform: { p: [0, 1, 0], r: [0, 0, 0], s: [1, 1, 1] },
    clip: {
      tracks: [
        {
          path: 'rotation',
          keys: [
            { t: 0, v: [0, 0, 0] },
            { t: 1, v: [-Math.PI / 2, 0, 0] },
          ],
        },
      ],
    },
  } as never;
  doc.nodes.n_00000002 = {
    id: 'n_00000002',
    kind: 'mesh',
    name: 'leg',
    parent: 'n_00000001',
    visible: true,
    transform: { p: [0, -0.5, 0], r: [0, 0, 0], s: [1, 1, 1] },
    geometry: { type: 'box', size: [0.1, 1, 0.1] },
    material: 'm_00000001',
  };
  doc.roots.push('n_00000001');
  doc.materials.m_00000001 = structuredClone(MAT);
  return doc;
}

describe('posed framing', () => {
  it('posedDoc writes the clip pose into node transforms', () => {
    const posed = posedDoc(swingingLeg(), 1);
    expect(posed.nodes.n_00000001?.transform.r[0]).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('frameTarget with at frames the swung-out leg, not the rest pose', () => {
    const doc = swingingLeg();
    const rest = frameTarget(doc, { ids: ['n_00000001'] })!;
    const swung = frameTarget(doc, { ids: ['n_00000001'], at: 1 })!;
    expect(rest.bounds.max[2]).toBeLessThan(0.1);
    expect(swung.bounds.max[2]).toBeGreaterThan(0.9);
    expect(swung.bounds.min[1]).toBeGreaterThan(0.9);
  });

  it('frameTarget with several times frames the union of poses', () => {
    const doc = swingingLeg();
    const both = frameTarget(doc, { ids: ['n_00000001'], at: [0, 1] })!;
    expect(both.bounds.min[1]).toBeLessThan(0.1);
    expect(both.bounds.max[2]).toBeGreaterThan(0.9);
  });
});

describe('posed bounds of a mannequin model', () => {
  const kick = {
    tracks: [
      {
        path: 'bone.UpperLeg_L.rotation',
        keys: [
          { t: 0, v: [0, 0, 0] },
          { t: 1, v: [-1.2, 0, 0] },
        ],
      },
    ],
  };

  function mannequinDoc(rig: unknown = { kind: 'mannequin', seed: 1, bones: [] }, name = 'figure.glb') {
    const doc = emptyDoc('mq');
    doc.assets.sha1 = {
      sha: 'sha1',
      bytes: 1,
      name,
      mime: 'model/gltf-binary',
      kind: 'gltf',
      gltf: { size: { min: [-0.3, 0, -0.1], max: [0.3, 1.75, 0.2] }, ...(rig ? { rig } : {}) },
    } as never;
    doc.nodes.n_00000001 = {
      id: 'n_00000001',
      kind: 'model',
      name: 'runner',
      parent: null,
      visible: true,
      transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
      sha: 'sha1',
      clip: kick,
    } as never;
    return doc;
  }

  it('wraps the leg kicked forward by bone FK', () => {
    const doc = mannequinDoc();
    const rest = frameTarget(doc, { ids: ['n_00000001'] })!;
    const posed = frameTarget(doc, { ids: ['n_00000001'], at: 1 })!;
    expect(rest.bounds.max[2]).toBeCloseTo(0.2, 6);
    expect(posed.bounds.max[2]).toBeGreaterThan(0.6);
  });

  it('a hips translation track lifts the posed box', () => {
    const doc = mannequinDoc();
    const node = doc.nodes.n_00000001 as unknown as { clip: unknown };
    node.clip = {
      tracks: [{ path: 'bone.Hips.position', blend: 'additive', keys: [{ t: 0, v: [0, 0.5, 0] }] }],
    };
    const posed = frameTarget(doc, { ids: ['n_00000001'], at: 0 })!;
    expect(posed.bounds.max[1]).toBeGreaterThan(2.2);
    expect(posed.bounds.max[1]).toBeLessThan(2.3);
  });

  it('is recognised by the asset rig, not by its file name', () => {
    const named = mannequinDoc(null, 'mannequin.glb');
    const rigged = mannequinDoc();
    const byName = frameTarget(named, { ids: ['n_00000001'], at: 1 })!;
    const byRig = frameTarget(rigged, { ids: ['n_00000001'], at: 1 })!;
    expect(byName.bounds.min[0]).toBeLessThan(byRig.bounds.min[0] - 0.1);
  });

  it('other animated models get a margin instead', () => {
    const doc = mannequinDoc(null, 'other.glb');
    const rest = frameTarget(doc, { ids: ['n_00000001'] })!;
    const posed = frameTarget(doc, { ids: ['n_00000001'], at: 1 })!;
    expect(posed.bounds.max[2]).toBeGreaterThan(rest.bounds.max[2]);
    expect(posed.bounds.min[2]).toBeLessThan(rest.bounds.min[2]);
  });
});
