import type { Material, MeshNode } from '@vibebyte/vibe3d-protocol';
import * as THREE from 'three';
import { createDecalTexture } from './decals';
import { createGeometry } from './geometry';
import { fallbackMaterial, toStandardMaterial, toToonMaterial } from './materials';
import { type NprPlan, outlineShell, rampTexture, rimShell } from './npr';

export const OUTLINE_NAME = 'vibe3d-outline';

const canCanvas = (): boolean => typeof document !== 'undefined';

function decalSurface(node: MeshNode): THREE.Material | null {
  if (!node.decal || !canCanvas()) return null;
  const g = node.geometry;
  const size = g.type === 'plane' ? { width: g.width, height: g.height } : { width: 1, height: 1 };
  const texture = createDecalTexture(node.decal, size);
  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
}

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

export function buildMesh(node: MeshNode, material: Material | undefined, npr?: NprPlan): THREE.Mesh {
  const geometry = createGeometry(node.geometry);
  const decal = decalSurface(node);
  const surface =
    decal ??
    (material
      ? npr?.rampSteps
        ? toToonMaterial(material, npr.rampSteps, rampTexture(npr.rampSteps))
        : toStandardMaterial(material)
      : fallbackMaterial());

  const mesh = new THREE.Mesh(geometry, surface);
  mesh.name = node.name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.nodeId = node.id;
  mesh.userData.ownMaterial = Boolean(decal);
  if (npr?.outline) {
    const shell = outlineShell(npr.outline.width, npr.outline.color);
    shell.geometry = geometry;
    mesh.add(shell);
  }
  if (npr?.rim) {
    const shell = rimShell(npr.rim);
    shell.geometry = geometry;
    mesh.add(shell);
  }
  return mesh;
}

export function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  if (mesh.userData.ownMaterial) {
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
  }
}
