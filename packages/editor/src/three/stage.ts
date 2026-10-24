import type { Env, StageState } from '@vibebyte/vibe3d-protocol';
import type * as THREE from 'three';

export type StagePreset = StageState['preset'];

export interface StageLight {
  type: 'ambient' | 'directional';
  color: string;
  intensity: number;
  position?: [number, number, number];
  castShadow?: boolean;
}

const RIGS: Record<StagePreset, StageLight[]> = {
  flat: [{ type: 'ambient', color: '#FFFFFF', intensity: 1.1 }],
  clean: [
    { type: 'ambient', color: '#FFFFFF', intensity: 0.5 },
    { type: 'directional', color: '#FFFFFF', intensity: 2.1, position: [4, 6, 3], castShadow: true },
    { type: 'directional', color: '#BFD4FF', intensity: 0.5, position: [-3, 2, -4] },
  ],
  cine: [
    { type: 'ambient', color: '#FFFFFF', intensity: 0.22 },
    { type: 'directional', color: '#FFD9B0', intensity: 2.4, position: [5, 6, 2], castShadow: true },
    { type: 'directional', color: '#7AA7FF', intensity: 0.9, position: [-4, 3, -3] },
  ],
};

export const BASE_EXPOSURE: Record<StagePreset, number> = { flat: 1.15, clean: 1, cine: 0.92 };

export function stageLights(preset: StagePreset): StageLight[] {
  return RIGS[preset];
}

function luminance(rgb: readonly number[]): number {
  const [r, g, b] = rgb;
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function backgroundLuminance(env: Env): number {
  if (!env.gradient) return luminance(env.background);
  return (luminance(env.gradient.top) + luminance(env.gradient.bottom)) / 2;
}

export function resolveExposure(stage: StageState, env: Env): number {
  const base = stage.exposure ?? BASE_EXPOSURE[stage.preset];
  if (!stage.autoExposure) return base;
  // autoExposure approximates the frame luminance from background + ambient so it stays deterministic per doc.
  const scene = backgroundLuminance(env) * 0.6 + luminance(env.ambient) * env.ambientIntensity * 0.4;
  const target = 0.18;
  const gain = Math.min(4, Math.max(0.25, target / Math.max(0.02, scene)));
  return Math.min(8, Math.max(0.1, base * gain));
}

export function applyStage(gl: THREE.WebGLRenderer, stage: StageState, env: Env): void {
  gl.toneMappingExposure = resolveExposure(stage, env);
}

export function backgroundHex(env: Env): string {
  const [r, g, b] = env.background;
  const hex = (v: number | undefined) =>
    Math.round(Math.min(1, Math.max(0, v ?? 0)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export type BackdropPlan =
  | { kind: 'solid'; hex: string }
  | { kind: 'gradient'; hex: string; width: number; height: number; data: Uint8Array };

const byte = (v: number | undefined): number => Math.round(Math.min(1, Math.max(0, v ?? 0)) * 255);

export function backdropPlan(env: Env): BackdropPlan {
  if (!env.gradient) return { kind: 'solid', hex: backgroundHex(env) };
  const width = 2;
  const height = 256;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const lo = env.gradient.bottom[c];
        const hi = env.gradient.top[c];
        data[i + c] = byte((lo ?? 0) + ((hi ?? 0) - (lo ?? 0)) * t);
      }
    }
  }
  return { kind: 'gradient', hex: backgroundHex(env), width, height, data };
}
