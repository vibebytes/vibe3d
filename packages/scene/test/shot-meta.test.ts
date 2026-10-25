import { describe, expect, it } from 'vitest';
import { autoClipRange, autoFogRange, parseShotMeta, shotMetaOf, shotWarning } from '../src/shot-meta';

const CAMERA = {
  position: [0, 0, 10] as [number, number, number],
  target: [0, 0, 0] as [number, number, number],
};

describe('shot meta', () => {
  it('reports doc fog with near/far and the real camera distance', () => {
    const meta = shotMetaOf({
      fog: { color: 0x112233, near: 4, far: 40 },
      fallbackColor: 0x0b0f14,
      camera: CAMERA,
    });
    expect(meta.fog).toEqual({ enabled: true, color: 0x112233, near: 4, far: 40, mode: 'doc' });
    expect(meta.distanceToTarget).toBe(10);
    expect(meta.camera).toEqual(CAMERA);
  });

  it('marks a room without fog as disabled and falls back to the background color', () => {
    const meta = shotMetaOf({ fog: null, fallbackColor: 0x0b0f14, camera: CAMERA });
    expect(meta.fog).toEqual({ enabled: false, color: 0x0b0f14, near: 0, far: 0, mode: 'doc' });
    expect(meta.fog.reason).toBeUndefined();
  });

  it('marks diagnostic shading as fog-free even when the doc has fog', () => {
    for (const shading of ['flat', 'wireframe', 'normals', 'material'] as const) {
      const meta = shotMetaOf({
        fog: { color: 0x112233, near: 4, far: 40 },
        fallbackColor: 0x0b0f14,
        shading,
        camera: CAMERA,
      });
      expect({ shading, enabled: meta.fog.enabled, reason: meta.fog.reason }).toEqual({
        shading,
        enabled: false,
        reason: 'shading',
      });
    }
  });

  it('keeps fog for the rendered shading preset', () => {
    const meta = shotMetaOf({
      fog: { color: 0x112233, near: 4, far: 40 },
      fallbackColor: 0x0b0f14,
      shading: 'rendered',
      camera: CAMERA,
    });
    expect(meta.fog.enabled).toBe(true);
  });

  it('reports an explicit off switch as reason=option', () => {
    const meta = shotMetaOf({
      fog: { color: 0x112233, near: 4, far: 40 },
      fallbackColor: 0x0b0f14,
      mode: 'off',
      camera: CAMERA,
    });
    expect(meta.fog).toMatchObject({ enabled: false, mode: 'off', reason: 'option' });
  });

  it('rounds distanceToTarget to three decimals', () => {
    const meta = shotMetaOf({
      fog: null,
      fallbackColor: 0,
      camera: { position: [1, 2, 2], target: [0, 0, 0] },
    });
    expect(meta.distanceToTarget).toBe(3);
  });
});

describe('shot warning', () => {
  const base = { color: 0, near: 4, far: 40, mode: 'doc' as const };

  it('warns when the subject sits at or beyond the fog far plane', () => {
    const meta = shotMetaOf({
      fog: base,
      fallbackColor: 0,
      camera: { position: [0, 0, 40], target: [0, 0, 0] },
    });
    expect(shotWarning(meta)).toContain('雾远端');
  });

  it('warns when the subject sits inside the fog near plane', () => {
    const meta = shotMetaOf({
      fog: base,
      fallbackColor: 0,
      camera: { position: [0, 0, 3], target: [0, 0, 0] },
    });
    expect(shotWarning(meta)).toContain('雾近端');
  });

  it('stays quiet when the subject is between near and far', () => {
    const meta = shotMetaOf({
      fog: base,
      fallbackColor: 0,
      camera: { position: [0, 0, 20], target: [0, 0, 0] },
    });
    expect(shotWarning(meta)).toBeNull();
  });

  it('stays quiet when fog is disabled or meta is missing', () => {
    const meta = shotMetaOf({
      fog: null,
      fallbackColor: 0,
      camera: { position: [0, 0, 400], target: [0, 0, 0] },
    });
    expect(shotWarning(meta)).toBeNull();
    expect(shotWarning(null)).toBeNull();
  });
});

describe('parse shot meta', () => {
  it('accepts a well formed meta', () => {
    const meta = shotMetaOf({
      fog: { color: 0x112233, near: 4, far: 40 },
      fallbackColor: 0,
      camera: CAMERA,
    });
    expect(parseShotMeta(JSON.parse(JSON.stringify(meta)))).toEqual(meta);
  });

  it('rejects malformed payloads instead of throwing', () => {
    expect(parseShotMeta(null)).toBeNull();
    expect(parseShotMeta({})).toBeNull();
    expect(parseShotMeta({ fog: { enabled: true }, distanceToTarget: 1, camera: CAMERA })).toBeNull();
    expect(
      parseShotMeta({
        fog: { enabled: true, color: 0, near: 4, far: 40, mode: 'doc' },
        distanceToTarget: -1,
        camera: CAMERA,
      }),
    ).toBeNull();
  });
});

describe('auto clip range', () => {
  it('covers a subject far beyond the default far plane', () => {
    const { far } = autoClipRange(4000, 500);
    expect(far).toBeGreaterThan(4500);
  });

  it('never puts near above the subject and stays positive', () => {
    const { near, far } = autoClipRange(0, 0);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near);
  });
});

describe('auto fog range', () => {
  it('brackets the subject so it never sits past the far plane', () => {
    const { near, far } = autoFogRange(72, 60);
    expect(near).toBeLessThan(72);
    expect(far).toBeGreaterThanOrEqual(72 + 60);
  });

  it('stays finite for a zero distance and a zero radius', () => {
    const { near, far } = autoFogRange(0, 0);
    expect(Number.isFinite(near)).toBe(true);
    expect(Number.isFinite(far)).toBe(true);
    expect(far).toBeGreaterThan(near);
    expect(near).toBeGreaterThanOrEqual(0.05);
  });

  it('keeps near below far for a tiny scene', () => {
    const { near, far } = autoFogRange(0.2, 0.01);
    expect(far - near).toBeGreaterThan(0);
  });
});
