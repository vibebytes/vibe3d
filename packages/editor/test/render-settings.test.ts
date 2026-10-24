import { describe, expect, it } from 'vitest';
import {
  defaultRenderSettings,
  parseRenderSettings,
  patchRenderSettings,
  toSnapshotParams,
  useRenderSettings,
} from '../src/stores/render-settings';

describe('parseRenderSettings', () => {
  it('falls back to defaults on garbage input', () => {
    expect(parseRenderSettings(undefined)).toEqual(defaultRenderSettings);
    expect(parseRenderSettings('nope')).toEqual(defaultRenderSettings);
    expect(parseRenderSettings({ width: '999', shading: 'cinematic' })).toEqual(defaultRenderSettings);
  });

  it('clamps size and settle into the render.snapshot bounds', () => {
    expect(parseRenderSettings({ width: 32, height: 8192, settleMs: -5 }).width).toBe(64);
    expect(parseRenderSettings({ width: 32, height: 8192, settleMs: -5 }).height).toBe(4096);
    expect(parseRenderSettings({ width: 32, height: 8192, settleMs: -5 }).settleMs).toBe(0);
    expect(parseRenderSettings({ width: 1000.7, settleMs: 20_000 }).width).toBe(1001);
    expect(parseRenderSettings({ settleMs: 20_000 }).settleMs).toBe(10_000);
    expect(parseRenderSettings({ width: Number.NaN }).width).toBe(defaultRenderSettings.width);
  });

  it('drops unknown overlay kinds, dedupes and caps at 8', () => {
    const s = parseRenderSettings({ overlay: ['bbox', 'nope', 'bbox', 'grid', 'scale'] });
    expect(s.overlay).toEqual(['bbox', 'grid', 'scale']);
    expect(parseRenderSettings({ overlay: ['not', 'real'] }).overlay).toEqual([]);
  });

  it('rejects invalid enum fields', () => {
    expect(parseRenderSettings({ shading: 'pbr' }).shading).toBe('flat');
    expect(parseRenderSettings({ quality: 'ultra' }).quality).toBe('standard');
    expect(parseRenderSettings({ format: 'webp' }).format).toBe('png');
    expect(parseRenderSettings({ shading: 'material' }).shading).toBe('material');
  });
});

describe('patchRenderSettings', () => {
  it('merges a patch through the same sanitizer', () => {
    const next = patchRenderSettings(defaultRenderSettings, { height: 1080, quality: 'high' });
    expect(next).toEqual({ ...defaultRenderSettings, height: 1080, quality: 'high' });
  });

  it('keeps the rest of the fields when the patch is partial', () => {
    const base = patchRenderSettings(defaultRenderSettings, { width: 640, overlay: ['dims'] });
    expect(patchRenderSettings(base, { height: 360 })).toMatchObject({
      width: 640,
      height: 360,
      overlay: ['dims'],
    });
  });
});

describe('toSnapshotParams', () => {
  it('always sends the core params and echoes shading/quality', () => {
    expect(toSnapshotParams(defaultRenderSettings)).toEqual({
      width: 1280,
      height: 720,
      format: 'png',
      settleMs: 150,
      shading: 'flat',
      quality: 'standard',
    });
  });

  it('includes transparent and overlay only when set', () => {
    const s = patchRenderSettings(defaultRenderSettings, { transparent: true, overlay: ['dims', 'scale'] });
    const params = toSnapshotParams(s);
    expect(params).toMatchObject({ transparent: true, overlay: ['dims', 'scale'] });
    expect(toSnapshotParams(defaultRenderSettings).transparent).toBeUndefined();
    expect(toSnapshotParams(defaultRenderSettings).overlay).toBeUndefined();
  });
});

describe('useRenderSettings store', () => {
  it('applies patches through the sanitizer and resets', () => {
    const store = useRenderSettings.getState();
    store.reset();
    useRenderSettings.getState().set({ width: 1920, height: 1080, shading: 'rendered' });
    expect(useRenderSettings.getState().settings).toMatchObject({
      width: 1920,
      height: 1080,
      shading: 'rendered',
    });
    useRenderSettings.getState().set({ width: 9_999 });
    expect(useRenderSettings.getState().settings.width).toBe(4096);
    useRenderSettings.getState().reset();
    expect(useRenderSettings.getState().settings).toEqual(defaultRenderSettings);
  });
});
