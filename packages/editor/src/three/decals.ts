import type { DecalSpec } from '@vibebyte/vibe3d-protocol';
import * as THREE from 'three';

export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D | null;
}

export type CanvasFactory = (width: number, height: number) => CanvasLike;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function decalCanvasSize(
  width: number,
  height: number,
  budget = 1024,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 8, height: 8 };
  const scale = budget / Math.max(width, height);
  return {
    width: clamp(Math.round(width * scale), 8, budget),
    height: clamp(Math.round(height * scale), 8, budget),
  };
}

export function rgbaCss(color: readonly number[] | undefined, fallback = 'rgba(0,0,0,0)'): string {
  if (!color || color.length < 3) return fallback;
  const [r = 0, g = 0, b = 0, a = 1] = color;
  const to = (v: number): number => Math.round(clamp(v, 0, 1) * 255);
  return `rgba(${to(r)},${to(g)},${to(b)},${clamp(a, 0, 1).toFixed(3)})`;
}

export function decalFont(decal: DecalSpec, canvasWidth: number, canvasHeight: number): string {
  const size = decal.fontSize ?? Math.round(Math.min(canvasHeight * 0.5, canvasWidth * 0.36));
  const weight = decal.bold ? '700' : '400';
  return `${weight} ${size}px "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif`;
}

const ANCHOR: Record<'left' | 'center' | 'right', { x: number; textAlign: CanvasTextAlign }> = {
  left: { x: 0.04, textAlign: 'left' },
  center: { x: 0.5, textAlign: 'center' },
  right: { x: 0.96, textAlign: 'right' },
};

export function paintDecal(canvas: CanvasLike, decal: DecalSpec): void {
  if (!decal.text) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (decal.background) {
    ctx.fillStyle = rgbaCss(decal.background);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const anchor = ANCHOR[decal.align ?? 'center'];
  ctx.font = decalFont(decal, canvas.width, canvas.height);
  ctx.fillStyle = rgbaCss(decal.color, 'rgba(255,255,255,1)');
  ctx.textAlign = anchor.textAlign;
  ctx.textBaseline = 'middle';
  ctx.fillText(decal.text, canvas.width * anchor.x, canvas.height * 0.52, canvas.width * 0.92);
}

export function createDecalTexture(decal: DecalSpec, size: { width: number; height: number }): THREE.Texture {
  if (decal.imageSha) {
    const texture = new THREE.TextureLoader().load(`/assets/${decal.imageSha}`);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const px = decalCanvasSize(size.width, size.height);
  const canvas = document.createElement('canvas');
  canvas.width = px.width;
  canvas.height = px.height;
  paintDecal(canvas, decal);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
