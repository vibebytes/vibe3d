import type { MapTransform, Material } from '@vibebyte/vibe3d-protocol';
import { type ParsedArgs, bool, jsonArg, num, str } from './args';
import { parseColor } from './fx-args';

type Flags = ParsedArgs['flags'];

const SCALARS: Array<[flag: string, key: keyof Material]> = [
  ['metalness', 'metalness'],
  ['roughness', 'roughness'],
  ['opacity', 'opacity'],
  ['emissive-intensity', 'emissiveIntensity'],
];

function pair(value: string | undefined, label: string, positive = false): [number, number] | undefined {
  if (!value) return undefined;
  const parts = value.split(',').map((item) => Number(item.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`--${label} 需要 a,b，收到：${value}`);
  }
  if (positive && parts.some((n) => (n ?? 0) <= 0)) {
    throw new Error(`--${label} 需要正数：${value}`);
  }
  return parts as [number, number];
}

export function materialPatchFromFlags(flags: Flags): Partial<Material> {
  const patch: Partial<Material> = { ...(jsonArg(str(flags, 'patch')) as Partial<Material> | undefined) };
  const baseColor = parseColor(str(flags, 'base-color'));
  if (baseColor) patch.baseColor = baseColor;
  const emissive = parseColor(str(flags, 'emissive'));
  if (emissive) patch.emissive = [emissive[0], emissive[1], emissive[2]];
  for (const [flag, key] of SCALARS) {
    const value = num(flags, flag);
    if (value !== undefined) (patch as Record<string, unknown>)[key] = value;
  }
  if (flags['double-sided'] !== undefined) patch.doubleSided = bool(flags, 'double-sided');
  if (Object.keys(patch).length === 0) throw new Error('material patch 至少给一个材质字段');
  return patch;
}

export function mapFromFlags(flags: Flags): Partial<MapTransform> {
  const sha = str(flags, 'sha');
  const tiling = pair(str(flags, 'tiling'), 'tiling', true);
  const offset = pair(str(flags, 'offset'), 'offset');
  const rotation = num(flags, 'rotation');
  if (!sha && !tiling && !offset && rotation === undefined) {
    throw new Error('material map 至少给 --sha / --tiling / --offset / --rotation 之一');
  }
  const out: Partial<MapTransform> = {};
  if (sha) out.sha = sha as MapTransform['sha'];
  if (tiling) out.tiling = tiling;
  if (offset) out.offset = offset;
  if (rotation !== undefined) out.rotation = rotation;
  return out;
}
