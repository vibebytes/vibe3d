import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createEnvMapCache, envKindOf } from '../src/three/env-map';

function fakeTexture(): THREE.Texture {
  return new THREE.Texture();
}

describe('envKindOf', () => {
  it('按扩展名分派 hdr / exr / 普通图', () => {
    expect(envKindOf('studio.HDR')).toBe('rgbe');
    expect(envKindOf('night.exr')).toBe('exr');
    expect(envKindOf('pano.jpg')).toBe('ldr');
    expect(envKindOf('pano.png')).toBe('ldr');
    expect(envKindOf('noext')).toBe('ldr');
  });
});

describe('createEnvMapCache', () => {
  it('同一 sha 只解码与 PMREM 一次', async () => {
    const load = vi.fn(async () => fakeTexture());
    const pmrem = vi.fn((t: THREE.Texture) => {
      const out = fakeTexture();
      out.userData.from = t;
      return out;
    });
    const cache = createEnvMapCache({ load, pmrem });

    const a = await cache.get('a'.repeat(64), '/assets/a', 'sky.hdr');
    const b = await cache.get('a'.repeat(64), '/assets/a', 'sky.hdr');
    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
    expect(pmrem).toHaveBeenCalledTimes(1);
  });

  it('解码出的纹理先设 equirect 映射再进 PMREM', async () => {
    const load = vi.fn(async () => fakeTexture());
    const seen: THREE.Mapping[] = [];
    const pmrem = vi.fn((t: THREE.Texture) => {
      seen.push(t.mapping);
      return fakeTexture();
    });
    const cache = createEnvMapCache({ load, pmrem });
    await cache.get('b'.repeat(64), '/assets/b', 'pano.png');
    expect(seen).toEqual([THREE.EquirectangularReflectionMapping]);
  });

  it('dispose 后再次 get 会重新加载', async () => {
    const load = vi.fn(async () => fakeTexture());
    const cache = createEnvMapCache({ load, pmrem: () => fakeTexture() });
    await cache.get('c'.repeat(64), '/assets/c', 'sky.hdr');
    cache.dispose();
    await cache.get('c'.repeat(64), '/assets/c', 'sky.hdr');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('加载失败不缓存，可重试', async () => {
    let calls = 0;
    const load = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('404');
      return fakeTexture();
    });
    const cache = createEnvMapCache({ load, pmrem: () => fakeTexture() });
    await expect(cache.get('d'.repeat(64), '/assets/d', 'sky.hdr')).rejects.toThrow('404');
    await expect(cache.get('d'.repeat(64), '/assets/d', 'sky.hdr')).resolves.toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
