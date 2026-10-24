import { useThree } from '@react-three/fiber';
import type { CameraState } from '@vibebyte/vibe3d-protocol';
import { useEffect } from 'react';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { addOverlays, applyShading } from './capture-look';
import type { OverlayKind, ShadingMode } from './capture-look';
import { useDoc } from '../stores/doc';
import { useSelection } from '../stores/selection';
import { animations, applyProceduralClips, clipBasesOf, clipsOf } from '../three/anim';
import { applyFxAt } from '../three/fx';

export type { OverlayKind, ShadingMode } from './capture-look';

export interface CaptureOptions {
  width?: number;
  height?: number;
  format?: 'png' | 'jpeg';
  at?: number;
  transparent?: boolean;
  camera?: CameraState;
  shading?: ShadingMode;
  overlay?: OverlayKind[];
}

export interface CaptureResult {
  base64: string;
  mime: string;
  width: number;
  height: number;
}

interface Size {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function exportRoot(scene: THREE.Scene, nodeIds?: string[] | null): THREE.Object3D {
  const root = scene.getObjectByName('vibe3d-export');
  if (!root) throw new Error('导出根节点缺失');
  if (!nodeIds || nodeIds.length === 0) return root;
  const wanted = new Set(nodeIds);
  const clone = root.clone(true);
  for (const child of [...clone.children]) {
    if (!wanted.has(String(child.userData.nodeId ?? ''))) clone.remove(child);
  }
  return clone;
}

function captureFrame(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  viewport: Size,
  opts: CaptureOptions = {},
): CaptureResult {
  const width = clamp(opts.width ?? viewport.width, 64, 4096);
  const height = clamp(opts.height ?? viewport.height, 64, 4096);
  const format = opts.format === 'jpeg' ? 'jpeg' : 'png';
  const mime = `image/${format}`;
  const quality = format === 'jpeg' ? 0.9 : undefined;
  if (typeof opts.at === 'number') animations.seekAll(opts.at);

  const doc = useDoc.getState().doc;
  if (doc && typeof opts.at === 'number') {
    applyProceduralClips(scene, clipsOf(doc), opts.at, clipBasesOf(doc));
    const fx = doc.fx ?? [];
    if (fx.length > 0) applyFxAt(scene, fx, opts.at);
  }

  const perspective = camera as THREE.PerspectiveCamera;
  const prevCamera = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    fov: typeof perspective.fov === 'number' ? perspective.fov : undefined,
  };
  if (opts.camera) {
    camera.position.set(...opts.camera.p);
    camera.lookAt(new THREE.Vector3(...opts.camera.target));
    if (prevCamera.fov !== undefined) {
      perspective.fov = opts.camera.fov;
      perspective.updateProjectionMatrix();
    }
  }
  const restoreCamera = (): void => {
    if (!opts.camera) return;
    camera.position.copy(prevCamera.position);
    camera.quaternion.copy(prevCamera.quaternion);
    if (prevCamera.fov !== undefined) {
      perspective.fov = prevCamera.fov;
      perspective.updateProjectionMatrix();
    }
  };
  const prevAspect = perspective.aspect;
  const setAspect = (): void => {
    if (typeof perspective.aspect !== 'number') return;
    perspective.aspect = width / height;
    perspective.updateProjectionMatrix();
  };
  const restoreAspect = (): void => {
    if (typeof perspective.aspect !== 'number') return;
    perspective.aspect = prevAspect;
    perspective.updateProjectionMatrix();
  };

  const restoreShading = applyShading(scene, opts.shading);
  const clearOverlays = addOverlays(scene, opts.overlay);
  const restoreLook = (): void => {
    clearOverlays();
    restoreShading();
  };

  let dataUrl: string;
  if (opts.transparent) {
    const alphaRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    alphaRenderer.setPixelRatio(1);
    alphaRenderer.setSize(width, height, false);
    alphaRenderer.shadowMap.enabled = gl.shadowMap.enabled;
    alphaRenderer.shadowMap.type = gl.shadowMap.type;
    alphaRenderer.toneMapping = gl.toneMapping;
    alphaRenderer.toneMappingExposure = gl.toneMappingExposure;
    alphaRenderer.outputColorSpace = gl.outputColorSpace;
    const background = scene.background;
    scene.background = null;
    alphaRenderer.setClearAlpha(0);
    setAspect();
    try {
      alphaRenderer.render(scene, camera);
      dataUrl = alphaRenderer.domElement.toDataURL(mime, quality);
    } finally {
      scene.background = background;
      restoreLook();
      restoreAspect();
      restoreCamera();
      alphaRenderer.dispose();
      alphaRenderer.forceContextLoss();
    }
  } else {
    const prevRatio = gl.getPixelRatio();
    gl.setPixelRatio(1);
    gl.setSize(width, height, false);
    setAspect();
    try {
      gl.render(scene, camera);
      dataUrl = gl.domElement.toDataURL(mime, quality);
    } finally {
      restoreLook();
      restoreAspect();
      restoreCamera();
      gl.setPixelRatio(prevRatio);
      gl.setSize(viewport.width, viewport.height);
    }
  }
  return {
    base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
    mime,
    width,
    height,
  };
}

export function CaptureBridge({ roomId, headless = false }: { roomId: string; headless?: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const revision = useDoc((s) => s.doc?.revision ?? 0);

  useEffect(() => {
    const capture = (opts?: CaptureOptions): CaptureResult => {
      if (headless && opts?.at === undefined) animations.seekAll(0);
      return captureFrame(gl, scene, camera, size, opts);
    };
    const exportGlb = async (nodeIds?: string[] | null): Promise<string> => {
      const target = exportRoot(scene, nodeIds);
      const out = await new GLTFExporter().parseAsync(target, { binary: true, onlyVisible: true });
      if (!(out instanceof ArrayBuffer)) throw new Error('GLTFExporter 未返回二进制数据');
      return toBase64(out);
    };
    window.__vibe3dCapture = capture;
    window.__vibe3dExport = exportGlb;
    window.vibe3d = { roomId, select: (id) => useSelection.getState().select(id), capture, exportGlb };
    return () => {
      Reflect.deleteProperty(window, '__vibe3dCapture');
      Reflect.deleteProperty(window, '__vibe3dExport');
      Reflect.deleteProperty(window, 'vibe3d');
    };
  }, [gl, scene, camera, size, roomId, headless]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-flag readiness after each doc revision
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      window.__vibe3dReady = true;
    });
    return () => {
      cancelAnimationFrame(raf);
      Reflect.deleteProperty(window, '__vibe3dReady');
    };
  }, [revision]);

  return null;
}
