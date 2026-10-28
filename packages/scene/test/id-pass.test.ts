import { type SceneDoc, emptyDoc } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import {
  ID_PASS_MAX_NODES,
  ID_PASS_MAX_PIXELS,
  buildIdLegend,
  decodeIdMask,
  fitsIdPass,
} from '../src/id-pass';
import { CUBE, MAT, cubeDoc } from './helpers';

function docWith(n: number): SceneDoc {
  const doc = emptyDoc('id');
  doc.materials['m_00000001'] = structuredClone(MAT);
  for (let i = 1; i <= n; i += 1) {
    const id = `n_${String(i).padStart(8, '0')}`;
    doc.nodes[id] = { ...structuredClone(CUBE), id };
    doc.roots.push(id);
  }
  return doc;
}

describe('id-pass legend', () => {
  it('每个可渲染节点一个唯一 hex，背景保留 #000000', () => {
    const doc = docWith(3);
    const { legend, order } = buildIdLegend(doc);
    expect(order).toHaveLength(3);
    expect(new Set(Object.values(legend)).size).toBe(3);
    expect(Object.values(legend)).not.toContain('#000000');
    expect(legend[order[0] as string]).toBe('#000001');
    expect(legend[order[2] as string]).toBe('#000003');
  });

  it('跳过 group / light 与隐藏节点（含隐藏祖先）', () => {
    const doc = docWith(2);
    doc.nodes.n_loop = {
      id: 'n_loop',
      name: 'loop',
      kind: 'group',
      parent: null,
      visible: false,
      transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
    };
    doc.nodes['n_00000001']!.parent = 'n_loop';
    doc.nodes.n_hidden = { ...structuredClone(CUBE), id: 'n_hidden', visible: false };
    doc.roots.push('n_hidden');
    doc.roots = ['n_loop', 'n_00000002', 'n_hidden'];
    const { legend } = buildIdLegend(doc);
    expect(legend['n_loop']).toBeUndefined();
    expect(legend['n_hidden']).toBeUndefined();
    expect(legend['n_00000001']).toBeUndefined();
    expect(legend['n_00000002']).toBeDefined();
  });

  it('超过 255 个节点直接报错；1 MP 上限可判定', () => {
    expect(() => buildIdLegend(docWith(ID_PASS_MAX_NODES + 1))).toThrow(/255/);
    expect(fitsIdPass(1000, 1000)).toBe(true);
    expect(fitsIdPass(1001, 1000)).toBe(false);
    expect(ID_PASS_MAX_PIXELS).toBe(1_000_000);
  });
});

describe('decodeIdMask', () => {
  it('把 RGBA 还原成索引图，统计覆盖像素，未知颜色计入 unknown', () => {
    const doc = cubeDoc();
    const { legend, order } = buildIdLegend(doc);
    const hex = legend[order[0] as string] as string;
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    const rgba = new Uint8Array([r, g, b, 255, 0, 0, 0, 255, 9, 9, 9, 255]);
    const out = decodeIdMask(rgba, legend);
    expect([...out.index]).toEqual([1, 0, 0]);
    expect(out.unknown).toBe(1);
    expect(out.coverage).toEqual([{ nodeId: order[0], hex, pixels: 1 }]);
  });
});
