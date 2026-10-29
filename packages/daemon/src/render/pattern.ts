import { type PngImage, encodePng } from './png';

export interface PatternSpec {
  fill: [number, number, number];
  line: [number, number, number];
  size?: number;
  gap?: number;
}

const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);

export function patternPng(spec: PatternSpec): Buffer {
  const size = spec.size ?? 64;
  const gap = spec.gap ?? 16;
  const data = Buffer.alloc(size * size * 4);
  const fill = spec.fill.map(byte);
  const line = spec.line.map(byte);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const seam = x % gap === 0 || y % gap === 0;
      const color = seam ? line : fill;
      const o = (y * size + x) * 4;
      data[o] = color[0]!;
      data[o + 1] = color[1]!;
      data[o + 2] = color[2]!;
      data[o + 3] = 255;
    }
  }
  const image: PngImage = { width: size, height: size, channels: 4, data };
  return encodePng(image);
}
