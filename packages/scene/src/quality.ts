import { AppError } from '@vibebyte/vibe3d-protocol';

export const QUALITY_LEVELS = ['draft', 'standard', 'high'] as const;

export type QualityLevel = (typeof QUALITY_LEVELS)[number];

export interface QualityPreset {
  level: QualityLevel;
  pixelRatio: number;
  samples: number;
  shadowMapSize: number;
  supersample: boolean;
}

const PRESETS: Record<QualityLevel, QualityPreset> = {
  draft: { level: 'draft', pixelRatio: 1, samples: 0, shadowMapSize: 512, supersample: false },
  standard: { level: 'standard', pixelRatio: 1, samples: 4, shadowMapSize: 1024, supersample: false },
  high: { level: 'high', pixelRatio: 2, samples: 4, shadowMapSize: 2048, supersample: true },
};

export function resolveQuality(level?: string | null): QualityPreset {
  if (level === undefined || level === null) return { ...PRESETS.standard };
  const preset = PRESETS[level as QualityLevel];
  if (!preset) {
    throw new AppError('E_INVALID_PARAMS', `未知画质档 ${level}`, {
      allowed: [...QUALITY_LEVELS],
    });
  }
  return { ...preset };
}
