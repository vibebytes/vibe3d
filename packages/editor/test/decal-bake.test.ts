import type { MeshNode } from '@vibebyte/vibe3d-protocol';
import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildMesh } from '../src/three/build';
import { type CanvasLike, decalCanvasSize, decalFont, paintDecal, rgbaCss } from '../src/three/decals';
import { createGeometry } from '../src/three/geometry';

interface FakeCtx {
  fillStyle: string;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  fillText: (t: string, x: number, y: number, max?: number) => void;
}

function fakeCanvas(width: number, height: number, log: string[]): CanvasLike {
  const ctx: FakeCtx = {
    fillStyle: '',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    fillRect: (x, y, w, h) => log.push(`rect ${ctx.fillStyle} ${x},${y},${w},${h}`),
    fillText: (t, x, y, max) => log.push(`text ${ctx.fillStyle} ${ctx.textAlign} ${t} @${x},${y} <${max}`),
  };
  return {
    width,
    height,
    getContext: () => ctx as unknown as CanvasRenderingContext2D,
  };
}

describe('贴花：canvas 尺寸与绘制', () => {
  it('按平面长宽比缩放，长边不超过预算', () => {
    expect(decalCanvasSize(3, 0.8)).toEqual({ width: 1024, height: 273 });
    expect(decalCanvasSize(1, 1, 256)).toEqual({ width: 256, height: 256 });
    expect(decalCanvasSize(0, -2)).toEqual({ width: 8, height: 8 });
  });

  it('颜色与字体按语义生成', () => {
    expect(rgbaCss([1, 0, 0, 0.5])).toBe('rgba(255,0,0,0.500)');
    expect(rgbaCss(undefined)).toBe('rgba(0,0,0,0)');
    expect(rgbaCss(undefined, 'rgba(255,255,255,1)')).toBe('rgba(255,255,255,1)');
    const font = decalFont({ text: 'x', bold: true, fontSize: 64 } as never, 512, 256);
    expect(font.startsWith('700 64px')).toBe(true);
    expect(decalFont({ text: 'x' } as never, 512, 256).startsWith('400 ')).toBe(true);
  });

  it('先铺背景再居中写字；右对齐时锚点在 96%', () => {
    const log: string[] = [];
    paintDecal(fakeCanvas(400, 100, log), {
      text: 'EXIT',
      color: [1, 1, 1, 1],
      background: [0, 0, 0, 1],
      fontSize: 40,
      align: 'right',
    });
    expect(log[0]).toBe('rect rgba(0,0,0,1.000) 0,0,400,100');
    expect(log[1]).toBe('text rgba(255,255,255,1.000) right EXIT @384,52 <368');
    expect(log).toHaveLength(2);
  });

  it('图片贴花不画字；无 text 时什么都不做', () => {
    const log: string[] = [];
    paintDecal(fakeCanvas(64, 64, log), { imageSha: 'a'.repeat(64) } as never);
    paintDecal(fakeCanvas(64, 64, log), {} as never);
    expect(log).toEqual([]);
  });
});

describe('烘焙几何与贴花材质接线', () => {
  const baked = {
    type: 'baked' as const,
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    indices: [0, 1, 2],
    bbox: { min: [0, 0, 0], max: [1, 1, 0] },
  };

  const node = (patch: Record<string, unknown>): MeshNode =>
    ({
      id: 'n_00000001',
      kind: 'mesh',
      name: 'x',
      parent: null,
      visible: true,
      transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
      geometry: baked,
      material: 'm_00000001',
      ...patch,
    }) as unknown as MeshNode;

  it('baked 几何生成带法线与包围盒的 BufferGeometry', () => {
    const g = createGeometry(baked);
    expect(g.getAttribute('position').count).toBe(3);
    expect(g.getAttribute('normal').count).toBe(3);
    expect(g.getIndex()?.count).toBe(3);
    expect(g.boundingBox?.max.x).toBe(1);
  });

  it('node 环境无 canvas 时不套贴花材质，回退到普通材质', () => {
    const mesh = buildMesh(node({ decal: { text: 'X' } }), undefined);
    expect((mesh.material as THREE.Material).type).toBe('MeshStandardMaterial');
    expect(mesh.userData.ownMaterial).toBe(false);
  });
});
