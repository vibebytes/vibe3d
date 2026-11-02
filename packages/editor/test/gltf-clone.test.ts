import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { cloneGltfScene } from '../src/three/gltf';

function skinnedScene(): THREE.Group {
  const root = new THREE.Bone();
  root.name = 'Root';
  const tip = new THREE.Bone();
  tip.name = 'Tip';
  tip.position.set(0, 1, 0);
  root.add(tip);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const count = geometry.attributes.position?.count ?? 0;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(count * 4).fill(0), 4));
  geometry.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute(
      new Array(count).fill(0).flatMap(() => [1, 0, 0, 0]),
      4,
    ),
  );
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  const group = new THREE.Group();
  group.add(mesh, root);
  mesh.bind(new THREE.Skeleton([root, tip]));
  return group;
}

describe('cloneGltfScene', () => {
  it('rebinds cloned skinned meshes to cloned bones', () => {
    const source = skinnedScene();
    const clone = cloneGltfScene({ scene: source } as unknown as GLTF);
    const original = source.children[0] as THREE.SkinnedMesh;
    const copy = clone.children[0] as THREE.SkinnedMesh;
    expect(copy.isSkinnedMesh).toBe(true);
    const clonedBones: THREE.Object3D[] = [];
    clone.traverse((o) => (o as THREE.Bone).isBone && clonedBones.push(o));
    expect(copy.skeleton.bones).toHaveLength(2);
    for (const bone of copy.skeleton.bones) {
      expect(clonedBones).toContain(bone);
      expect(original.skeleton.bones).not.toContain(bone);
    }
  });
});
