import * as THREE from 'three';

export type EnvKind = 'rgbe' | 'exr' | 'ldr';

export function envKindOf(name: string): EnvKind {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'hdr') return 'rgbe';
  if (ext === 'exr') return 'exr';
  return 'ldr';
}

export interface EnvMapDeps {
  load: (url: string, kind: EnvKind) => Promise<THREE.Texture>;
  pmrem: (texture: THREE.Texture) => THREE.Texture;
}

export interface EnvMapCache {
  get(sha: string, url: string, name: string): Promise<THREE.Texture>;
  dispose(): void;
}

export function createEnvMapCache(deps: EnvMapDeps): EnvMapCache {
  const cache = new Map<string, Promise<THREE.Texture>>();
  return {
    get(sha, url, name) {
      const hit = cache.get(sha);
      if (hit) return hit;
      const job = (async () => {
        const texture = await deps.load(url, envKindOf(name));
        texture.mapping = THREE.EquirectangularReflectionMapping;
        return deps.pmrem(texture);
      })();
      cache.set(sha, job);
      job.catch(() => cache.delete(sha));
      return job;
    },
    dispose() {
      cache.clear();
    },
  };
}
