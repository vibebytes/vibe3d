import type { AssetMeta, SceneDoc } from '@vibebyte/vibe3d-protocol';
import { formatBytes, isGltfFile } from './import-model';

export { formatBytes };

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.hdr', '.exr'];

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/avif,.hdr,.exr';

export function isModelFile(name: string): boolean {
  return isGltfFile(name);
}

export function isImageFile(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export interface NamedFile {
  name: string;
}

export interface FileSplit<T extends NamedFile> {
  models: T[];
  images: T[];
  rejected: { name: string; reason: string }[];
}

export function splitFiles<T extends NamedFile>(files: readonly T[]): FileSplit<T> {
  const out: FileSplit<T> = { models: [], images: [], rejected: [] };
  for (const file of files) {
    if (isModelFile(file.name)) out.models.push(file);
    else if (isImageFile(file.name)) out.images.push(file);
    else out.rejected.push({ name: file.name, reason: '只支持 .glb / .gltf / 图片' });
  }
  return out;
}

function imageMetas(doc: SceneDoc): AssetMeta[] {
  return Object.values(doc.assets).filter(
    (asset): asset is AssetMeta => asset.kind === 'image' && !!asset.image,
  );
}

const byName = (a: AssetMeta, b: AssetMeta): number => a.name.localeCompare(b.name);

export function imageAssets(doc: SceneDoc): AssetMeta[] {
  return imageMetas(doc)
    .filter((asset) => !asset.image?.hdri)
    .sort(byName);
}

export function hdriAssets(doc: SceneDoc): AssetMeta[] {
  return imageMetas(doc)
    .filter((asset) => asset.image?.hdri)
    .sort(byName);
}
