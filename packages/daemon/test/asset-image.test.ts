import { describe, expect, it } from 'vitest';
import { readImageInfo } from '../src/assets/image-meta';
import { MAX_HDRI_BYTES, MAX_IMAGE_BYTES, classifyUpload, limitForExt } from '../src/assets/upload';

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
};

function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

function jpeg(width: number, height: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10]);
  const sof = Buffer.alloc(13);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(11, 2);
  sof.writeUInt8(8, 4);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, Buffer.alloc(14), sof]);
}

function webpVp8x(width: number, height: number): Buffer {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(22, 4);
  b.write('WEBP', 8, 'ascii');
  b.write('VP8X', 12, 'ascii');
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return b;
}

function ktx2(width: number, height: number): Buffer {
  const b = Buffer.alloc(28);
  Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32LE(width, 20);
  b.writeUInt32LE(height, 24);
  return b;
}

describe('asset-image: 白名单与魔数', () => {
  it('PNG / JPEG / WebP / KTX2 判定为 image 并读出宽高', () => {
    expect(classifyUpload({ filename: 'wall.png', bytes: png(640, 480) })).toMatchObject({
      kind: 'image',
      ext: '.png',
      image: { width: 640, height: 480, hdri: false },
    });
    expect(classifyUpload({ filename: 'wall.jpg', bytes: jpeg(800, 600) }).image).toEqual({
      width: 800,
      height: 600,
      hdri: false,
    });
    expect(classifyUpload({ filename: 'wall.webp', bytes: webpVp8x(1024, 768) }).image).toEqual({
      width: 1024,
      height: 768,
      hdri: false,
    });
    expect(classifyUpload({ filename: 'wall.ktx2', bytes: ktx2(512, 256) }).image).toEqual({
      width: 512,
      height: 256,
      hdri: false,
    });
  });

  it('HDR / EXR 标记 hdri 且不解析尺寸', () => {
    const hdr = Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n', 'ascii');
    const exr = Buffer.from([0x76, 0x2f, 0x31, 0x01, 0, 0, 0, 0]);
    expect(classifyUpload({ filename: 'sky.hdr', bytes: hdr })).toMatchObject({
      kind: 'image',
      image: { width: 0, height: 0, hdri: true },
    });
    expect(classifyUpload({ filename: 'sky.exr', bytes: exr }).image?.hdri).toBe(true);
  });

  it('扩展名与内容不符、内容截断都报 E_ASSET_FORMAT', () => {
    expect(codeOf(() => classifyUpload({ filename: 'fake.png', bytes: jpeg(10, 10) }))).toBe(
      'E_ASSET_FORMAT',
    );
    expect(codeOf(() => classifyUpload({ filename: 'fake.hdr', bytes: Buffer.from('nope') }))).toBe(
      'E_ASSET_FORMAT',
    );
    expect(codeOf(() => classifyUpload({ filename: 'short.png', bytes: png(1, 1).subarray(0, 16) }))).toBe(
      'E_ASSET_FORMAT',
    );
    expect(codeOf(() => readImageInfo(Buffer.alloc(8), '.ktx2'))).toBe('E_ASSET_FORMAT');
  });

  it('图片 8192² 与分档体积上限', () => {
    expect(classifyUpload({ filename: 'ok.png', bytes: png(8192, 8192) }).image?.width).toBe(8192);
    expect(codeOf(() => classifyUpload({ filename: 'big.png', bytes: png(8193, 100) }))).toBe(
      'E_UNSUPPORTED',
    );
    expect(
      codeOf(() =>
        classifyUpload({
          filename: 'big.png',
          bytes: Buffer.concat([png(1, 1), Buffer.alloc(MAX_IMAGE_BYTES)]),
        }),
      ),
    ).toBe('E_PAYLOAD_TOO_LARGE');

    const hdr = Buffer.concat([Buffer.from('#?RADIANCE\n', 'ascii'), Buffer.alloc(MAX_IMAGE_BYTES + 1)]);
    expect(classifyUpload({ filename: 'sky.hdr', bytes: hdr }).image?.hdri).toBe(true);
    expect(limitForExt('.exr')).toBe(MAX_HDRI_BYTES);
    expect(limitForExt('.png')).toBe(MAX_IMAGE_BYTES);
    expect(limitForExt('.glb')).toBe(64 * 1024 * 1024);
  });
});
