import type { SceneDoc } from '@vibebyte/vibe3d-protocol';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyFrameAnimations } from '../src/three/frame-anim';

function model(nodeId: string): { root: THREE.Group; hip: THREE.Bone } {
  const hip = new THREE.Bone();
  hip.name = 'Hips';
  const root = new THREE.Group();
  root.userData.nodeId = nodeId;
  root.add(hip);
  return { root, hip };
}

const clipOn = (x: number) => ({
  tracks: [
    {
      path: 'bone.Hips.rotation',
      keys: [
        { t: 0, v: [0, 0, 0] },
        { t: 1, v: [x, 0, 0] },
      ],
    },
  ],
});

describe('applyFrameAnimations', () => {
  it('drives bone.* tracks per node, not across models', () => {
    const a = model('n_aaaaaaaa');
    const b = model('n_bbbbbbbb');
    const scene = new THREE.Scene();
    scene.add(a.root, b.root);
    const doc = {
      nodes: {
        n_aaaaaaaa: { id: 'n_aaaaaaaa', kind: 'model', clip: clipOn(1) },
        n_bbbbbbbb: { id: 'n_bbbbbbbb', kind: 'model' },
      },
    } as unknown as SceneDoc;
    applyFrameAnimations(scene, doc, 0.5);
    expect(a.hip.rotation.x).toBeCloseTo(0.5, 9);
    expect(b.hip.rotation.x).toBe(0);
  });
});
