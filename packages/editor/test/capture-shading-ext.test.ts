import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyShading, shadingNeedsShadows } from '../src/viewport/capture-look';

function makeScene(material: THREE.Material | THREE.Material[]) {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.name = 'vibe3d-export';
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  root.add(mesh);
  scene.add(root);
  return { scene, mesh };
}

describe('B5 着色档 material / rendered', () => {
  it('material 换成无光照基础材质，但保留颜色、贴图、透明度与双面', () => {
    const map = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
    const original = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      map,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    const { scene, mesh } = makeScene(original);
    const restore = applyShading(scene, 'material');
    const next = mesh.material as THREE.MeshBasicMaterial;
    expect(next).not.toBe(original);
    expect(next).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(next.color.getHex()).toBe(0xff0000);
    expect(next.map).toBe(map);
    expect(next.transparent).toBe(true);
    expect(next.opacity).toBe(0.5);
    expect(next.side).toBe(THREE.DoubleSide);
    expect(next.fog).toBe(false);
    restore();
    expect(mesh.material).toBe(original);
  });

  it('诊断着色档（material / flat / wireframe）不吃雾', () => {
    for (const mode of ['flat', 'wireframe', 'material'] as const) {
      const { scene, mesh } = makeScene(new THREE.MeshStandardMaterial({ color: 0x888888 }));
      const restore = applyShading(scene, mode);
      const next = mesh.material as THREE.Material;
      expect({ mode, fog: next.fog }).toEqual({ mode, fog: false });
      restore();
    }
  });

  it('material 对数组材质逐项映射，还原后顺序不变', () => {
    const a = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const b = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const { scene, mesh } = makeScene([a, b]);
    const restore = applyShading(scene, 'material');
    const next = mesh.material as THREE.Material[];
    expect(next).toHaveLength(2);
    expect((next[0] as THREE.MeshBasicMaterial).color.getHex()).toBe(0x111111);
    expect((next[1] as THREE.MeshBasicMaterial).color.getHex()).toBe(0x222222);
    restore();
    expect(mesh.material).toEqual([a, b]);
  });

  it('rendered 不替换材质，只作显式成品档', () => {
    const original = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    const { scene, mesh } = makeScene(original);
    const restore = applyShading(scene, 'rendered');
    expect(mesh.material).toBe(original);
    restore();
    expect(mesh.material).toBe(original);
  });

  it('只有 rendered 需要强制开阴影', () => {
    expect(shadingNeedsShadows('rendered')).toBe(true);
    expect(shadingNeedsShadows('material')).toBe(false);
    expect(shadingNeedsShadows('flat')).toBe(false);
    expect(shadingNeedsShadows(undefined)).toBe(false);
  });
});
