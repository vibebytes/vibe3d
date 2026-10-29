import * as THREE from 'three';
import { OUTLINE_NAME } from './build';

export function nodeIdOf(object: THREE.Object3D | null): string | null {
  let cur: THREE.Object3D | null = object;
  while (cur) {
    const id = cur.userData?.nodeId;
    if (typeof id === 'string') return id;
    cur = cur.parent;
  }
  return null;
}

export function findNodeObject(root: THREE.Object3D, nodeId: string): THREE.Object3D | null {
  for (const child of root.children) {
    if (child.userData?.nodeId === nodeId) return child;
    const nested = findNodeObject(child, nodeId);
    if (nested) return nested;
  }
  return null;
}

export function ndcFromPointer(clientX: number, clientY: number, el: HTMLElement): THREE.Vector2 {
  const rect = el.getBoundingClientRect();
  return new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
}

function isHidden(object: THREE.Object3D): boolean {
  let cur: THREE.Object3D | null = object;
  while (cur) {
    if (!cur.visible) return true;
    cur = cur.parent;
  }
  return false;
}

export interface PickResult {
  id: string;
  distance: number;
  object: THREE.Object3D;
}

export function pickAt(
  scene: THREE.Object3D,
  camera: THREE.Camera,
  clientX: number,
  clientY: number,
  el: HTMLElement,
  frame?: { x: number; y: number; w: number; h: number },
): PickResult | null {
  const rect = el.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (frame && (x < frame.x || y < frame.y || x > frame.x + frame.w || y > frame.y + frame.h)) return null;
  const ndc = frame
    ? new THREE.Vector2(((x - frame.x) / frame.w) * 2 - 1, -((y - frame.y) / frame.h) * 2 + 1)
    : ndcFromPointer(clientX, clientY, el);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  for (const hit of hits) {
    if (hit.object.name === OUTLINE_NAME) continue;
    if (isHidden(hit.object)) continue;
    const id = nodeIdOf(hit.object);
    if (id) return { id, distance: hit.distance, object: hit.object };
  }
  return null;
}

export function boundingSphereOf(objects: THREE.Object3D[]): { center: THREE.Vector3; radius: number } {
  const box = new THREE.Box3();
  for (const obj of objects) box.expandByObject(obj);
  if (box.isEmpty()) return { center: new THREE.Vector3(), radius: 2 };
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  return { center: sphere.center, radius: Math.max(0.5, sphere.radius) };
}
