import { useThree } from '@react-three/fiber';
import type { CameraState } from '@vibebyte/vibe3d-protocol';
import type { FogMode, QualityPreset, ShotMeta } from '@vibebyte/vibe3d-scene';
import { autoClipRange, shotMetaOf } from '@vibebyte/vibe3d-scene';
import { useEffect } from 'react';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { useDoc } from '../stores/doc';
import { useSelection } from '../stores/selection';
import { animations, applyProceduralClips, clipBasesOf, clipsOf } from '../three/anim';
import { applyFxAt, fogSettings } from '../three/fx';
import { applyIdMaterials } from '../three/id-pass-materials';
import { missingModelIds } from '../three/model-ready';
import { alphaRendererCache, alphaRendererOptions } from './alpha-cache';
import { applyCaptureFog, applyClipRange, captureFogPlan, subjectSphere } from './capture-fog';
import { addOverlays, applyHighlight, applyIsolate, applyShading, shadingNeedsShadows } from './capture-look';
import type { OverlayKind, ShadingMode } from './capture-look';
import { applyShadowResolution, qualityOf, resolveCaptureSize } from './capture-quality';
import { scheduleReadyFlag } from './ready-flag';

export type { OverlayKind, ShadingMode } from './capture-look';
export type { FogMode } from '@vibebyte/vibe3d-scene';

export interface CaptureOptions {
  width?: number;
  height?: number;
  format?: 'png' | 'jpeg';
  at?: number;
  transparent?: boolean;
  camera?: CameraState;
  shading?: ShadingMode;
  overlay?: OverlayKind[];
  highlight?: string[];
  isolate?: string[];
  quality?: QualityPreset;
  fog?: FogMode;
}

export interface CaptureResult {
  base64: string;
  mime: string;
  width: number;
  height: number;
  meta: ShotMeta;
}

export interface IdPassOptions {
  width?: number;
  height?: number;
  camera?: CameraState;
  at?: number;
  legend: Record<string, string>;
}

export interface IdPassResult {
  width: number;
  height: number;
  rgba: string;
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

function subjectCenter(scene: THREE.Scene): [number, number, number] {
  const root = scene.getObjectByName('vibe3d-export') ?? scene;
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return [0, 0, 0];
  const center = box.getCenter(new THREE.Vector3());
  return [center.x, center.y, center.z];
}

function pendingModels(root: THREE.Object3D, nodeIds?: string[] | null): string[] {
  const present = new Set<string>();
  root.traverse((obj) => {
    const id = obj.userData?.nodeId;
    if (typeof id === 'string') present.add(id);
  });
  return missingModelIds(useDoc.getState().doc, present, nodeIds);
}

const alphaPools = new Map<boolean, ReturnType<typeof alphaRendererCache<THREE.WebGLRenderer>>>();

function alphaPool(antialias: boolean) {
  let pool = alphaPools.get(antialias);
  if (!pool) {
    pool = alphaRendererCache(
      () => new THREE.WebGLRenderer(alphaRendererOptions(antialias ? 1 : 0)),
      (renderer) => renderer.dispose(),
    );
    alphaPools.set(antialias, pool);
  }
  return pool;
}

function captureFrame(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  viewport: Size,
  opts: CaptureOptions = {},
): CaptureResult {
  const format = opts.format === 'jpeg' ? 'jpeg' : 'png';
  const mime = `image/${format}`;
  const quality = format === 'jpeg' ? 0.9 : undefined;
  const preset = qualityOf(opts.quality);
  const { width, height } = resolveCaptureSize({ width: opts.width, height: opts.height }, viewport, {
    ratio: preset.pixelRatio,
  });
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

  const fogMode = opts.fog ?? 'doc';
  const docFog = fogSettings(doc?.env?.fog, doc?.env?.background);
  const bg = doc?.env?.background ?? [0.043, 0.059, 0.078];
  const target = opts.camera?.target ?? subjectCenter(scene);
  const fallbackColor = new THREE.Color(bg[0] ?? 0, bg[1] ?? 0, bg[2] ?? 0).getHex();
  const distance = Math.hypot(
    camera.position.x - target[0],
    camera.position.y - target[1],
    camera.position.z - target[2],
  );
  const fogPlan = captureFogPlan({
    mode: fogMode,
    docFog,
    fallbackColor,
    distance,
    radius: subjectSphere(scene).radius,
    shading: opts.shading,
  });
  const restoreFog = applyCaptureFog(scene, fogPlan);
  const clip = autoClipRange(distance, subjectSphere(scene).radius);
  const restoreClip = applyClipRange(perspective, clip);
  const meta = shotMetaOf({
    fog: fogPlan ?? docFog,
    fallbackColor,
    shading: opts.shading,
    mode: fogMode,
    camera: {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [target[0], target[1], target[2]],
    },
  });

  const restoreShading = applyShading(scene, opts.shading);
  const scope = opts.isolate?.length ? opts.isolate : opts.highlight;
  const clearOverlays = addOverlays(scene, opts.overlay, scope);
  const restoreHighlight = applyHighlight(scene, opts.highlight);
  const restoreIsolate = applyIsolate(scene, opts.isolate);
  const restoreShadow = applyShadowResolution(scene, preset.shadowMapSize);
  const shadowsForced = shadingNeedsShadows(opts.shading) && !gl.shadowMap.enabled;
  if (shadowsForced) gl.shadowMap.enabled = true;
  const restoreLook = (): void => {
    if (shadowsForced) gl.shadowMap.enabled = false;
    restoreShadow();
    restoreIsolate();
    restoreHighlight();
    clearOverlays();
    restoreShading();
  };

  let dataUrl: string;
  if (opts.transparent) {
    const alphaRenderer = alphaPool(preset.samples > 0).get();
    alphaRenderer.setPixelRatio(preset.pixelRatio);
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
      restoreFog();
      restoreClip();
    }
  } else {
    const prevRatio = gl.getPixelRatio();
    gl.setPixelRatio(preset.pixelRatio);
    gl.setSize(width, height, false);
    setAspect();
    try {
      gl.render(scene, camera);
      dataUrl = gl.domElement.toDataURL(mime, quality);
    } finally {
      restoreLook();
      restoreAspect();
      restoreCamera();
      restoreFog();
      restoreClip();
      gl.setPixelRatio(prevRatio);
      gl.setSize(viewport.width, viewport.height);
    }
  }
  return {
    base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
    mime,
    width,
    height,
    meta,
  };
}

