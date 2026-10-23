import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type * as THREE from 'three';
import { useDoc } from '../stores/doc';
import { useSelection } from '../stores/selection';
import { OUTLINE_NAME, selectionOutline } from '../three/build';
import { findNodeObject } from '../three/picking';

export function SelectionOutline({ enabled }: { enabled: boolean }) {
  const scene = useThree((s) => s.scene);
  const ids = useSelection((s) => s.ids);
  const revision = useDoc((s) => s.doc?.revision ?? 0);
  const key = ids.join(',');

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision invalidates in-place scene mutations
  useEffect(() => {
    if (!enabled || ids.length === 0) return;
    const added: { mesh: THREE.Mesh; line: THREE.LineSegments }[] = [];
    for (const id of ids) {
      const root = findNodeObject(scene, id);
      if (!root) continue;
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || mesh.name === OUTLINE_NAME) return;
        const line = selectionOutline(mesh.geometry);
        mesh.add(line);
        added.push({ mesh, line });
      });
    }
    return () => {
      for (const { mesh, line } of added) {
        mesh.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
    };
  }, [scene, key, ids, revision, enabled]);

  return null;
}
