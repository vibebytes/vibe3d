import { describe, expect, it } from 'vitest';
import { DEFAULT_SNAPSHOT_TIMEOUT_MS, snapshotAreaPixels, snapshotTimeoutMs } from '../src/render/editor';

describe('snapshotTimeoutMs', () => {
  it('uses the 5s base for tiny frames', () => {
    expect(snapshotTimeoutMs(0)).toBe(5000);
    expect(DEFAULT_SNAPSHOT_TIMEOUT_MS).toBe(5000);
  });

  it('grows 2s per megapixel', () => {
    expect(snapshotTimeoutMs(4_000_000)).toBe(13_000);
  });

  it('caps at 30s', () => {
    expect(snapshotTimeoutMs(64_000_000)).toBe(30_000);
  });

  it('honours an explicit base override', () => {
    expect(snapshotTimeoutMs(0, { baseMs: 9_000 })).toBe(9_000);
  });
});

describe('snapshotAreaPixels', () => {
  it('counts device pixels from the quality pixel ratio', () => {
    expect(snapshotAreaPixels(1280, 720, 1)).toBe(921_600);
    expect(snapshotAreaPixels(1280, 720, 2)).toBe(3_686_400);
  });

  it('clamps to the capture budget', () => {
    expect(snapshotAreaPixels(1920, 1080, 2)).toBe(4_000_000);
    expect(snapshotAreaPixels(3840, 2160, 2)).toBe(4_000_000);
  });
});
