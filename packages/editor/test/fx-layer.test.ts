import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyFxAt, buildFxObject, fogSettings, updateFxObject } from '../src/three/fx';
import type { FxSpec } from '@vibebyte/vibe3d-protocol';

const particles: FxSpec = {
  id: 'f_aaaaaaaa',
  type: 'particles',
  position: [0, 1, 0],
  rate: 20,
  life: 2,
  size: 0.1,
  color: [1, 1, 1, 1],
} as FxSpec;

describe('buildFxObject', () => {
  it('allocates rate*life points', () => {
    const obj = buildFxObject(particles);
    const attr = obj.geometry.getAttribute('position');
    expect(attr.count).toBe(40);
  });

  it('places the object at the emitter position', () => {
    const obj = buildFxObject(particles);
    expect(obj.position.toArray()).toEqual([0, 1, 0]);
  });

  it('carries the fx id for later lookup', () => {
    const obj = buildFxObject(particles);
    expect(obj.userData.fxId).toBe('f_aaaaaaaa');
  });
});

describe('updateFxObject', () => {
  it('writes finite positions and a zero alpha for dead particles', () => {
    const obj = buildFxObject(particles);
    updateFxObject(obj, particles, 0.5);
    const pos = obj.geometry.getAttribute('position');
    const alpha = obj.geometry.getAttribute('alpha');
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i))).toBe(true);
      expect(alpha.getX(i)).toBeGreaterThanOrEqual(0);
      expect(alpha.getX(i)).toBeLessThanOrEqual(1);
    }
  });

  it('is stable for the same time', () => {
    const obj = buildFxObject(particles);
    updateFxObject(obj, particles, 1);
    const first = obj.geometry.getAttribute('position').getY(0);
    updateFxObject(obj, particles, 1);
    expect(obj.geometry.getAttribute('position').getY(0)).toBeCloseTo(first);
  });
});

describe('applyFxAt', () => {
  it('updates every fx object in the scene by its id', () => {
    const root = new THREE.Object3D();
    const a = buildFxObject(particles);
    const b = buildFxObject({ ...particles, id: 'f_bbbbbbbb', position: [2, 0, 0] });
    root.add(a, b);
    applyFxAt(root, [particles, { ...particles, id: 'f_bbbbbbbb', position: [2, 0, 0] }], 1.5);
    const movedA = a.geometry.getAttribute('position').getX(1);
    const movedB = (b as THREE.Points).geometry.getAttribute('position').getX(1);
    expect(Number.isFinite(movedA)).toBe(true);
    expect(Number.isFinite(movedB)).toBe(true);
  });

  it('leaves unknown fx objects and plain meshes untouched', () => {
    const root = new THREE.Object3D();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(1, 2, 3);
    root.add(mesh);
    applyFxAt(root, [particles], 1);
    expect([mesh.position.x, mesh.position.y, mesh.position.z]).toEqual([1, 2, 3]);
  });
});

describe('fogSettings', () => {
  it('falls back to 18/42 without a fog spec', () => {
    expect(fogSettings(undefined)).toEqual({ color: 0x0b0f14, near: 18, far: 42 });
  });

  it('honours doc env fog values', () => {
    const fog = fogSettings({ color: [1, 0, 0, 1], near: 5, far: 60 });
    expect(fog.near).toBe(5);
    expect(fog.far).toBe(60);
    expect(fog.color).toBe(0xff0000);
  });
});
