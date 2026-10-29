export const FRAME_ASPECT = 16 / 9;

export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function letterbox(width: number, height: number, aspect = FRAME_ASPECT): FrameRect {
  if (width <= 0 || height <= 0) return { x: 0, y: 0, w: Math.max(0, width), h: Math.max(0, height) };
  const view = width / height;
  if (view > aspect) {
    const w = height * aspect;
    return { x: (width - w) / 2, y: 0, w, h: height };
  }
  const h = width / aspect;
  return { x: 0, y: (height - h) / 2, w: width, h };
}
