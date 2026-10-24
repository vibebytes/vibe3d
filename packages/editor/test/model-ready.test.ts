import { type SceneDoc, type SceneNode, emptyDoc } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { missingModelIds } from '../src/three/model-ready';

function docWith(nodes: SceneNode[]): SceneDoc {
  const doc = emptyDoc('models');
  for (const node of nodes) doc.nodes[node.id] = node;
  doc.roots = nodes.filter((n) => n.parent === null).map((n) => n.id);
  return doc;
}

const group: SceneNode = {
  id: 'n_00000001',
  kind: 'group',
  name: '街区',
  parent: null,
  visible: true,
  transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
};

const model: SceneNode = {
  id: 'n_00000002',
  kind: 'model',
  name: 'street-corner',
  parent: null,
  visible: true,
  transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
  sha: 'a'.repeat(64),
};

const hiddenModel: SceneNode = {
  ...model,
  id: 'n_00000003',
  visible: false,
};

const nestedModel: SceneNode = {
  ...model,
  id: 'n_00000004',
  parent: group.id,
};

describe('missingModelIds', () => {
  it('lists visible model nodes that are absent from the mounted scene', () => {
    const doc = docWith([group, model]);
    expect(missingModelIds(doc, new Set([group.id]))).toEqual([model.id]);
  });

  it('ignores non-model nodes and hidden model subtrees', () => {
    const doc = docWith([group, hiddenModel]);
    expect(missingModelIds(doc, new Set())).toEqual([]);
  });

  it('returns nothing once every model is mounted', () => {
    const doc = docWith([group, model, nestedModel]);
    expect(missingModelIds(doc, new Set([group.id, model.id, nestedModel.id]))).toEqual([]);
  });

  it('skips nodes excluded by an explicit selection', () => {
    const doc = docWith([model]);
    expect(missingModelIds(doc, new Set(), [group.id])).toEqual([]);
  });
});
