import { extname } from 'node:path';
import { AppError } from '@vibebyte/vibe3d-protocol';

export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

const GLB_MAGIC = 0x46546c67;

const EXT_MIME = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
} as const;

export type UploadExt = keyof typeof EXT_MIME;

const ALLOWED_EXT = Object.keys(EXT_MIME);
const ALLOWED_MIME = [...Object.values(EXT_MIME), 'application/octet-stream'];

export interface UploadInput {
  filename: string;
  mime?: string;
  bytes: Buffer;
}

export interface UploadInfo {
  kind: 'gltf';
  ext: UploadExt;
  name: string;
  mime: (typeof EXT_MIME)[UploadExt];
}

export function classifyUpload({ filename, mime = '', bytes }: UploadInput): UploadInfo {
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new AppError('E_PAYLOAD_TOO_LARGE', `资产超过 64 MB（${bytes.length} 字节）`, {
      bytes: bytes.length,
      limit: MAX_UPLOAD_BYTES,
    });
  }
  if (bytes.length === 0) throw new AppError('E_ASSET_FORMAT', '文件为空');

  const ext = extname(filename).toLowerCase();
  if (!isAllowedExt(ext)) {
    throw new AppError('E_ASSET_TYPE', `不支持的扩展名「${ext || '无'}」，仅接受 .glb / .gltf`, {
      filename,
      ext,
      allowed: ALLOWED_EXT,
    });
  }

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
  return { kind: 'gltf', ext, name: filename, mime: canonical };
}

function isAllowedExt(ext: string): ext is UploadExt {
  return ext in EXT_MIME;
}

function sniff(ext: UploadExt, bytes: Buffer, name: string): void {
  if (ext === '.glb') {
    if (bytes.length < 12 || bytes.readUInt32LE(0) !== GLB_MAGIC) {
      throw new AppError('E_ASSET_FORMAT', `${name} 扩展名为 .glb，但缺少 GLB 魔数`, { filename: name });
    }
    return;
  }
  const text = bytes
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart();
  if (!text.startsWith('{')) {
    throw new AppError('E_ASSET_FORMAT', `${name} 扩展名为 .gltf，但内容不是 JSON`, { filename: name });
  }
}
