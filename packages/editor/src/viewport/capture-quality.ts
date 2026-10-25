import { type QualityPreset, resolveQuality } from '@vibebyte/vibe3d-scene';
import * as THREE from 'three';

type ShadowLight = THREE.Light & { shadow?: THREE.LightShadow };

export function qualityOf(preset?: QualityPreset | null): QualityPreset {
  return preset ? { ...preset } : resolveQuality();
}

export const MAX_CAPTURE_PIXELS = 4_000_000;

export interface CaptureSize {
  width: number;
  height: number;
  scaled: boolean;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function resolveCaptureSize(
  req: { width?: number; height?: number },
  viewport: { width: number; height: number },
  opts: { ratio?: number; maxPixels?: number } = {},
): CaptureSize {
  const ratio = opts.ratio && opts.ratio > 0 ? opts.ratio : 1;
  const maxPixels = opts.maxPixels ?? MAX_CAPTURE_PIXELS;
  const width = clampInt(req.width ?? viewport.width, 64, 4096);
  const height = clampInt(req.height ?? viewport.height, 64, 4096);
  const devicePixels = width * height * ratio * ratio;
  if (devicePixels <= maxPixels) return { width, height, scaled: false };
  const scale = Math.sqrt(maxPixels / devicePixels);
  let w = Math.max(64, Math.floor(width * scale));
  let h = Math.max(64, Math.floor(height * scale));
  while (w * h * ratio * ratio > maxPixels && (h > 64 || w > 64)) {
    if (h > 64) h -= 1;
    else w -= 1;
  }
  return { width: w, height: h, scaled: true };
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