function captureIdPass(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  viewport: Size,
  opts: IdPassOptions,
): IdPassResult {
  const width = clamp(opts.width ?? 640, 64, 2048);
  const height = clamp(opts.height ?? 480, 64, 2048);
  if (width * height > 1_000_000) {
    throw new Error(`id-pass 分辨率 ${width}x${height} 超过 1MP 上限`);
  }
  if (typeof opts.at === 'number') animations.seekAll(opts.at);

  const perspective = camera as THREE.PerspectiveCamera;
  const prevCamera = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    fov: perspective.fov,
    aspect: perspective.aspect,
  };
  if (opts.camera) {
    camera.position.set(...opts.camera.p);
    camera.lookAt(new THREE.Vector3(...opts.camera.target));
    perspective.fov = opts.camera.fov;
  }
  perspective.aspect = width / height;
  perspective.updateProjectionMatrix();

  const restoreIds = applyIdMaterials(scene, opts.legend);
  const prevBackground = scene.background;
  const prevTone = gl.toneMapping;
  const prevRatio = gl.getPixelRatio();
  const prevClear = gl.getClearColor(new THREE.Color());
  const prevAlpha = gl.getClearAlpha();
  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    stencilBuffer: false,
  });
  scene.background = null;
  try {
    gl.setPixelRatio(1);
    gl.toneMapping = THREE.NoToneMapping;
    gl.setRenderTarget(target);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true, true);
    gl.render(scene, camera);
    const raw = new Uint8Array(width * height * 4);
    gl.readRenderTargetPixels(target, 0, 0, width, height, raw);
    const rgba = new Uint8Array(raw.length);
    const stride = width * 4;
    for (let y = 0; y < height; y += 1) {
      rgba.set(raw.subarray(y * stride, (y + 1) * stride), (height - 1 - y) * stride);
    }
    return { width, height, rgba: toBase64(rgba.buffer) };
  } finally {
    gl.setRenderTarget(null);
    gl.setClearColor(prevClear, prevAlpha);
    gl.toneMapping = prevTone;
    gl.setPixelRatio(prevRatio);
    scene.background = prevBackground;
    restoreIds();
    camera.position.copy(prevCamera.position);
    camera.quaternion.copy(prevCamera.quaternion);
    perspective.fov = prevCamera.fov;
    perspective.aspect = prevCamera.aspect;
    perspective.updateProjectionMatrix();
    target.dispose();
  }
}

