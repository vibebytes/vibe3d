import { create } from 'zustand';

export const SHADING_MODES = ['flat', 'wireframe', 'normals', 'material', 'rendered'] as const;
export const OVERLAY_KINDS = [
  'grid',
  'axes',
  'bbox',
  'ground',
  'centerline',
  'scale',
  'normal',
  'dims',
] as const;
export const QUALITY_LEVELS = ['draft', 'standard', 'high'] as const;
export const IMAGE_FORMATS = ['png', 'jpeg'] as const;

export type ShadingMode = (typeof SHADING_MODES)[number];
export type OverlayKind = (typeof OVERLAY_KINDS)[number];
export type QualityLevel = (typeof QUALITY_LEVELS)[number];
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

export interface RenderSettings {
  width: number;
  height: number;
  format: ImageFormat;
  settleMs: number;
  transparent: boolean;
  shading: ShadingMode;
  overlay: OverlayKind[];
  quality: QualityLevel;
}

export const defaultRenderSettings: RenderSettings = {
  width: 1280,
  height: 720,
  format: 'png',
  settleMs: 150,
  transparent: false,
  shading: 'flat',
  overlay: [],
  quality: 'standard',
};

const SIZE_MIN = 64;
const SIZE_MAX = 4096;
const SETTLE_MAX = 10_000;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? Math.round(value) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseOverlay(value: unknown): OverlayKind[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<OverlayKind>();
  for (const raw of value) {
    if (typeof raw === 'string' && (OVERLAY_KINDS as readonly string[]).includes(raw)) {
      seen.add(raw as OverlayKind);
      if (seen.size >= 8) break;
    }
  }
  return [...seen];
}

export function parseRenderSettings(input: unknown): RenderSettings {
  if (typeof input !== 'object' || input === null) return { ...defaultRenderSettings, overlay: [] };
  const raw = input as Record<string, unknown>;
  return {
    width: clampInt(raw.width, SIZE_MIN, SIZE_MAX, defaultRenderSettings.width),
    height: clampInt(raw.height, SIZE_MIN, SIZE_MAX, defaultRenderSettings.height),
    format: oneOf(raw.format, IMAGE_FORMATS, defaultRenderSettings.format),
    settleMs: clampInt(raw.settleMs, 0, SETTLE_MAX, defaultRenderSettings.settleMs),
    transparent: raw.transparent === true,
    shading: oneOf(raw.shading, SHADING_MODES, defaultRenderSettings.shading),
    overlay: parseOverlay(raw.overlay),
    quality: oneOf(raw.quality, QUALITY_LEVELS, defaultRenderSettings.quality),
  };
}

export function patchRenderSettings(current: RenderSettings, patch: Partial<RenderSettings>): RenderSettings {
  return parseRenderSettings({ ...current, ...patch });
}

export function toSnapshotParams(s: RenderSettings): Record<string, unknown> {
  return {
    width: s.width,
    height: s.height,
    format: s.format,
    settleMs: s.settleMs,
    shading: s.shading,
    quality: s.quality,
    ...(s.transparent ? { transparent: true } : {}),
    ...(s.overlay.length ? { overlay: s.overlay } : {}),
  };
}

interface RenderSettingsStore {
  settings: RenderSettings;
  set(patch: Partial<RenderSettings>): void;
  reset(): void;
}

const KEY = 'vibe3d.renderSettings';

function load(): RenderSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? parseRenderSettings(JSON.parse(raw)) : { ...defaultRenderSettings, overlay: [] };
  } catch {
    return { ...defaultRenderSettings, overlay: [] };
  }
}

function save(s: RenderSettings) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export const useRenderSettings = create<RenderSettingsStore>((set, get) => ({
  settings: load(),
  set(patch) {
    const next = patchRenderSettings(get().settings, patch);
    save(next);
    set({ settings: next });
  },
  reset() {
    const next = { ...defaultRenderSettings, overlay: [] };
    save(next);
    set({ settings: next });
  },
}));
