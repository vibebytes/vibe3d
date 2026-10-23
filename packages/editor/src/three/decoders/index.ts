import type * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

export const VENDOR_ROOT = '/vendor';

let draco: DRACOLoader | null = null;
let ktx2: KTX2Loader | null = null;

export function dracoLoader(): DRACOLoader {
  draco ??= new DRACOLoader().setDecoderPath(`${VENDOR_ROOT}/draco/`);
  return draco;
}

export function ktx2Loader(renderer?: THREE.WebGLRenderer): KTX2Loader {
  ktx2 ??= new KTX2Loader().setTranscoderPath(`${VENDOR_ROOT}/basis/`);
  if (renderer) ktx2.detectSupport(renderer);
  return ktx2;
}

export async function attachDecoders(loader: GLTFLoader, renderer?: THREE.WebGLRenderer): Promise<void> {
  loader.setDRACOLoader(dracoLoader());
  loader.setKTX2Loader(ktx2Loader(renderer));
  try {
    const mod = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
    loader.setMeshoptDecoder(mod.MeshoptDecoder);
  } catch {
    // meshopt is optional: scenes without EXT_meshopt_compression still load.
  }
}

export function disposeDecoders(): void {
  draco?.dispose();
  ktx2?.dispose();
  draco = null;
  ktx2 = null;
}
