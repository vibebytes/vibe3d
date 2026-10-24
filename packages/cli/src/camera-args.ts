import type { CameraState } from '@vibebyte/vibe3d-protocol';
import { type ParsedArgs, num, str, vec } from './args';

type Flags = ParsedArgs['flags'];

export const CAMERA_PRESETS = ['miniature_45'] as const;
export const FRAME_MODES = ['fit', 'close', 'wide'] as const;

export interface CameraFlags {
  name?: string;
  preset?: (typeof CAMERA_PRESETS)[number];
  frame?: (typeof FRAME_MODES)[number];
  camera?: Partial<CameraState>;
}

function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  label: string,
): T | undefined {
  if (value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${label}只接受 ${allowed.join(' / ')}，收到：${value}`);
  }
  return value as T;
}

export function cameraFromFlags(flags: Flags): CameraFlags {
  const out: CameraFlags = {};
  const name = str(flags, 'name');
  if (name) out.name = name;
  const preset = oneOf(str(flags, 'preset'), CAMERA_PRESETS, '预设');
  if (preset) out.preset = preset;
  const frame = oneOf(str(flags, 'frame'), FRAME_MODES, '取景模式');
  if (frame) out.frame = frame;
  const camera: Partial<CameraState> = {};
  const p = vec(flags, 'p');
  if (p) camera.p = p;
  const target = vec(flags, 'target');
  if (target) camera.target = target;
  const fov = num(flags, 'fov');
  if (fov !== undefined) camera.fov = fov;
  if (Object.keys(camera).length > 0) out.camera = camera;
  return out;
}

export function saveNameFrom(value: string | undefined): string {
  if (!value) throw new Error('camera save 需要 --name <名字>');
  return value;
}
