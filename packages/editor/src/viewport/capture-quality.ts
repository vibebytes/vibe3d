import { type QualityPreset, resolveQuality } from '@vibebyte/vibe3d-scene';
import * as THREE from 'three';

type ShadowLight = THREE.Light & { shadow?: THREE.LightShadow };

export function qualityOf(preset?: QualityPreset | null): QualityPreset {
  return preset ? { ...preset } : resolveQuality();
}

export function applyShadowResolution(scene: THREE.Scene, size: number): () => void {
  const touched: Array<{ shadow: THREE.LightShadow; prev: THREE.Vector2 }> = [];
  scene.traverse((obj) => {
    const light = obj as ShadowLight;
    if (!light.isLight || !light.castShadow || !light.shadow) return;
    if (light.shadow.mapSize.x === size && light.shadow.mapSize.y === size) return;
    touched.push({ shadow: light.shadow, prev: light.shadow.mapSize.clone() });
    light.shadow.map?.dispose();
    light.shadow.map = null;
    light.shadow.mapSize.set(size, size);
  });
  return () => {
    for (const { shadow, prev } of touched) {
      shadow.map?.dispose();
      shadow.map = null;
      shadow.mapSize.copy(prev);
    }
  };
}
