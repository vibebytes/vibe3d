import { describe, expect, it, vi } from 'vitest';
import { createModelCache } from '../src/three/model-cache';

describe('createModelCache', () => {
  it('dedupes concurrent loads for the same sha', async () => {
    const fetch = vi.fn(async () => ({ ok: true }));
    const cache = createModelCache(fetch);
    const [a, b] = await Promise.all([cache.load('s1', '/a'), cache.load('s1', '/a')]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('caches successful loads and refetches after clear', async () => {
    const fetch = vi.fn(async (sha: string, url: string) => ({ sha, url }));
    const cache = createModelCache(fetch);
    const first = await cache.load('s1', '/a');
    const second = await cache.load('s1', '/a');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    cache.clear('s1');
    const third = await cache.load('s1', '/a');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(third).not.toBe(first);
  });

  it('evicts failed loads so a retry refetches', async () => {
    let fail = true;
    const fetch = vi.fn(async () => {
      if (fail) throw new Error('Could not load /assets/x: Failed to fetch');
      return { ok: true };
    });
    const cache = createModelCache(fetch);
    await expect(cache.load('s1', '/a')).rejects.toThrow('Failed to fetch');

    fail = false;
    const out = await cache.load('s1', '/a');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ ok: true });
  });

  it('keeps unrelated entries when clearing a single sha', async () => {
    const fetch = vi.fn(async (sha: string) => ({ sha }));
    const cache = createModelCache(fetch);
    await cache.load('s1', '/a');
    await cache.load('s2', '/b');
    cache.clear('s1');
    await cache.load('s2', '/b');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith('s2', '/b');
  });

  it('clear() without sha wipes every entry', async () => {
    const fetch = vi.fn(async (sha: string) => ({ sha }));
    const cache = createModelCache(fetch);
    await cache.load('s1', '/a');
    await cache.load('s2', '/b');
    cache.clear();
    await cache.load('s1', '/a');
    await cache.load('s2', '/b');
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
