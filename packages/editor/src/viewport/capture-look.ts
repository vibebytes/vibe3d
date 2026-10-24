import * as THREE from 'three';

export type ShadingMode = 'flat' | 'wireframe' | 'normals';
export type OverlayKind = 'grid' | 'axes' | 'bbox';

function exportRoot(scene: THREE.Scene): THREE.Object3D | undefined {
  return scene.getObjectByName('vibe3d-export');
}

function shadingMaterial(mode: ShadingMode): THREE.Material {
  if (mode === 'normals') return new THREE.MeshNormalMaterial();
  if (mode === 'wireframe') return new THREE.MeshBasicMaterial({ color: 0x8fb7ff, wireframe: true });
  return new THREE.MeshBasicMaterial({ color: 0xc9d3dd });
}

export function applyShading(scene: THREE.Scene, mode?: ShadingMode): () => void {
  if (!mode) return () => {};
  const root = exportRoot(scene);
  if (!root) return () => {};
  const swapped: Array<{ mesh: THREE.Mesh; previous: THREE.Material | THREE.Material[] }> = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    swapped.push({ mesh, previous: mesh.material });
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(() => shadingMaterial(mode))
      : shadingMaterial(mode);
  });
  return () => {
    for (const entry of swapped) {
      const current = entry.mesh.material;
      const next = Array.isArray(current) ? current : [current];
      for (const item of next) item.dispose();
      entry.mesh.material = entry.previous;
    }
  };
}

export function addOverlays(scene: THREE.Scene, kinds: OverlayKind[] = []): () => void {
  if (kinds.length === 0) return () => {};
  const root = exportRoot(scene);
  const box = new THREE.Box3();
  if (root) box.setFromObject(root);
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 0.001);
  const added: THREE.Object3D[] = [];
  if (kinds.includes('grid')) {
    const grid = new THREE.GridHelper(span * 2, 20, 0x6f8496, 0x333f4b);
    grid.position.set(center.x, box.min.y, center.z);
    added.push(grid);
  }
  if (kinds.includes('axes')) {
    const axes = new THREE.AxesHelper(span * 0.5);
    axes.position.copy(box.min);
    const material = axes.material as THREE.LineBasicMaterial;
    material.depthTest = false;
    material.transparent = true;
    axes.renderOrder = 999;
    added.push(axes);
  }
  if (kinds.includes('bbox')) added.push(new THREE.Box3Helper(box.clone(), 0x5fe3c0));
  for (const obj of added) scene.add(obj);
  return () => {
    for (const obj of added) {
      scene.remove(obj);
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material;
        if (Array.isArray(material)) for (const item of material) item.dispose();
        else material?.dispose?.();
      });
    }
  };
}

const HIGHLIGHT = 0xf2b45c;

function exportRootOf(scene: THREE.Scene): THREE.Object3D | undefined {
  return scene.getObjectByName('vibe3d-export');
}

function ownsTarget(mesh: THREE.Object3D, targets: Set<string>): boolean {
  let current: THREE.Object3D | null = mesh;
  while (current) {
    const id = current.userData.nodeId;
    if (typeof id === 'string' && targets.has(id)) return true;
    if (current.name === 'vibe3d-export') return false;
    current = current.parent;
  }
  return false;
}

function highlightMaterial(base: THREE.Material): THREE.Material {
  const transparent = base.transparent;
  const opacity = base.opacity;
  const material = new THREE.MeshBasicMaterial({
    color: HIGHLIGHT,
    transparent,
    opacity,
    depthTest: true,
    depthWrite: true,
  });
  return material;
}

export function applyHighlight(scene: THREE.Scene, ids: readonly string[] = []): () => void {
  if (ids.length === 0) return () => {};
  const root = exportRootOf(scene);
  if (!root) return () => {};
  const targets = new Set(ids);
  const swapped: Array<{ mesh: THREE.Mesh; previous: THREE.Material | THREE.Material[] }> = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || !ownsTarget(mesh, targets)) return;
    swapped.push({ mesh, previous: mesh.material });
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((item) => highlightMaterial(item))
      : highlightMaterial(mesh.material);
  });
  return () => {
    for (const entry of swapped) {
      const current = entry.mesh.material;
      const list = Array.isArray(current) ? current : [current];
      for (const item of list) item.dispose();
      entry.mesh.material = entry.previous;
    }
  };
}

export function applyIsolate(scene: THREE.Scene, ids: readonly string[] = []): () => void {
  if (ids.length === 0) return () => {};
  const root = exportRootOf(scene);
  if (!root) return () => {};
  const targets = new Set(ids);
  const changed: Array<{ mesh: THREE.Mesh; visible: boolean }> = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (ownsTarget(mesh, targets)) return;
    changed.push({ mesh, visible: mesh.visible });
    mesh.visible = false;
  });
  return () => {
    for (const entry of changed) entry.mesh.visible = entry.visible;
  };
}
