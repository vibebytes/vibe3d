import { describe, expect, it } from 'vitest';
import { MAX_CAPTURE_PIXELS, resolveCaptureSize } from '../src/viewport/capture-quality';

const viewport = { width: 1200, height: 800 };

describe('resolveCaptureSize', () => {
  it('defaults to the viewport size', () => {
    expect(resolveCaptureSize({}, viewport, { ratio: 1 })).toEqual({
      width: 1200,
      height: 800,
      scaled: false,
    });
  });

  it('keeps a 720p retina capture untouched', () => {
    const size = resolveCaptureSize({ width: 1280, height: 720 }, viewport, { ratio: 2 });
    expect(size).toEqual({ width: 1280, height: 720, scaled: false });
  });

  it('downscales a 4K retina capture into the device pixel budget', () => {
    const size = resolveCaptureSize({ width: 3840, height: 2160 }, viewport, { ratio: 2 });
    expect(size.scaled).toBe(true);
    expect(size.width * size.height * 4).toBeLessThanOrEqual(MAX_CAPTURE_PIXELS);
    expect(size.width / size.height).toBeCloseTo(16 / 9, 2);
  });

  it('never upscales small requests', () => {
    expect(resolveCaptureSize({ width: 320, height: 180 }, viewport, { ratio: 1 })).toEqual({
      width: 320,
      height: 180,
      scaled: false,
    });
  });

  it('clamps to the protocol bounds', () => {
    const size = resolveCaptureSize({ width: 9999, height: 1 }, viewport, { ratio: 1 });
    expect(size.width).toBeLessThanOrEqual(4096);
    expect(size.height).toBeGreaterThanOrEqual(64);
  });
});
