import { type SceneDoc, type SceneNode, emptyDoc } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { type AttachOptions, attachDelta } from '../src/attach';

const near = (a: number[], b: number[], digits = 6): void => {
  expect(a).toHaveLength(b.length);
  for (let i = 0; i < a.length; i += 1) expect(a[i]!).toBeCloseTo(b[i]!, digits);
};

const codeOf = (err: unknown): string | undefined => (err as { code?: string } | undefined)?.code;
const attempt = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return undefined;
};

function node(id: string, p: [number, number, number], size: [number, number, number]): SceneNode {
  return {
    id: id as `n_${string}`,
    kind: 'mesh',
    name: id,
    parent: null,
    visible: true,
    transform: { p, r: [0, 0, 0], s: [1, 1, 1] },
    geometry: { type: 'box', size },
    material: 'm_00000001',
  };
}

function docWith(nodes: SceneNode[]): SceneDoc {
  const doc = emptyDoc('attach');
  for (const n of nodes) {
    doc.nodes[n.id] = n;
    doc.roots.push(n.id);
  }
  return doc;
}

const TABLE = node('n_00000001', [0, 1, 0], [2, 0.2, 2]);
const CUP = node('n_00000002', [5, 5, 5], [0.4, 0.4, 0.4]);
const doc = docWith([TABLE, CUP]);

const delta = (opts: AttachOptions): number[] => {
  const out = attachDelta(doc, CUP.id, TABLE.id, opts);
  expect(out).not.toBeNull();
  return out!;
};

describe('attachDelta', () => {
  it('drops the node onto the top face, centred on the other two axes', () => {
    near(delta({ face: 'top' }), [-5, -3.7, -5]);
  });

  it('honours a gap along the normal and a corner on the tangent axes', () => {
    near(delta({ face: 'top', corner: 'min-min', offset: 0.1 }), [-5.8, -3.6, -5.8]);
    near(delta({ face: 'top', corner: 'max-max' }), [-4.2, -3.7, -4.2]);
  });

  it('uses the face normal for side faces with the matching tangent order', () => {
    near(delta({ face: 'right' }), [-3.8, -4, -5]);
    near(delta({ face: 'back', corner: 'min-max' }), [-5.8, -4.1, -6.2]);
  });

  it('falls back to the subtree box when the moving node has no geometry of its own', () => {
    const group: SceneNode = {
      id: 'n_00000003',
      kind: 'group',
      name: '组',
      parent: null,
      visible: true,
      transform: { p: [5, 5, 5], r: [0, 0, 0], s: [1, 1, 1] },
    };
    const child = { ...node('n_00000004', [0, 0, 0], [1, 1, 1]), parent: group.id };
    const nested = docWith([TABLE, { ...group }, child]);
    near(attachDelta(nested, group.id, TABLE.id, { face: 'top' })!, [-5, -3.4, -5]);
  });

  it('returns null for an unknown target or an invisible node', () => {
    expect(attachDelta(doc, CUP.id, 'n_ffffffff', { face: 'top' })).toBeNull();
    const hidden = docWith([TABLE, { ...CUP, visible: false }]);
    expect(attachDelta(hidden, CUP.id, TABLE.id, { face: 'top' })).toBeNull();
  });

  it('rejects an unknown face or corner instead of silently centring', () => {
    expect(codeOf(attempt(() => attachDelta(doc, CUP.id, TABLE.id, { face: 'inside' as never })))).toBe(
      'E_INVALID_PARAMS',
    );
    expect(
      codeOf(attempt(() => attachDelta(doc, CUP.id, TABLE.id, { face: 'top', corner: 'left' as never }))),
    ).toBe('E_INVALID_PARAMS');
  });
});
