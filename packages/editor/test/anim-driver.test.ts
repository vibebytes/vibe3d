import type { ClipSpec, SceneDoc } from '@vibebyte/vibe3d-protocol';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyProceduralClips, clipsOf } from '../src/three/anim';

function obj(id: string, p: [number, number, number] = [0, 0, 0]) {
  const o = new THREE.Object3D();
  o.userData.nodeId = id;
  o.position.set(p[0], p[1], p[2]);
  return o;
}

describe('applyProceduralClips', () => {
  it('applies a clip only to its own node', () => {
    const a = obj('n_aaaaaaaa');
    const b = obj('n_bbbbbbbb');
    const root = new THREE.Object3D();
    root.add(a, b);
    const clips: Record<string, ClipSpec> = {
      n_aaaaaaaa: { type: 'float', channel: 'py', amplitude: 2, frequency: 0.25 },
    };
    applyProceduralClips(root, clips, 1);
    expect(a.position.y).toBeCloseTo(2);
    expect(b.position.y).toBe(0);
  });

  it('leaves nodes without a clip untouched', () => {
    const a = obj('n_aaaaaaaa', [1, 2, 3]);
    const root = new THREE.Object3D();
    root.add(a);
    applyProceduralClips(root, {}, 0.7);
    expect([a.position.x, a.position.y, a.position.z]).toEqual([1, 2, 3]);
  });

  it('is deterministic for the same time', () => {
    const a = obj('n_aaaaaaaa');
    const root = new THREE.Object3D();
    root.add(a);
    const clips: Record<string, ClipSpec> = {
      n_aaaaaaaa: { type: 'sway', amplitude: 0.3, frequency: 0.5 },
    };
    applyProceduralClips(root, clips, 0.4);
    const first = a.quaternion.z;
    applyProceduralClips(root, clips, 0.4);
    expect(a.quaternion.z).toBeCloseTo(first);
  });

  it('restores the base transform when the clip is removed', () => {
    const a = obj('n_aaaaaaaa', [1, 2, 3]);
    const root = new THREE.Object3D();
    root.add(a);
    applyProceduralClips(
      root,
      { n_aaaaaaaa: { type: 'float', channel: 'py', amplitude: 3, frequency: 0.25 } },
      1,
    );
    expect(a.position.y).toBeCloseTo(5);
    applyProceduralClips(root, {}, 1);
    expect(a.position.y).toBeCloseTo(2);
  });
});

describe('clipsOf', () => {
  it('collects clips keyed by node id and skips nodes without one', () => {
    const doc = {
      nodes: {
        n_aaaaaaaa: { id: 'n_aaaaaaaa', clip: { type: 'sway', amplitude: 0.2 } },
        n_bbbbbbbb: { id: 'n_bbbbbbbb' },
      },
    } as unknown as SceneDoc;
    expect(clipsOf(doc)).toEqual({ n_aaaaaaaa: { type: 'sway', amplitude: 0.2 } });
  });

  it('returns an empty map for a doc without clips', () => {
    expect(clipsOf({ nodes: {} } as unknown as SceneDoc)).toEqual({});
  });
});
