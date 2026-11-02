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
