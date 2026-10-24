import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { addOverlays } from '../src/viewport/capture-look';

function makeScene(): { scene: THREE.Scene; a: THREE.Mesh; b: THREE.Mesh } {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.name = 'vibe3d-export';
  const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  a.position.set(0, 0.5, 0);
  a.userData.nodeId = 'n_aaaaaaaa';
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  b.position.set(6, 0.5, 0);
  b.userData.nodeId = 'n_bbbbbbbb';
  root.add(a, b);
  scene.add(root);
  scene.updateMatrixWorld(true);
  return { scene, a, b };
}

function overlay(scene: THREE.Scene, kind: string): THREE.Object3D | undefined {
  return scene.getObjectByName(`overlay:${kind}`);
}

describe('B3 overlay 扩充', () => {
  it('ground 落在地面高度并覆盖整个足迹', () => {
    const { scene } = makeScene();
    const clear = addOverlays(scene, ['ground']);
    const plane = overlay(scene, 'ground') as THREE.Mesh;
    expect(plane).toBeInstanceOf(THREE.Mesh);
    const box = new THREE.Box3().setFromObject(plane);
    expect(box.min.y).toBeCloseTo(0, 3);
    expect(box.max.x - box.min.x).toBeGreaterThan(6);
    clear();
    expect(overlay(scene, 'ground')).toBeUndefined();
  });

  it('centerline 是从地面到顶部的竖线，穿过包围盒中心', () => {
    const { scene } = makeScene();
    const clear = addOverlays(scene, ['centerline']);
    const line = overlay(scene, 'centerline') as THREE.Line;
    const points = (line.geometry as THREE.BufferGeometry).getAttribute('position');
    expect(points.count).toBe(2);
    expect(points.getY(0)).toBeCloseTo(0, 3);
    expect(points.getY(1)).toBeCloseTo(1, 3);
    expect(points.getX(0)).toBeCloseTo(3, 3);
    expect(points.getZ(0)).toBeCloseTo(0, 3);
    clear();
  });

  it('scale 给出整十进位刻度尺，长度不超过场景跨度', () => {
    const { scene } = makeScene();
    const clear = addOverlays(scene, ['scale']);
    const scale = overlay(scene, 'scale') as THREE.Group;
    const length = Number(scale.userData.length);
    expect([1, 2, 5, 10].some((base) => Math.abs(length - base) < 1e-6)).toBe(true);
    expect(length).toBeLessThanOrEqual(6);
    const line = scale.children.find((c) => (c as THREE.Line).isLine) as THREE.Line;
    const pts = (line.geometry as THREE.BufferGeometry).getAttribute('position');
    expect(pts.getX(1) - pts.getX(0)).toBeCloseTo(length, 5);
    expect(scale.children.length).toBeGreaterThanOrEqual(3);
    clear();
  });

  it('normal 按网格法线画线段，跳过隐藏节点', () => {
    const { scene, b } = makeScene();
    b.visible = false;
    const clear = addOverlays(scene, ['normal']);
    const group = overlay(scene, 'normal') as THREE.Group;
    expect(group.children.length).toBe(1);
    const seg = group.children[0] as THREE.LineSegments;
    expect((seg.geometry as THREE.BufferGeometry).getAttribute('position').count).toBeGreaterThan(0);
    clear();
  });

  it('给定 isolate 区域时只框选该区域，而不是整场景', () => {
    const { scene } = makeScene();
    const clear = addOverlays(scene, ['bbox'], ['n_bbbbbbbb']);
    const helper = overlay(scene, 'bbox') as THREE.Box3Helper;
    const size = new THREE.Box3().setFromObject(helper).getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(2);
    clear();
  });

  it('clear 后所有叠加物都从场景移除且几何被释放', () => {
    const { scene } = makeScene();
    const clear = addOverlays(scene, ['ground', 'centerline', 'scale', 'normal']);
    const before = scene.children.filter((c) => c.name.startsWith('overlay:')).length;
    expect(before).toBe(4);
    clear();
    expect(scene.children.filter((c) => c.name.startsWith('overlay:')).length).toBe(0);
  });

  it('空 overlay 列表不添加任何对象', () => {
    const { scene } = makeScene();
    const clear = addOverlays(scene, []);
    expect(scene.children.filter((c) => c.name.startsWith('overlay:'))).toHaveLength(0);
    clear();
  });
});
