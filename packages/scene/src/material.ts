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

export interface PresetResolution {
  preset: MaterialPreset;
  params: Partial<Material>;
  note?: string;
}

const PRESET_ALIASES: Record<string, MaterialPreset> = {
  matte: 'concrete',
  matt: 'concrete',
  white: 'concrete',
  plaster: 'concrete',
  clay: 'concrete',
  cement: 'concrete',
  stone: 'concrete',
  grey: 'concrete',
  gray: 'concrete',
  plain: 'concrete',
  default: 'concrete',
  metal: 'concrete',
  steel: 'concrete',
  iron: 'concrete',
  chrome: 'concrete',
  aluminium: 'concrete',
  aluminum: 'concrete',
  brass: 'concrete',
  copper: 'concrete',
  rusted: 'rust',
  corroded: 'rust',
  moss: 'wet_moss',
  grass: 'wet_moss',
  foliage: 'wet_moss',
  cartoon: 'toon',
  flat: 'toon',
  anime: 'toon',
  liquid: 'water',
  sea: 'water',
  ocean: 'water',
  lake: 'water',
  window: 'glass',
  transparent: 'glass',
  acrylic: 'glass',
};

const METAL_PARAMS: Partial<Material> = {
  baseColor: [0.68, 0.7, 0.74, 1],
  metalness: 0.85,
  roughness: 0.3,
};
const LIGHT_PARAMS: Partial<Material> = {
  baseColor: [0.92, 0.93, 0.94, 1],
  metalness: 0.02,
  roughness: 0.6,
};
const NEUTRAL_PARAMS: Partial<Material> = {
  baseColor: [0.86, 0.87, 0.89, 1],
  metalness: 0.05,
  roughness: 0.75,
};

const METAL_TOKENS = new Set(['metal', 'steel', 'iron', 'chrome', 'aluminium', 'aluminum', 'brass', 'copper']);
const LIGHT_TOKENS = new Set(['white', 'matte', 'matt', 'light', 'bright', 'plaster', 'clay', 'paper']);

export function resolveMaterialPreset(raw?: string, params?: Partial<Material>): PresetResolution {
  const original = (raw ?? '').trim();
  const key = original
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const given = params ?? {};
  if (!key) {
    return {
      preset: 'concrete',
      params: { ...NEUTRAL_PARAMS, ...given },
      note: '未指定 preset，已按浅灰混凝土（concrete）创建',
    };
  }
  if (isMaterialPreset(key)) return { preset: key, params: given };

  const tokens = key.split('_').filter(Boolean);
  const flat = tokens.join('');
  const alias = PRESET_ALIASES[flat] ?? tokens.map((token) => PRESET_ALIASES[token]).find(Boolean);
  if (alias) {
    const metal = tokens.some((t) => METAL_TOKENS.has(t));
    const light = !metal && alias === 'concrete' && tokens.some((t) => LIGHT_TOKENS.has(t));
    const derived: Partial<Material> = metal ? METAL_PARAMS : light ? LIGHT_PARAMS : {};
    const flavour = metal ? '金属质感的 ' : light ? '浅色的 ' : '';
    return {
      preset: alias,
      params: { ...derived, ...given },
      note: `preset「${original}」不是预设名，已按${flavour}${alias}创建`,
    };
  }
  if (tokens.some((token) => METAL_TOKENS.has(token))) {
    return {
      preset: 'concrete',
      params: { ...METAL_PARAMS, ...given },
      note: `preset「${original}」不是预设名，已按金属质感的 concrete 创建`,
    };
  }
  return {
    preset: 'concrete',
    params: { ...NEUTRAL_PARAMS, ...given },
    note: `preset「${original}」不是预设名，已回退 concrete（可用：${MATERIAL_PRESETS.join(' | ')}）`,
  };
}

export type NormalizedMap = Omit<MapTransform, 'uv'>;

export function normalizeMap(map: MaterialMap | undefined): NormalizedMap | undefined {
  if (map === undefined) return undefined;
  if (typeof map === 'string') return { sha: map };
  const { uv, ...flat } = map;
  if (!uv) return flat;
  return {
    ...flat,
    ...(uv.offset ? { offset: uv.offset } : {}),
    ...(uv.repeat ? { tiling: uv.repeat } : {}),
    ...(uv.rotation !== undefined ? { rotation: uv.rotation } : {}),
    ...(uv.channel !== undefined ? { channel: uv.channel } : {}),
  };
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
