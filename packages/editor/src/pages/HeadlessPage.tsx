import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { useDoc } from '../stores/doc';
import { useSelection } from '../stores/selection';
import { SceneCanvas } from '../viewport/SceneCanvas';

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

function CaptureBridge({ roomId }: { roomId: string }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const revision = useDoc((s) => s.doc?.revision ?? 0);

  useEffect(() => {
    const capture = () => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
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
  }, [gl, scene, camera, roomId]);

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

export function HeadlessPage() {
  const { roomId, doc, status, error } = useDoc();

  useEffect(() => {
    const root = document.documentElement;
    if (error) root.setAttribute('data-vibe3d-error', error);
    else root.removeAttribute('data-vibe3d-error');
    return () => root.removeAttribute('data-vibe3d-error');
  }, [error]);

  if (!doc) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-base-content/40">
        {status === 'error' ? error : '载入…'}
      </div>
    );
  }
  return (
    <div className="h-full w-full">
      <SceneCanvas doc={doc} headless>
        <CaptureBridge roomId={roomId} />
      </SceneCanvas>
    </div>
  );
}
