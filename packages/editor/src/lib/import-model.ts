import type { GltfReport, Transform } from '@vibebyte/vibe3d-protocol';

export const GLTF_EXTENSIONS = ['.glb', '.gltf'] as const;
export const GLTF_ACCEPT = '.glb,.gltf,model/gltf-binary,model/gltf+json';
export const TARGET_HEIGHT = 1.5;

type Bounds = GltfReport['size'];

export function isGltfFile(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return GLTF_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function importName(fileName: string): string {
  const stem = fileName
    .trim()
    .replace(/\.(glb|gltf)$/i, '')
    .trim();
  return stem || 'model';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface FitOptions {
  targetHeight?: number;
  offsetX?: number;
}

export function fitTransform(
  size: Bounds,
  { targetHeight = TARGET_HEIGHT, offsetX = 0 }: FitOptions = {},
): Transform {
  const [min, max] = [size.min, size.max];
  const height = max[1] - min[1];
  const k = height > 0 ? targetHeight / height : 1;
  const x = (-(min[0] + max[0]) / 2) * k + offsetX;
  const y = -min[1] * k;
  const z = (-(min[2] + max[2]) / 2) * k;
  return {
    p: [x || 0, y || 0, z || 0],
    r: [0, 0, 0],
    s: [k, k, k],
  };
}

export function rowOffset(index: number, total: number, spread = 2.2): number {
  if (total <= 1) return 0;
  return (index - (total - 1) / 2) * spread;
}
