import { describe, expect, it } from 'vitest';
import { alphaRendererCache, alphaRendererOptions } from '../src/viewport/alpha-cache';

describe('alpha renderer cache', () => {
  it('reuses one instance across captures', () => {
    let created = 0;
    const cache = alphaRendererCache(
      () => {
        created += 1;
        return { id: created };
      },
      () => undefined,
    );
    expect(cache.get()).toBe(cache.get());
    expect(created).toBe(1);
  });

  it('destroys and recreates after release', () => {
    let created = 0;
    const destroyed: number[] = [];
    const cache = alphaRendererCache(
      () => {
        created += 1;
        return { id: created };
      },
      (v) => destroyed.push(v.id),
    );
    const first = cache.get();
    cache.release();
    expect(destroyed).toEqual([first.id]);
    expect(cache.get().id).toBe(2);
  });

  it('preserves the drawing buffer so toDataURL avoids a ReadPixels stall', () => {
    expect(alphaRendererOptions(4)).toEqual({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    expect(alphaRendererOptions(0).antialias).toBe(false);
  });
});
