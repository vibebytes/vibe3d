import { str } from './args';

export const SHADING_MODES = ['flat', 'wireframe', 'normals', 'material', 'rendered'] as const;
export const OVERLAY_KINDS = [
  'grid',
  'axes',
  'bbox',
  'ground',
  'centerline',
  'scale',
  'normal',
] as const;

export type ShadingMode = (typeof SHADING_MODES)[number];
export type OverlayKind = (typeof OVERLAY_KINDS)[number];

export interface LookFlags {
  shading?: ShadingMode;
  overlay?: OverlayKind[];
}

export function parseLookFlags(flags: Record<string, string | boolean>): LookFlags {
  const out: LookFlags = {};
  const shading = str(flags, 'shading');
  if (shading !== undefined) {
    if (!SHADING_MODES.includes(shading as ShadingMode)) {
      throw new Error(`--shading 只支持 ${SHADING_MODES.join('|')}，收到：${shading}`);
    }
    out.shading = shading as ShadingMode;
  }
  const overlay = str(flags, 'overlay');
  if (overlay !== undefined) {
    const items = overlay
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const unknown = items.filter((item) => !OVERLAY_KINDS.includes(item as OverlayKind));
    if (unknown.length > 0) {
      throw new Error(`--overlay 只支持 ${OVERLAY_KINDS.join(',')}（逗号分隔），未知：${unknown.join(',')}`);
    }
    if (items.length > 0) out.overlay = [...new Set(items)] as OverlayKind[];
  }
  return out;
}