function captureCamera(state: CameraState, width: number, height: number): THREE.Camera {
  let cam: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  if (state.mode === 'ortho') {
    const aspect = width / height;
    cam = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.01, 1e6);
  } else {
    cam = new THREE.PerspectiveCamera(state.fov, width / height, 0.01, 1e6);
  }
  cam.zoom = state.zoom || 1;
  cam.position.set(state.p[0], state.p[1], state.p[2]);
  cam.up.set(0, 1, 0);
  cam.lookAt(state.target[0], state.target[1], state.target[2]);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return cam;
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
      const deadline = Date.now() + 12_000;
      let target = exportRoot(scene, nodeIds);
      let missing = pendingModels(target, nodeIds);
      while (missing.length > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 120));
        target = exportRoot(scene, nodeIds);
        missing = pendingModels(target, nodeIds);
      }
      if (missing.length > 0) {
        throw new Error(`模型尚未加载完成，导出会丢失节点：${missing.join(', ')}`);
      }
      scene.updateMatrixWorld(true);
      const out = await new GLTFExporter().parseAsync(target, { binary: true, onlyVisible: true });
      if (!(out instanceof ArrayBuffer)) throw new Error('GLTFExporter 未返回二进制数据');
      return toBase64(out);
    };
    const idPass = (opts: IdPassOptions): IdPassResult => {
      if (headless && opts.at === undefined) animations.seekAll(0);
      return captureIdPass(gl, scene, camera, size, opts);
    };
    const project = (opts: {
      camera: CameraState;
      width: number;
      height: number;
      points: Array<[number, number, number]>;
    }) => {
      const cam = captureCamera(opts.camera, opts.width, opts.height);
      const fwd = new THREE.Vector3();
      cam.getWorldDirection(fwd);
      return {
        points: opts.points.map((p) => {
          const world = new THREE.Vector3(p[0], p[1], p[2]);
          const v = world.clone().project(cam);
          const depth = world.clone().sub(cam.position).dot(fwd);
          return {
            px: [(v.x + 1) / 2 * opts.width, (1 - v.y) / 2 * opts.height] as [number, number],
            depth,
            in_view: depth > 0 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1,
          };
        }),
      };
    };
    const unproject = (opts: {
      camera: CameraState;
      width: number;
      height: number;
      points: Array<[number, number]>;
      depth: number[];
    }) => {
      const cam = captureCamera(opts.camera, opts.width, opts.height);
      const raycaster = new THREE.Raycaster();
      const fwd = new THREE.Vector3();
      cam.getWorldDirection(fwd);
      return {
        points: opts.points.map((pt, i) => {
          const depth = opts.depth[i] ?? 0;
          raycaster.setFromCamera(
            new THREE.Vector2((pt[0] / opts.width) * 2 - 1, 1 - (pt[1] / opts.height) * 2),
            cam,
          );
          const dir = raycaster.ray.direction.clone();
          const cos = dir.dot(fwd);
          const t = Math.abs(cos) < 1e-9 ? 0 : depth / cos;
          const p = raycaster.ray.origin.clone().addScaledVector(dir, t);
          return {
            p: [p.x, p.y, p.z] as [number, number, number],
            in_view: pt[0] >= 0 && pt[0] <= opts.width && pt[1] >= 0 && pt[1] <= opts.height,
          };
        }),
      };
    };
    window.__vibe3dCapture = capture;
    window.__vibe3dProject = project;
    window.__vibe3dUnproject = unproject;
    window.__vibe3dExport = exportGlb;
    window.__vibe3dIdPass = idPass;
    window.vibe3d = { roomId, select: (id) => useSelection.getState().select(id), capture, exportGlb };
    return () => {
      Reflect.deleteProperty(window, '__vibe3dCapture');
      Reflect.deleteProperty(window, '__vibe3dProject');
      Reflect.deleteProperty(window, '__vibe3dUnproject');
      Reflect.deleteProperty(window, '__vibe3dExport');
      Reflect.deleteProperty(window, '__vibe3dIdPass');
      Reflect.deleteProperty(window, 'vibe3d');
    };
  }, [gl, scene, camera, size, roomId, headless]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-flag readiness after each doc revision
  useEffect(() => {
    window.__vibe3dRevision = revision;
    return scheduleReadyFlag(window);
  }, [revision]);

  return null;
}
