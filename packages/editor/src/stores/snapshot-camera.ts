import type { CameraState } from '@vibebyte/vibe3d-protocol';

function triple(value: unknown): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const [x, y, z] = value;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return undefined;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return undefined;
  return [x, y, z];
}

export function parseSnapshotCamera(input: unknown): CameraState | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const raw = input as Record<string, unknown>;
  const p = triple(raw.p);
  const target = triple(raw.target);
  const fov = typeof raw.fov === 'number' && Number.isFinite(raw.fov) ? raw.fov : undefined;
  const zoom = typeof raw.zoom === 'number' && Number.isFinite(raw.zoom) && raw.zoom > 0 ? raw.zoom : 1;
  const mode = raw.mode === 'ortho' ? 'ortho' : 'persp';
  if (!p || !target || fov === undefined) return undefined;
  return { mode, p, target, fov: Math.min(179, Math.max(1, fov)), zoom };
}
