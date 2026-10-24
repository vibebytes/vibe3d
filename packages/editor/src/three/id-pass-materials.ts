import * as THREE from 'three';

interface Saved {
  obj: THREE.Object3D;
  material?: THREE.Material | THREE.Material[];
  visible: boolean;
}

export function applyIdMaterials(
  root: THREE.Object3D,
  legend: Record<string, string>,
): () => void {
  const saved: Saved[] = [];
  const cache = new Map<string, THREE.MeshBasicMaterial>();
  root.traverse((obj) => {
    if (obj instanceof THREE.Sprite || obj instanceof THREE.Points || obj instanceof THREE.Line) {
      saved.push({ obj, visible: obj.visible });
      obj.visible = false;
      return;
    }
    if (!(obj instanceof THREE.Mesh)) return;
    const nodeId = obj.userData?.nodeId as string | undefined;
    const hex = nodeId ? legend[nodeId] : undefined;
    const entry: Saved = { obj, material: obj.material, visible: obj.visible };
    saved.push(entry);
    if (!hex) {
      obj.visible = false;
      return;
    }
    let flat = cache.get(hex);
    if (!flat) {
      flat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(hex),
        toneMapped: false,
        fog: false,
      });
      cache.set(hex, flat);
    }
    obj.material = flat;
  });
  return () => {
    for (const item of saved) {
      if (item.material) (item.obj as THREE.Mesh).material = item.material;
      item.obj.visible = item.visible;
    }
    for (const flat of cache.values()) flat.dispose();
  };
}
