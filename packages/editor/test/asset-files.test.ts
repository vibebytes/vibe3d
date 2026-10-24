import { type AssetMeta, type SceneDoc, emptyDoc } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  hdriAssets,
  imageAssets,
  isImageFile,
  isModelFile,
  splitFiles,
} from '../src/lib/asset-files';

const file = (name: string) => ({ name });

function withAssets(assets: AssetMeta[]): SceneDoc {
  const doc = emptyDoc('assets');
  doc.assets = Object.fromEntries(assets.map((a) => [a.sha, a]));
  return doc;
}

const sha = (n: number) => String(n).repeat(64).slice(0, 64);

const image = (name: string, hdri: boolean): AssetMeta => ({
  sha: sha(hdri ? 2 : 1),
  bytes: 1024,
  name,
  mime: hdri ? 'image/vnd.radiance' : 'image/png',
  kind: 'image',
  image: { width: 64, height: 32, hdri },
});

describe('asset-files', () => {
  it('识别模型与图片扩展名（大小写不敏感）', () => {
    expect(isModelFile('chair.GLB')).toBe(true);
    expect(isModelFile('scene.gltf')).toBe(true);
    expect(isModelFile('photo.png')).toBe(false);
    expect(isImageFile('tex.JPG')).toBe(true);
    expect(isImageFile('sky.hdr')).toBe(true);
    expect(isImageFile('sky.exr')).toBe(true);
    expect(isImageFile('chair.glb')).toBe(false);
  });

  it('splitFiles 按类别分流并给出拒收原因', () => {
    const out = splitFiles([file('a.glb'), file('b.GLTF'), file('c.png'), file('d.HDR'), file('notes.txt')]);
    expect(out.models.map((f) => f.name)).toEqual(['a.glb', 'b.GLTF']);
    expect(out.images.map((f) => f.name)).toEqual(['c.png', 'd.HDR']);
    expect(out.rejected).toEqual([{ name: 'notes.txt', reason: '只支持 .glb / .gltf / 图片' }]);
  });

  it('imageAssets 仅返回非 HDRI 图片并按名称排序', () => {
    const doc = withAssets([image('wood.png', false), image('sky.hdr', true)]);
    doc.assets[sha(3)] = {
      sha: sha(3),
      bytes: 2048,
      name: 'brick.jpg',
      mime: 'image/jpeg',
      kind: 'image',
      image: { width: 8, height: 8, hdri: false },
    };
    expect(imageAssets(doc).map((a) => a.name)).toEqual(['brick.jpg', 'wood.png']);
    expect(hdriAssets(doc).map((a) => a.name)).toEqual(['sky.hdr']);
  });

  it('formatBytes 给出紧凑单位', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
