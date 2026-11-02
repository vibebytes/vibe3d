import type { SceneDoc } from '@vibebyte/vibe3d-protocol';
import type * as THREE from 'three';
import { applyBoneTracks, applyProceduralClips, clipBasesOf, clipsOf } from './anim';

/** Poses every animated node of the scene at time t: transforms, visibility/opacity and glTF bones. */
export function applyFrameAnimations(scene: THREE.Object3D, doc: Pick<SceneDoc, 'nodes'>, t: number): void {
  const clips = clipsOf(doc);
  if (Object.keys(clips).length === 0) return;
  applyProceduralClips(scene, clips, t, clipBasesOf(doc));
  scene.traverse((obj) => {
    const nodeId = obj.userData?.nodeId as string | undefined;
    const own = nodeId ? clips[nodeId] : undefined;
    if (own) applyBoneTracks(obj, own, t);
  });
}
