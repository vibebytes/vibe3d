import type { Material, MeshNode } from '@vibebyte/vibe3d-protocol';
import * as THREE from 'three';
import { createGeometry } from './geometry';
import { fallbackMaterial, toStandardMaterial } from './materials';

export const OUTLINE_NAME = 'vibe3d-outline';

export function selectionOutline(geometry: THREE.BufferGeometry, color = '#5FE3C0'): THREE.LineSegments {
  const line = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 30),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false }),
  );
  line.name = OUTLINE_NAME;
  line.renderOrder = 2;
  line.raycast = () => {};
  return line;
}

export function buildMesh(node: MeshNode, material: Material | undefined): THREE.Mesh {
  const mesh = new THREE.Mesh(
    createGeometry(node.geometry),
    material ? toStandardMaterial(material) : fallbackMaterial(),
  );
  mesh.name = node.name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.nodeId = node.id;
  return mesh;
}

export function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
}
