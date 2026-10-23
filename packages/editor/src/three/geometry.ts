import type { Geometry } from '@vibebyte/vibe3d-protocol';
import * as THREE from 'three';

export function createGeometry(g: Geometry): THREE.BufferGeometry {
  switch (g.type) {
    case 'box':
      return new THREE.BoxGeometry(g.size[0], g.size[1], g.size[2]);
    case 'sphere':
      return new THREE.SphereGeometry(g.radius, g.segments, Math.max(3, Math.round(g.segments / 2)));
    case 'cylinder':
      return new THREE.CylinderGeometry(g.radiusTop, g.radiusBottom, g.height, g.segments);
    case 'plane':
      return new THREE.PlaneGeometry(g.width, g.height);
  }
}

export function geometryKey(g: Geometry): string {
  return JSON.stringify(g);
}
