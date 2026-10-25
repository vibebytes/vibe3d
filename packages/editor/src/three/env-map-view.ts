import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { createEnvMapCache } from './env-map';

export interface ViewportEnvMap {
  get(sha: string, url: string, name: string): Promise<THREE.Texture>;
  dispose(): void;
}

export function createViewportEnvMap(renderer: THREE.WebGLRenderer): ViewportEnvMap {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const targets = new Set<THREE.WebGLRenderTarget>();
  const cache = createEnvMapCache({
    load: (url, kind) =>
      new Promise<THREE.Texture>((resolve, reject) => {
        if (kind === 'rgbe') {
          new RGBELoader().load(url, resolve, undefined, reject);
          return;
        }
        if (kind === 'exr') {
          new EXRLoader().load(url, resolve, undefined, reject);
          return;
        }
        new THREE.TextureLoader().load(url, resolve, undefined, reject);
      }),
    pmrem: (texture) => {
      const target = pmrem.fromEquirectangular(texture);
      texture.dispose();
      targets.add(target);
      return target.texture;
    },
  });
  return {
    get: cache.get,
    dispose: () => {
      cache.dispose();
      for (const target of targets) target.dispose();
      targets.clear();
      pmrem.dispose();
    },
  };
}
