import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { pickAt } from '../src/three/picking';
import { letterbox } from '../src/viewport/letterbox';

const ASPECT = 16 / 9;

function element(width: number, height: number): HTMLElement {
  return {
    getBoundingClientRect: () =>
      ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON() {} }) as DOMRect,
  } as HTMLElement;
}

describe('16:9 遮幅', () => {
  it('4:3 视口上下留黑，内框恰好 16:9', () => {
    const frame = letterbox(800, 600);
    expect(frame.w / frame.h).toBeCloseTo(ASPECT, 5);
    expect(frame.x).toBe(0);
    expect(frame.y).toBeGreaterThan(0);
    expect(frame.w).toBe(800);
    expect(frame.y * 2 + frame.h).toBeCloseTo(600, 5);
  });

  it('过宽视口左右留黑，内框恰好 16:9', () => {
    const frame = letterbox(1600, 600);
    expect(frame.w / frame.h).toBeCloseTo(ASPECT, 5);
    expect(frame.y).toBe(0);
    expect(frame.x).toBeGreaterThan(0);
    expect(frame.h).toBe(600);
    expect(frame.x * 2 + frame.w).toBeCloseTo(1600, 5);
  });

  it('遮幅内坐标能命中，遮幅外忽略', () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial());
    mesh.userData.nodeId = 'n_hero0001';
    scene.add(mesh);
    const camera = new THREE.PerspectiveCamera(40, ASPECT, 0.1, 100);
    camera.position.set(0, 0, 8);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const frame = letterbox(800, 600);
    const el = element(800, 600);
    const inside = pickAt(scene, camera, frame.x + frame.w / 2, frame.y + frame.h / 2, el, frame);
    expect(inside?.id).toBe('n_hero0001');
    expect(pickAt(scene, camera, 400, 4, el, frame)).toBeNull();
  });
});
