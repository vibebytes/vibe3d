import {
  type MapTransform,
  type Material,
  type MaterialMap,
  type MaterialPreset,
  materialPresetSchema,
} from '@vibebyte/vibe3d-protocol';

export const MATERIAL_PRESETS = materialPresetSchema.options;
export type { MaterialPreset };

const PRESETS: Record<MaterialPreset, Material> = {
  concrete: {
    baseColor: [0.56, 0.55, 0.52, 1],
    metalness: 0,
    roughness: 0.92,
    emissive: [0, 0, 0],
    emissiveIntensity: 0,
    opacity: 1,
    doubleSided: false,
  },
  rust: {
    baseColor: [0.42, 0.18, 0.08, 1],
    metalness: 0.15,
    roughness: 0.85,
    emissive: [0, 0, 0],
    emissiveIntensity: 0,
    opacity: 1,
    doubleSided: false,
  },
  wet_moss: {
    baseColor: [0.12, 0.28, 0.1, 1],
    metalness: 0,
    roughness: 0.98,
    emissive: [0, 0.03, 0],
    emissiveIntensity: 0.05,
    opacity: 1,
    doubleSided: false,
  },
  toon: {
    baseColor: [0.9, 0.66, 0.36, 1],
    metalness: 0,
    roughness: 1,
    emissive: [0, 0, 0],
    emissiveIntensity: 0,
    opacity: 1,
    doubleSided: false,
  },
  water: {
    baseColor: [0.05, 0.26, 0.36, 1],
    metalness: 0.1,
    roughness: 0.12,
    emissive: [0, 0, 0],
    emissiveIntensity: 0,
    opacity: 0.75,
    doubleSided: true,
  },
  glass: {
    baseColor: [0.85, 0.92, 0.95, 1],
    metalness: 0,
    roughness: 0.05,
    emissive: [0, 0, 0],
    emissiveIntensity: 0,
    opacity: 0.35,
    doubleSided: true,
  },
};

export function isMaterialPreset(value: string): value is MaterialPreset {
  return (MATERIAL_PRESETS as readonly string[]).includes(value);
}

export function presetMaterial(preset: MaterialPreset, params?: Partial<Material>): Material {
  return {
    ...structuredClone(PRESETS[preset]),
    ...(params ?? {}),
    baseColor: params?.baseColor ?? [...PRESETS[preset].baseColor],
    emissive: params?.emissive ?? [...PRESETS[preset].emissive],
  };
}

export function normalizeMap(map: MaterialMap | undefined): MapTransform | undefined {
  if (map === undefined) return undefined;
  return typeof map === 'string' ? { sha: map } : map;
}

const TILING: [number, number] = [1, 1];
const OFFSET: [number, number] = [0, 0];

export function uvMatrix(
  map: Pick<MapTransform, 'tiling' | 'offset' | 'rotation'>,
): [number, number, number, number, number, number] {
  const [su, sv] = map.tiling ?? TILING;
  const [ou, ov] = map.offset ?? OFFSET;
  const theta = map.rotation ?? 0;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return [
    cos * su,
    sin * su,
    -sin * sv,
    cos * sv,
    0.5 - 0.5 * cos + 0.5 * sin + ou,
    0.5 - 0.5 * sin - 0.5 * cos + ov,
  ];
}

export function applyUv(
  map: Pick<MapTransform, 'tiling' | 'offset' | 'rotation'> & { sha?: string },
  [u, v]: [number, number],
): [number, number] {
  const m = uvMatrix(map);
  return [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]];
}
