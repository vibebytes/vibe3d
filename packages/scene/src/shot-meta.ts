export type FogMode = 'doc' | 'off' | 'auto';

export interface FogReport {
  enabled: boolean;
  color: number;
  near: number;
  far: number;
  mode: FogMode;
  reason?: 'shading' | 'option';
}

export interface ShotCamera {
  position: [number, number, number];
  target: [number, number, number];
}

export interface ShotMeta {
  fog: FogReport;
  distanceToTarget: number;
  camera: ShotCamera;
}

export interface ShotMetaInput {
  fog: { color: number; near: number; far: number } | null;
  fallbackColor: number;
  shading?: string | null;
  mode?: FogMode;
  camera: ShotCamera;
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

export function shotMetaOf(input: ShotMetaInput): ShotMeta {
  const mode = input.mode ?? 'doc';
  const off = mode === 'off';
  const shadeOff =
    typeof input.shading === 'string' && input.shading.length > 0 && input.shading !== 'rendered';
  const enabled = Boolean(input.fog) && !off && !shadeOff;
  const fog: FogReport = {
    enabled,
    color: input.fog?.color ?? input.fallbackColor,
    near: input.fog?.near ?? 0,
    far: input.fog?.far ?? 0,
    mode,
  };
  if (!enabled) {
    const reason = off ? 'option' : shadeOff ? 'shading' : undefined;
    if (reason) fog.reason = reason;
  }
  const [px, py, pz] = input.camera.position;
  const [tx, ty, tz] = input.camera.target;
  return {
    fog,
    distanceToTarget: round3(Math.hypot(px - tx, py - ty, pz - tz)),
    camera: input.camera,
  };
}

export function shotWarning(meta: ShotMeta | null | undefined): string | null {
  if (!meta?.fog?.enabled) return null;
  if (meta.distanceToTarget >= meta.fog.far) return '主体已在雾远端之外，画面会塌成雾色';
  if (meta.distanceToTarget <= meta.fog.near) return '主体在雾近端内，边缘会被裁切';
  return null;
}

export function autoFogRange(distance: number, radius: number, strength = 1): { near: number; far: number } {
  const d = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  const r = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  const near = Math.max(0.05, round3(d - r * 0.5 * strength));
  const far = Math.max(round3(near + 0.5), round3(d + r * 3 * strength));
  return { near, far };
}

export function viewportFogPlan(
  doc: { color: number; near: number; far: number } | null | undefined,
  distance: number,
  radius: number,
): { color: number; near: number; far: number; source: 'doc' | 'auto' } | null {
  if (!doc) return null;
  const d = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  const r = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  const near = Math.max(0.05, round3(doc.near));
  const far = Math.max(round3(doc.far), round3(d + r * 3), round3(near + 0.5));
  return { color: doc.color, near, far, source: far > doc.far ? 'auto' : 'doc' };
}

export function autoClipRange(distance: number, radius: number): { near: number; far: number } {
  const d = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  const r = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  const near = Math.max(0.01, round3(d - r * 3));
  const far = Math.max(round3(near + 1), round3(d + r * 6));
  return { near, far };
}

function isVec3(value: unknown): value is [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) return false;
  return value.every((n) => typeof n === 'number' && Number.isFinite(n));
}

export function parseShotMeta(value: unknown): ShotMeta | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const fog = raw.fog as Record<string, unknown> | undefined;
  const camera = raw.camera as Record<string, unknown> | undefined;
  if (!fog || typeof fog !== 'object') return null;
  if (typeof fog.enabled !== 'boolean') return null;
  if (typeof fog.color !== 'number' || !Number.isFinite(fog.color)) return null;
  if (typeof fog.near !== 'number' || !Number.isFinite(fog.near)) return null;
  if (typeof fog.far !== 'number' || !Number.isFinite(fog.far)) return null;
  if (fog.mode !== 'doc' && fog.mode !== 'off' && fog.mode !== 'auto') return null;
  const distance = raw.distanceToTarget;
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0) return null;
  if (!camera || !isVec3(camera.position) || !isVec3(camera.target)) return null;
  const report: FogReport = {
    enabled: fog.enabled,
    color: fog.color,
    near: fog.near,
    far: fog.far,
    mode: fog.mode,
  };
  if (fog.reason === 'shading' || fog.reason === 'option') report.reason = fog.reason;
  return {
    fog: report,
    distanceToTarget: distance,
    camera: { position: camera.position, target: camera.target },
  };
}
