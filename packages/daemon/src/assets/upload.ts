import { extname } from 'node:path';
import { AppError } from '@vibebyte/vibe3d-protocol';
import { type ImageInfo, readImageInfo } from './image-meta';

export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
export const MAX_MODEL_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
export const MAX_HDRI_BYTES = 128 * 1024 * 1024;
export const MAX_IMAGE_DIM = 8192;

const GLB_MAGIC = 0x46546c67;

const EXT_MIME = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ktx2': 'image/ktx2',
  '.hdr': 'image/vnd.radiance',
  '.exr': 'image/x-exr',
} as const;

export type UploadExt = keyof typeof EXT_MIME;
export type UploadKind = 'gltf' | 'image';

const ALLOWED_EXT = Object.keys(EXT_MIME);
const ALLOWED_MIME = [...new Set(Object.values(EXT_MIME)), 'application/octet-stream'];
const HDRI_EXT = new Set(['.hdr', '.exr']);

export interface UploadInput {
  filename: string;
  mime?: string;
  bytes: Buffer;
  maxBytes?: number;
}

export interface UploadInfo {
  kind: UploadKind;
  ext: UploadExt;
  name: string;
  mime: (typeof EXT_MIME)[UploadExt];
  image?: ImageInfo;
}

export function limitForExt(ext: UploadExt): number {
  if (ext === '.glb' || ext === '.gltf') return MAX_UPLOAD_BYTES;
  if (HDRI_EXT.has(ext)) return MAX_HDRI_BYTES;
  return MAX_IMAGE_BYTES;
}

export function classifyUpload({ filename, mime = '', bytes, maxBytes }: UploadInput): UploadInfo {
  const ext = extname(filename).toLowerCase();
  if (!isAllowedExt(ext)) {
    throw new AppError('E_ASSET_TYPE', `不支持的扩展名「${ext || '无'}」`, {
      filename,
      ext,
      allowed: ALLOWED_EXT,
    });
  }
  const limit = maxBytes ?? limitForExt(ext);
  if (bytes.length > limit) {
    throw new AppError('E_PAYLOAD_TOO_LARGE', `资产超过 ${Math.round(limit / 1024 / 1024)} MB`, {
      bytes: bytes.length,
      limit,
    });
  }
  if (bytes.length === 0) throw new AppError('E_ASSET_FORMAT', '文件为空');

  const type = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  const canonical = EXT_MIME[ext];
  if (type && type !== canonical && type !== 'application/octet-stream') {
    throw new AppError('E_ASSET_TYPE', `Content-Type「${type}」与扩展名「${ext}」不匹配`, {
      filename,
      mime: type,
      allowed: ALLOWED_MIME,
    });
  }

  sniff(ext, bytes, filename);
  const kind: UploadKind = HDRI_EXT.has(ext) || canonical.startsWith('image/') ? 'image' : 'gltf';
  if (kind === 'gltf') return { kind, ext, name: filename, mime: canonical };

  const image = readImageInfo(bytes, ext);
  const overflow = image.width > MAX_IMAGE_DIM || image.height > MAX_IMAGE_DIM;
  if (overflow) {
    throw new AppError('E_UNSUPPORTED', `图片尺寸超过 ${MAX_IMAGE_DIM}px 上限`, {
      width: image.width,
      height: image.height,
      limit: MAX_IMAGE_DIM,
    });
  }
  return { kind, ext, name: filename, mime: canonical, image };
}

function isAllowedExt(ext: string): ext is UploadExt {
  return ext in EXT_MIME;
}

function startsWith(bytes: Buffer, prefix: readonly number[]): boolean {
  return bytes.length >= prefix.length && prefix.every((b, i) => bytes[i] === b);
}

function sniff(ext: UploadExt, bytes: Buffer, name: string): void {
  const bad = (hint: string) =>
    new AppError('E_ASSET_FORMAT', `${name} 扩展名为 ${ext}，但${hint}`, { filename: name });
  switch (ext) {
    case '.glb':
      if (bytes.length < 12 || bytes.readUInt32LE(0) !== GLB_MAGIC) throw bad('缺少 GLB 魔数');
      return;
    case '.gltf': {
      const text = bytes
        .toString('utf8')
        .replace(/^\uFEFF/, '')
        .trimStart();
      if (!text.startsWith('{')) throw bad('内容不是 JSON');
      return;
    }
    case '.png':
      if (!startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        throw bad('缺少 PNG 签名');
      }
      return;
    case '.jpg':
    case '.jpeg':
      if (!startsWith(bytes, [0xff, 0xd8, 0xff])) throw bad('缺少 JPEG 标记');
      return;
    case '.webp':
      if (bytes.length < 16 || bytes.toString('ascii', 0, 4) !== 'RIFF') throw bad('缺少 RIFF 头');
      if (bytes.toString('ascii', 8, 12) !== 'WEBP') throw bad('缺少 WEBP 标识');
      return;
    case '.ktx2':
      if (!startsWith(bytes, [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30])) {
        throw bad('缺少 KTX2 标识');
      }
      return;
    case '.hdr': {
      const head = bytes.toString('ascii', 0, 10);
      if (!head.startsWith('#?RADIANCE') && !head.startsWith('#?RGBE')) throw bad('缺少 Radiance 头');
      return;
    }
    case '.exr':
      if (!startsWith(bytes, [0x76, 0x2f, 0x31, 0x01])) throw bad('缺少 OpenEXR 魔数');
      return;
  }
}
