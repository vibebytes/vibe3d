import { AppError } from '@vibebyte/vibe3d-protocol';
import { type PngImage, decodePng } from './png';

export type Rgb = [number, number, number];

export const hexOf = (rgb: Rgb): string =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

export function decodeShot(base64: string): PngImage {
  try {
    return decodePng(base64);
  } catch (err) {
    throw new AppError(
      'E_INVALID_PARAMS',
      `截图不是可解码的 PNG，无法取色：${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function pixelAt(img: PngImage, x: number, y: number): { rgb: Rgb; alpha: number } {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) {
    throw new AppError('E_INVALID_PARAMS', `取样点超出画面：(${x}, ${y}) ∉ ${img.width}×${img.height}`);
  }
  const at = (y * img.width + x) * img.channels;
  return {
    rgb: [img.data[at]!, img.data[at + 1]!, img.data[at + 2]!],
    alpha: img.channels === 4 ? img.data[at + 3]! : 255,
  };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function clampRect(img: PngImage, rect: Rect): Rect {
  const rx = Math.round(rect.x);
  const ry = Math.round(rect.y);
  const x = Math.max(0, rx);
  const y = Math.max(0, ry);
  const right = Math.min(img.width, rx + Math.round(rect.w));
  const bottom = Math.min(img.height, ry + Math.round(rect.h));
  const w = right - x;
  const h = bottom - y;
  if (w <= 0 || h <= 0) {
    throw new AppError(
      'E_INVALID_PARAMS',
      `取样区域完全在画面外：{x:${rect.x}, y:${rect.y}, w:${rect.w}, h:${rect.h}} vs ${img.width}×${img.height}`,
    );
  }
  return { x, y, w, h };
}

export function cropImage(img: PngImage, rect: Rect): PngImage {
  const box = clampRect(img, rect);
  const bpp = img.channels;
  const data = Buffer.alloc(box.w * box.h * bpp);
  for (let y = 0; y < box.h; y++) {
    const src = ((box.y + y) * img.width + box.x) * bpp;
    img.data.copy(data, y * box.w * bpp, src, src + box.w * bpp);
  }
  return { width: box.w, height: box.h, channels: img.channels, data };
}

export function regionStats(
  img: PngImage,
  rect: Rect,
  topN = 5,
): {
  x: number;
  y: number;
  w: number;
  h: number;
  pixels: number;
  topColors: { hex: string; count: number; share: number }[];
  mean: Rgb;
} {
  const box = clampRect(img, rect);
  const counts = new Map<string, number>();
  const sum: Rgb = [0, 0, 0];
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const { rgb } = pixelAt(img, x, y);
      sum[0] += rgb[0];
      sum[1] += rgb[1];
      sum[2] += rgb[2];
      const key = hexOf(rgb);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const pixels = box.w * box.h;
  const topColors = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([hex, count]) => ({ hex, count, share: Number((count / pixels).toFixed(6)) }));
  return {
    ...box,
    pixels,
    topColors,
    mean: [sum[0] / pixels, sum[1] / pixels, sum[2] / pixels],
  };
}
