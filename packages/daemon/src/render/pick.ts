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

const srgbToLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

function srgbToLab(rgb: Rgb): [number, number, number] {
  const r = srgbToLinear(rgb[0]);
  const g = srgbToLinear(rgb[1]);
  const b = srgbToLinear(rgb[2]);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE(a: Rgb, b: Rgb): number {
  const la = srgbToLab(a);
  const lb = srgbToLab(b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  const digits = m?.[1];
  if (!digits) {
    throw new AppError('E_INVALID_PARAMS', `颜色需为 #RRGGBB 形式：${hex}`);
  }
  const n = Number.parseInt(digits, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
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

export function blendReferenceImage(
  shot: PngImage,
  ref: PngImage,
  opts: { opacity?: number; mode?: 'blend' | 'diff' } = {},
): { image: PngImage; meanDiff: number } {
  const opacity = Math.min(1, Math.max(0, opts.opacity ?? 0.45));
  const mode = opts.mode ?? 'blend';
  const w = shot.width;
  const h = shot.height;
  const out = Buffer.alloc(w * h * 4);
  let diffSum = 0;

  for (let y = 0; y < h; y++) {
    const ry = Math.min(ref.height - 1, Math.floor((y * ref.height) / h));
    for (let x = 0; x < w; x++) {
      const rx = Math.min(ref.width - 1, Math.floor((x * ref.width) / w));
      const sIdx = (y * w + x) * shot.channels;
      const rIdx = (ry * ref.width + rx) * ref.channels;
      const sr = shot.data[sIdx]!;
      const sg = shot.data[sIdx + 1]!;
      const sb = shot.data[sIdx + 2]!;
      const rr = ref.data[rIdx]!;
      const rg = ref.data[rIdx + 1]!;
      const rb = ref.data[rIdx + 2]!;

      const dr = Math.abs(sr - rr);
      const dg = Math.abs(sg - rg);
      const db = Math.abs(sb - rb);
      diffSum += (dr + dg + db) / (3 * 255);

      const oIdx = (y * w + x) * 4;
      if (mode === 'diff') {
        out[oIdx] = Math.min(255, dr * 2);
        out[oIdx + 1] = Math.min(255, dg * 2);
        out[oIdx + 2] = Math.min(255, db * 2);
        out[oIdx + 3] = 255;
      } else {
        out[oIdx] = Math.round(sr * (1 - opacity) + rr * opacity);
        out[oIdx + 1] = Math.round(sg * (1 - opacity) + rg * opacity);
        out[oIdx + 2] = Math.round(sb * (1 - opacity) + rb * opacity);
        out[oIdx + 3] = 255;
      }
    }
  }

  return {
    image: { width: w, height: h, channels: 4, data: out },
    meanDiff: Math.round((diffSum / (w * h)) * 1e4) / 1e4,
  };
}
