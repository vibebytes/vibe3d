import type { FxSpec } from '@vibebyte/vibe3d-protocol';
import { particleCount, sampleParticles } from '@vibebyte/vibe3d-scene';
import * as THREE from 'three';

export interface FogSettings {
  color: number;
  near: number;
  far: number;
}

export const DEFAULT_FOG: FogSettings = { color: 0x0b0f14, near: 18, far: 42 };

export function fogSettings(fog?: { color?: number[]; near: number; far: number } | null): FogSettings {
  if (!fog) return DEFAULT_FOG;
  const c = fog.color ?? [0.043, 0.059, 0.078, 1];
  return {
    color: new THREE.Color(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0).getHex(),
    near: fog.near,
    far: fog.far,
  };
}

const baseOf = (fx: FxSpec): [number, number, number] => fx.position ?? [0, 0, 0];

function rgbaOf(fx: FxSpec): [number, number, number, number] {
  const c = fx.color ?? [1, 1, 1, 1];
  return [c[0] ?? 1, c[1] ?? 1, c[2] ?? 1, c[3] ?? 1];
}

function buildShaft(fx: FxSpec): THREE.Mesh {
  const length = fx.length ?? 6;
  const radius = fx.radiusTop ?? 0.6;
  const bottom = fx.radiusBottom ?? radius;
  const geometry = new THREE.ConeGeometry(radius, length, 24, 1, true);
  const [r, g, b, a] = rgbaOf(fx);
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(r, g, b),
    transparent: true,
    opacity: (fx.intensity ?? 0.35) * a,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  if (bottom !== radius) mesh.scale.set(bottom / radius, 1, bottom / radius);
  mesh.userData.fxId = fx.id;
  return mesh;
}

export function buildFxObject(fx: FxSpec): THREE.Points | THREE.Mesh {
  if (fx.type === 'shaft') {
    const shaft = buildShaft(fx);
    shaft.position.set(...baseOf(fx));
    shaft.position.y += (fx.length ?? 6) / 2;
    return shaft;
  }
  const count = particleCount(fx);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(count), 1));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const opacity = rgbaOf(fx)[3];
  const material = new THREE.PointsMaterial({
    size: fx.size ?? 0.1,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: fx.billboard !== false,
  });
  const points = new THREE.Points(geometry, material);
  points.position.set(...baseOf(fx));
  points.userData.fxId = fx.id;
  return points;
}

export function disposeFxObject(obj: THREE.Object3D): void {
  const mesh = obj as THREE.Points | THREE.Mesh;
  mesh.geometry?.dispose();
  const material = mesh.material;
  if (Array.isArray(material)) for (const m of material) m.dispose();
  else material?.dispose();
}

export function applyFxAt(root: THREE.Object3D, fx: FxSpec[], t: number): void {
  if (fx.length === 0) return;
  const byId = new Map(fx.map((spec) => [spec.id, spec]));
  root.traverse((obj) => {
    const id = obj.userData.fxId as string | undefined;
    if (!id) return;
    const spec = byId.get(id);
    if (!spec) return;
    updateFxObject(obj as THREE.Points | THREE.Mesh, spec, t);
  });
}

export function updateFxObject(obj: THREE.Points | THREE.Mesh, fx: FxSpec, t: number): void {
  if (fx.type === 'shaft') {
    const material = obj.material as THREE.MeshBasicMaterial;
    const pulse = 0.85 + 0.15 * Math.sin(t * 2);
    material.opacity = (fx.intensity ?? 0.35) * (fx.color?.[3] ?? 1) * pulse;
    return;
  }
  const geometry = (obj as THREE.Points).geometry as THREE.BufferGeometry;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const alpha = geometry.getAttribute('alpha') as THREE.BufferAttribute;
  const color = geometry.getAttribute('color') as THREE.BufferAttribute;
  const [r, g, b] = rgbaOf(fx);
  const base = baseOf(fx);
  const samples = sampleParticles(fx, t);
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (!s) continue;
    position.setXYZ(i, s.position[0] - base[0], s.position[1] - base[1], s.position[2] - base[2]);
    alpha.setX(i, s.alpha);
    color.setXYZ(i, r * s.alpha, g * s.alpha, b * s.alpha);
  }
  position.needsUpdate = true;
  alpha.needsUpdate = true;
  color.needsUpdate = true;
  geometry.setDrawRange(0, samples.length);
}
