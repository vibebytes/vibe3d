import type { StageState } from '@vibebyte/vibe3d-protocol';
import * as THREE from 'three';
import { rgbaHex } from './materials';

export interface NprPlan {
  outline?: { width: number; color: string };
  rampSteps?: number;
  rim: number;
}

const DEFAULT_OUTLINE = { width: 1.5, color: '#0b0f14' };

export function nprPlan(stage: StageState): NprPlan | null {
  const npr = stage.npr;
  if (!npr) return null;
  const plan: NprPlan = { rim: npr.rim ?? 0 };
  if (npr.outline) {
    plan.outline = {
      width: npr.outline.width ?? DEFAULT_OUTLINE.width,
      color: npr.outline.color ? rgbaHex(npr.outline.color) : DEFAULT_OUTLINE.color,
    };
  }
  if (npr.rampSteps) plan.rampSteps = npr.rampSteps;
  return plan;
}

const ramps = new Map<number, THREE.DataTexture>();

export function rampTexture(steps: number): THREE.DataTexture {
  const hit = ramps.get(steps);
  if (hit) return hit;
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) {
    const value = Math.round((i * 255) / Math.max(1, steps - 1));
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  ramps.set(steps, tex);
  return tex;
}

const OUTLINE_VERT = `
uniform float uWidth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  mv.xyz += normalize(normalMatrix * normal) * uWidth;
  gl_Position = projectionMatrix * mv;
}
`;

const OUTLINE_FRAG = `
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4(uColor, 1.0);
}
`;

export function outlineShell(width: number, color: string): THREE.Mesh {
  const shell = new THREE.Mesh(
    undefined,
    new THREE.ShaderMaterial({
      uniforms: { uWidth: { value: width }, uColor: { value: new THREE.Color(color) } },
      vertexShader: OUTLINE_VERT,
      fragmentShader: OUTLINE_FRAG,
      side: THREE.BackSide,
      toneMapped: false,
    }),
  );
  shell.name = 'vibe3d-npr-outline';
  shell.castShadow = false;
  shell.receiveShadow = false;
  shell.raycast = () => {};
  return shell;
}

const RIM_VERT = `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const RIM_FRAG = `
uniform vec3 uColor;
uniform float uStrength;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.0) * uStrength;
  gl_FragColor = vec4(uColor * rim, rim);
}
`;

export function rimShell(strength: number, color = '#ffffff'): THREE.Mesh {
  const shell = new THREE.Mesh(
    undefined,
    new THREE.ShaderMaterial({
      uniforms: { uStrength: { value: strength }, uColor: { value: new THREE.Color(color) } },
      vertexShader: RIM_VERT,
      fragmentShader: RIM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  shell.name = 'vibe3d-npr-rim';
  shell.castShadow = false;
  shell.receiveShadow = false;
  shell.raycast = () => {};
  return shell;
}
