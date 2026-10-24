import type { LightSpec } from '@vibebyte/vibe3d-protocol';
import { rgbaHex } from './materials';

export type LightPlan =
  | { kind: 'ambient'; color: string; intensity: number }
  | {
      kind: 'directional';
      color: string;
      intensity: number;
      position: [number, number, number];
      castShadow: boolean;
    }
  | {
      kind: 'point';
      color: string;
      intensity: number;
      position: [number, number, number];
      castShadow: boolean;
    }
  | {
      kind: 'spot';
      color: string;
      intensity: number;
      position: [number, number, number];
      angle: number;
      penumbra: number;
      castShadow: boolean;
    }
  | {
      kind: 'area';
      color: string;
      intensity: number;
      position: [number, number, number];
      target: [number, number, number];
      width: number;
      height: number;
      castShadow: false;
    };

export function lightPlan(spec: LightSpec): LightPlan {
  const color = rgbaHex(spec.color);
  const intensity = spec.intensity;
  if (spec.type === 'ambient') return { kind: 'ambient', color, intensity };
  const position = spec.position ?? [0, 2, 0];
  if (spec.type === 'area') {
    return {
      kind: 'area',
      color,
      intensity,
      position,
      target: spec.target ?? [0, 0, 0],
      width: spec.width ?? 2,
      height: spec.height ?? 1,
      castShadow: false,
    };
  }
  if (spec.type === 'directional') {
    return { kind: 'directional', color, intensity, position, castShadow: spec.castShadow ?? false };
  }
  if (spec.type === 'spot') {
    return {
      kind: 'spot',
      color,
      intensity,
      position,
      angle: spec.angle ?? Math.PI / 6,
      penumbra: spec.penumbra ?? 0.4,
      castShadow: spec.castShadow ?? false,
    };
  }
  return { kind: 'point', color, intensity, position, castShadow: spec.castShadow ?? false };
}
