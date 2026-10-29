import { type MeshNode, type StageState, emptyDoc } from '@vibebyte/vibe3d-protocol';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildMesh } from '../src/three/build';
import { nprPlan, rampTexture } from '../src/three/npr';
import { postPasses, postPlan, toneMappingOf } from '../src/three/post';

const stage = (patch: Partial<StageState>): StageState => ({ ...emptyDoc('t').stage, ...patch });

const NODE = {
  id: 'n_00000001',
  kind: 'mesh',
  name: 'box',
  parent: null,
  visible: true,
  transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
  geometry: { type: 'box', size: [1, 1, 1] },
  material: 'm_00000001',
} as unknown as MeshNode;

const SPEC = {
  baseColor: [1, 1, 1, 1],
  metalness: 0,
  roughness: 0.6,
  emissive: [0, 0, 0],
  emissiveIntensity: 0,
  opacity: 1,
  doubleSided: false,
} as const;

describe('stage.post 渲染计划', () => {
  it('未设 post 时不启用任何后处理', () => {
    expect(postPlan(stage({}))).toBeNull();
  });

  it('bloom 缺省补全强度/半径/阈值，tonemap 默认 aces', () => {
    expect(postPlan(stage({ post: { bloom: { intensity: 1.2 } } }))).toEqual({
      bloom: { strength: 1.2, radius: 0.4, threshold: 0.2 },
      tonemap: 'aces',
    });
  });

  it('dof 由焦距与光圈推出 focus/maxBlur', () => {
    expect(postPlan(stage({ post: { dof: { aperture: 0.03, focusDistance: 4 } } }))).toEqual({
      dof: { focus: 4, aperture: 0.03, maxBlur: 0.06 },
      tonemap: 'aces',
    });
    expect(postPlan(stage({ post: { dof: {} } }))?.dof).toEqual({ focus: 6, aperture: 0.02, maxBlur: 0.04 });
  });

  it('ssao 缺省半径与强度', () => {
    expect(postPlan(stage({ post: { ssao: {} } }))?.ssao).toEqual({ radius: 0.6, intensity: 1 });
  });

  it('tonemap 映射到 three 常量', () => {
    expect(toneMappingOf('aces')).toBe(THREE.ACESFilmicToneMapping);
    expect(toneMappingOf('reinhard')).toBe(THREE.ReinhardToneMapping);
    expect(toneMappingOf('linear')).toBe(THREE.NoToneMapping);
  });

  it('通道按 渲染 → SSAO → 景深 → Bloom → 输出 排序', () => {
    const plan = postPlan(stage({ post: { bloom: {}, dof: {}, ssao: {} } }));
    expect(plan && postPasses(plan)).toEqual(['render', 'ssao', 'dof', 'bloom', 'output']);
  });

  it('只调 tonemap 时也要走 渲染 + 输出', () => {
    const plan = postPlan(stage({ post: { tonemap: 'reinhard' } }));
    expect(plan && postPasses(plan)).toEqual(['render', 'output']);
  });
});

describe('stage.npr 渲染计划', () => {
  it('未设 npr 时返回 null', () => {
    expect(nprPlan(stage({}))).toBeNull();
  });

  it('outline 缺省宽度与颜色，rampSteps 透传，rim 缺省 0', () => {
    expect(nprPlan(stage({ npr: { rampSteps: 3 } }))).toEqual({ rampSteps: 3, rim: 0 });
    expect(nprPlan(stage({ npr: { outline: {} } }))).toEqual({
      outline: { width: 1.5, color: '#0b0f14' },
      rim: 0,
    });
    expect(nprPlan(stage({ npr: { outline: { width: 3, color: [1, 0, 0, 1] }, rim: 0.6 } }))).toEqual({
      outline: { width: 3, color: '#ff0000' },
      rim: 0.6,
    });
  });

  it('色阶贴图按步数生成灰阶', () => {
    const tex = rampTexture(4);
    const data = tex.image.data as Uint8Array;
    expect(data.length).toBe(16);
    expect([0, 4, 8, 12].map((i) => data[i])).toEqual([0, 85, 170, 255]);
  });
});

describe('NPR 接到网格上', () => {
  it('outline 生成反壳子网格，不改主材质', () => {
    const mesh = buildMesh(NODE, SPEC, nprPlan(stage({ npr: { outline: { width: 2 } } })) ?? undefined);
    const shell = mesh.children.find((c) => c.name === 'vibe3d-npr-outline') as THREE.Mesh | undefined;
    expect(shell).toBeInstanceOf(THREE.Mesh);
    expect((shell?.material as THREE.ShaderMaterial).side).toBe(THREE.BackSide);
    expect((mesh.material as THREE.MeshStandardMaterial).side).toBe(THREE.FrontSide);
  });

  it('rampSteps 走 MeshToonMaterial 并带渐变贴图', () => {
    const mesh = buildMesh(NODE, SPEC, nprPlan(stage({ npr: { rampSteps: 3 } })) ?? undefined);
    const mat = mesh.material as THREE.MeshToonMaterial;
    expect(mat.type).toBe('MeshToonMaterial');
    expect(mat.gradientMap?.image.width).toBe(3);
  });
});
