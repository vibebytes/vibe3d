import { AppError } from '@vibebyte/vibe3d-protocol';

export interface ImageInfo {
  width: number;
  height: number;
  hdri: boolean;
}

const truncated = (ext: string) => new AppError('E_ASSET_FORMAT', `${ext} 内容截断，无法读取尺寸`, { ext });

export function readImageInfo(bytes: Buffer, ext: string, opts: { hdri?: boolean } = {}): ImageInfo {
  const equirect = opts.hdri === true;
  switch (ext) {
    case '.png':
      return { ...pngSize(bytes), hdri: equirect };
    case '.jpg':
    case '.jpeg':
      return { ...jpegSize(bytes), hdri: equirect };
    case '.webp':
      return { ...webpSize(bytes), hdri: equirect };
    case '.ktx2':
      if (bytes.length < 28) throw truncated(ext);
      return { width: bytes.readUInt32LE(20), height: bytes.readUInt32LE(24), hdri: equirect };
    case '.hdr':
    case '.exr':
      return { width: 0, height: 0, hdri: true };
    default:
      throw new AppError('E_ASSET_TYPE', `不支持的图片扩展名「${ext}」`);
  }
}

function pngSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 24) throw truncated('.png');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width === 0 || height === 0) throw truncated('.png');
  return { width, height };
}

function jpegSize(bytes: Buffer): { width: number; height: number } {
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1]!;
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    const length = bytes.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > bytes.length) throw truncated('.jpg');
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) {
      if (i + 9 > bytes.length) throw truncated('.jpg');
      return { width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5) };
    }
    i += 2 + length;
  }
  throw new AppError('E_ASSET_FORMAT', 'JPEG 缺少 SOF 段，无法读取尺寸');
}

function webpSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 30) throw truncated('.webp');
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  }
  if (chunk === 'VP8 ') {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw new AppError('E_ASSET_FORMAT', `未知的 WebP 分块「${chunk}」`);
}
