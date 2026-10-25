import { describe, expect, it } from 'vitest';
import { base64ToBytes, fitsMaxBytes, shrinkCapture } from '../src/lib/snapshot-upload';

describe('snapshot upload helpers', () => {
  it('decodes base64 into bytes', () => {
    const bytes = base64ToBytes(Buffer.from('vibe3d').toString('base64'));
    expect(Buffer.from(bytes).toString('utf8')).toBe('vibe3d');
  });

  it('treats unset budget as unlimited', () => {
    expect(fitsMaxBytes(50_000_000, 0)).toBe(true);
    expect(fitsMaxBytes(50_000_000, undefined)).toBe(true);
  });

  it('flags payloads over budget', () => {
    expect(fitsMaxBytes(2048, 2048)).toBe(true);
    expect(fitsMaxBytes(2049, 2048)).toBe(false);
  });

  it('shrinks capture size but never below 64px', () => {
    expect(shrinkCapture(1920, 1080)).toEqual({ width: 1344, height: 756 });
    expect(shrinkCapture(80, 80)).toEqual({ width: 64, height: 64 });
  });
});
