import * as THREE from 'three';

export interface RendererOptions {
  headless: boolean;
}

export function canvasGlOptions({ headless }: RendererOptions) {
  return {
    antialias: !headless,
    preserveDrawingBuffer: true,
    alpha: false,
    powerPreference: 'high-performance' as const,
    toneMapping: THREE.ACESFilmicToneMapping,
    outputColorSpace: THREE.SRGBColorSpace,
  };
}

export function applyRenderer(gl: THREE.WebGLRenderer, { headless }: RendererOptions): void {
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  if (headless) {
    gl.setPixelRatio(1);
  }
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) for (const m of mat) m.dispose();
    else mat?.dispose();
  });
}
