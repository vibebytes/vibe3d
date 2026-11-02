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

  it('puts bones back to rest once their tracks are gone', () => {
    const a = model('n_aaaaaaaa');
    const scene = new THREE.Scene();
    scene.add(a.root);
    const node = { id: 'n_aaaaaaaa', kind: 'model' } as Record<string, unknown>;
    const doc = { nodes: { n_aaaaaaaa: node } } as unknown as SceneDoc;
    node.clip = clipOn(1);
    applyFrameAnimations(scene, doc, 0.5);
    delete node.clip;
    applyFrameAnimations(scene, doc, 0.5);
    expect(a.hip.rotation.x).toBe(0);
  });
});

function meshNode(nodeId: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  mesh.userData.nodeId = nodeId;
  mesh.userData.ownsTransform = true;
  return mesh;
}

const track = (path: string, v: unknown) => ({ tracks: [{ path, interp: 'step', keys: [{ t: 0, v }] }] });

describe('visibility and opacity tracks', () => {
  it('restore visibility and the original material when the tracks are removed', () => {
    const mesh = meshNode('n_cccccccc');
    const original = mesh.material;
    const scene = new THREE.Scene();
    scene.add(mesh);
    const node = { id: 'n_cccccccc', kind: 'mesh', transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] } };
    const doc = { nodes: { n_cccccccc: node } } as unknown as SceneDoc;
    Object.assign(node, {
      clips: [track('visible', false), track('opacity', 0.3)],
    });
    applyFrameAnimations(scene, doc, 0);
    expect(mesh.visible).toBe(false);
    expect(mesh.material).not.toBe(original);
    expect((mesh.material as THREE.Material).opacity).toBeCloseTo(0.3, 9);
    Object.assign(node, { clips: [] });
    applyFrameAnimations(scene, doc, 0);
    expect(mesh.visible).toBe(true);
    expect(mesh.material).toBe(original);
    expect(original.opacity).toBe(1);
  });

  it('never writes opacity into a material swapped in by a rebuild', () => {
    const mesh = meshNode('n_dddddddd');
    const scene = new THREE.Scene();
    scene.add(mesh);
    const node = {
      id: 'n_dddddddd',
      kind: 'mesh',
      transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
      clips: [track('opacity', 0.4)],
    };
    const doc = { nodes: { n_dddddddd: node } } as unknown as SceneDoc;
    applyFrameAnimations(scene, doc, 0);
    const shared = new THREE.MeshStandardMaterial();
    mesh.material = shared;
    applyFrameAnimations(scene, doc, 0);
    expect(shared.opacity).toBe(1);
    expect((mesh.material as THREE.Material).opacity).toBeCloseTo(0.4, 9);
  });
});
