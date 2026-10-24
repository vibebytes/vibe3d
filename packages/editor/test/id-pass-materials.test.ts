import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyIdMaterials } from '../src/three/id-pass-materials';

function mesh(id?: string): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.4 }),
  );
  if (id) m.userData.nodeId = id;
  return m;
}

describe('applyIdMaterials', () => {
  it('paints each node flat with its legend colour', () => {
    const a = mesh('n_00000001');
    const b = mesh('n_00000002');
    const root = new THREE.Group();
    root.add(a, b);

    const restore = applyIdMaterials(root, {
      n_00000001: '#000001',
      n_00000002: '#000002',
    });
    expect((a.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x000001);
    expect((b.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x000002);
    expect((a.material as THREE.MeshBasicMaterial).toneMapped).toBe(false);
    expect((a.material as THREE.MeshBasicMaterial).vertexColors).toBe(false);

    restore();
    expect(a.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect((a.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x8899aa);
  });

  it('hides renderables that are not in the palette and restores them', () => {
    const known = mesh('n_00000001');
    const unknown = mesh('n_00000009');
    const helper = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const root = new THREE.Group();
    root.add(known, unknown, helper);

    const restore = applyIdMaterials(root, { n_00000001: '#000001' });
    expect(known.visible).toBe(true);
    expect(unknown.visible).toBe(false);
    expect(helper.visible).toBe(false);

    restore();
    expect(unknown.visible).toBe(true);
    expect(helper.visible).toBe(true);
  });

  it('keeps points, lines and sprites out of the id pass', () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    sprite.userData.nodeId = 'n_00000003';
    const point = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
    point.userData.nodeId = 'n_00000004';
    const root = new THREE.Group();
    root.add(sprite, point);

    const restore = applyIdMaterials(root, { n_00000003: '#000003', n_00000004: '#000004' });
    expect(sprite.visible).toBe(false);
    expect(point.visible).toBe(false);
    restore();
  });
});
