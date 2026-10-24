import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { addOverlays, applyShading } from '../src/viewport/capture-look';

function makeScene(): { scene: THREE.Scene; mesh: THREE.Mesh; material: THREE.MeshStandardMaterial } {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.name = 'vibe3d-export';
  const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  root.add(mesh);
  scene.add(root);
  return { scene, mesh, material };
}

function materialOf(mesh: THREE.Mesh): THREE.Material {
  return mesh.material as THREE.Material;
}

describe('渲染着色 applyShading', () => {
  it('flat 用纯色基础材质替换网格材质，且不动 scene.overrideMaterial', () => {
    const { scene, mesh, material } = makeScene();
    const restore = applyShading(scene, 'flat');
    const next = materialOf(mesh) as THREE.MeshBasicMaterial;
    expect(next).not.toBe(material);
    expect(next.color.getHex()).toBe(0xc9d3dd);
    expect(scene.overrideMaterial).toBeNull();
    restore();
    expect(materialOf(mesh)).toBe(material);
  });

  it('wireframe 打开线框并用蓝灰色', () => {
    const { scene, mesh } = makeScene();
    const restore = applyShading(scene, 'wireframe');
    const next = materialOf(mesh) as THREE.MeshBasicMaterial;
    expect(next.wireframe).toBe(true);
    expect(next.color.getHex()).toBe(0x8fb7ff);
    restore();
  });

  it('normals 用 MeshNormalMaterial', () => {
    const { scene, mesh } = makeScene();
    const restore = applyShading(scene, 'normals');
    expect(materialOf(mesh)).toBeInstanceOf(THREE.MeshNormalMaterial);
    restore();
  });

  it('未指定着色时不替换材质，还原函数可安全调用', () => {
    const { scene, mesh, material } = makeScene();
    const restore = applyShading(scene, undefined);
    expect(materialOf(mesh)).toBe(material);
    expect(() => restore()).not.toThrow();
  });

  it('多材质数组逐项替换并在还原后恢复原数组顺序', () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    root.name = 'vibe3d-export';
    const a = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const b = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [a, b]);
    root.add(mesh);
    scene.add(root);
    const restore = applyShading(scene, 'flat');
    const next = mesh.material as THREE.Material[];
    expect(Array.isArray(next)).toBe(true);
    expect(next).toHaveLength(2);
    expect(next[0]).not.toBe(a);
    restore();
    expect(mesh.material).toEqual([a, b]);
  });
});

describe('诊断叠加 addOverlays', () => {
  it('bbox 用青色 Box3Helper 且包围盒贴合导出根节点', () => {
    const { scene, mesh } = makeScene();
    mesh.position.set(2, 1, 0);
    scene.updateMatrixWorld(true);
    const clear = addOverlays(scene, ['bbox']);
    const helper = scene.children.find((c) => c instanceof THREE.Box3Helper) as THREE.Box3Helper;
    expect(helper).toBeTruthy();
    const material = helper.material as THREE.LineBasicMaterial;
    expect(material.color.getHex()).toBe(0x5fe3c0);
    const box = (helper as unknown as { box: THREE.Box3 }).box.clone();
    expect(box.min.x).toBeCloseTo(1.5);
    expect(box.max.x).toBeCloseTo(2.5);
    clear();
    expect(scene.children.some((c) => c instanceof THREE.Box3Helper)).toBe(false);
  });

  it('grid 边长取包围盒最大边两倍，20 个分段，贴在底面', () => {
    const { scene } = makeScene();
    scene.updateMatrixWorld(true);
    const clear = addOverlays(scene, ['grid']);
    const grid = scene.children.find((c) => c instanceof THREE.GridHelper) as THREE.GridHelper;
    expect(grid).toBeTruthy();
    expect(grid.position.y).toBeCloseTo(-0.5);
    const geometry = grid.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(position.count).toBe(84);
    clear();
  });

  it('axes 长度取包围盒最大边的一半并置于包围盒最小角', () => {
    const { scene } = makeScene();
    scene.updateMatrixWorld(true);
    const clear = addOverlays(scene, ['axes']);
    const axes = scene.children.find((c) => c instanceof THREE.AxesHelper) as THREE.AxesHelper;
    expect(axes).toBeTruthy();
    expect(axes.position.x).toBeCloseTo(-0.5);
    expect(axes.position.y).toBeCloseTo(-0.5);
    clear();
    expect(scene.children.some((c) => c instanceof THREE.AxesHelper)).toBe(false);
  });

  it('axes 关闭深度测试并置顶渲染，避免被模型遮挡', () => {
    const { scene } = makeScene();
    scene.updateMatrixWorld(true);
    const clear = addOverlays(scene, ['axes']);
    const axes = scene.children.find((c) => c instanceof THREE.AxesHelper) as THREE.AxesHelper;
    const material = axes.material as THREE.LineBasicMaterial;
    expect(material.depthTest).toBe(false);
    expect(axes.renderOrder).toBe(999);
    clear();
  });

  it('未指定种类时不改动场景', () => {
    const { scene } = makeScene();
    const before = scene.children.length;
    const clear = addOverlays(scene, []);
    expect(scene.children.length).toBe(before);
    clear();
  });

  it('叠加与着色共存时辅助线的材质不被替换', () => {
    const { scene } = makeScene();
    scene.updateMatrixWorld(true);
    const restore = applyShading(scene, 'flat');
    const clear = addOverlays(scene, ['bbox']);
    const helper = scene.children.find((c) => c instanceof THREE.Box3Helper) as THREE.Box3Helper;
    expect(helper.material).toBeInstanceOf(THREE.LineBasicMaterial);
    expect(scene.overrideMaterial).toBeNull();
    clear();
    restore();
  });
});
