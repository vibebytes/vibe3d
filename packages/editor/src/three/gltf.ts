import type * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { attachDecoders } from './decoders';

let loader: GLTFLoader | null = null;
let prepared = false;

export function gltfLoader(): GLTFLoader {
  loader ??= new GLTFLoader();
  return loader;
}

export async function prepareGltfLoader(renderer?: THREE.WebGLRenderer): Promise<GLTFLoader> {
  const instance = gltfLoader();
  if (!prepared) {
    await attachDecoders(instance, renderer);
    prepared = true;
  }
  return instance;
}

export function cloneGltfScene(gltf: GLTF): THREE.Group {
  const scene = gltf.scene.clone(true);
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return scene;
}

export function animationClips(gltf: GLTF): THREE.AnimationClip[] {
  return gltf.animations ?? [];
}

export function clipNames(gltf: GLTF): string[] {
  return animationClips(gltf).map((clip) => clip.name);
}
