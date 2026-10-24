import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { addOverlays } from '../src/viewport/capture-look';

function makeScene(): { scene: THREE.Scene; root: THREE.Group } {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.name = 'vibe3d-export';
  const a = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), new THREE.MeshStandardMaterial());
  a.position.set(1, 0.5, 2);
  a.userData.nodeId = 'n_aaaaaaaa';
  root.add(a);
  scene.add(root);
  scene.updateMatrixWorld(true);
  return { scene, root };
}

const overlay = (scene: THREE.Scene, kind: string) => scene.getObjectByName(`overlay:${kind}`);

const sprites = (node: THREE.Object3D): THREE.Sprite[] => {
  const out: THREE.Sprite[] = [];
  node.traverse((child) => {
    if ((child as THREE.Sprite).isSprite) out.push(child as THREE.Sprite);
  });
  return out;
};

afterEach(() => {
  Reflect.deleteProperty(globalThis as Record<string, unknown>, 'document');
});

describe('J2 出图辅助：标尺与尺寸文字', () => {
  it('scale 标尺带长度文字，悬在刻度上方', () => {
    const { scene } = makeScene();
    const clear = addOverlays(scene, ['scale']);
    const group = overlay(scene, 'scale') as THREE.Group;
    const [label] = sprites(group);
    expect(label).toBeInstanceOf(THREE.Sprite);
    expect(label.userData.text).toBe('2.00 m');
    expect(label.position.y).toBeGreaterThan(0);
    expect(label.position.x).toBeCloseTo(1, 5);
    expect((label.material as THREE.SpriteMaterial).depthTest).toBe(false);
    expect(label.renderOrder).toBe(999);
    clear();
  });

  it('dims 三个轴向各给一个尺寸文字，数值取自包围盒', () => {
    const { scene } = makeScene();
    const clear = addOverlays(scene, ['dims']);
    const group = overlay(scene, 'dims') as THREE.Group;
    const axes = sprites(group).map((sprite) => [sprite.userData.axis, sprite.userData.text]);
    expect(axes).toEqual([
      ['x', '2.00 m'],
      ['y', '1.00 m'],
      ['z', '4.00 m'],
    ]);
    clear();
  });

  it('dims 随 scope 收缩到单个节点的包围盒', () => {
    const { scene } = makeScene();
    const clear = addOverlays(scene, ['dims'], ['n_aaaaaaaa']);
    const group = overlay(scene, 'dims') as THREE.Group;
    expect(JSON.stringify(sprites(group).map((s) => s.userData.text))).toContain('2.00 m');
    expect(group.userData.size).toEqual([2, 1, 4]);
    clear();
  });

  it('文字贴图在无 DOM 时降级为无图 sprite，不抛错', () => {
    const { scene } = makeScene();
    const clear = addOverlays(scene, ['dims', 'scale']);
    const [label] = sprites(overlay(scene, 'dims') as THREE.Group);
    expect((label.material as THREE.SpriteMaterial).map).toBeNull();
    expect(label.userData.text).toBe('2.00 m');
    clear();
  });

  it('有 canvas 时把文字画进贴图，并随 clear 释放', () => {
    const drawn: string[] = [];
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        font: '',
        fillStyle: '',
        textAlign: 'left',
        textBaseline: 'middle',
        clearRect: () => {},
        fillText: (text: string) => drawn.push(text),
        measureText: (text: string) => ({ width: text.length * 10 }),
      }),
    };
    (globalThis as Record<string, unknown>).document = {
      createElement: () => canvas,
    };

    const { scene } = makeScene();
    const clear = addOverlays(scene, ['dims']);
    const labels = sprites(overlay(scene, 'dims') as THREE.Group);
    const texture = (labels[0].material as THREE.SpriteMaterial).map;
    expect(texture).toBeInstanceOf(THREE.CanvasTexture);
    expect(drawn).toEqual(['2.00 m', '1.00 m', '4.00 m']);

    let disposed = false;
    texture?.addEventListener('dispose', () => {
      disposed = true;
    });
    clear();
    expect(disposed).toBe(true);
    expect(overlay(scene, 'dims')).toBeUndefined();
  });
});
