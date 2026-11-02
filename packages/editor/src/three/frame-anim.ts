import type { SceneDoc } from '@vibebyte/vibe3d-protocol';
import type * as THREE from 'three';
import { applyBoneTracks, applyProceduralClips, clipBasesOf, clipsOf } from './anim';

/** Models whose bones were posed, so they are put back to rest once their tracks go away. */
const POSED = new WeakSet<THREE.Object3D>();

/** Poses every animated node of the scene at time t: transforms, visibility/opacity and glTF bones. */
export function applyFrameAnimations(scene: THREE.Object3D, doc: Pick<SceneDoc, 'nodes'>, t: number): void {
  const clips = clipsOf(doc);
  applyProceduralClips(scene, clips, t, clipBasesOf(doc));
  scene.traverse((obj) => {
    const nodeId = obj.userData?.nodeId as string | undefined;
    const own = nodeId ? clips[nodeId] : undefined;
    if (own) POSED.add(obj);
    else if (!POSED.has(obj)) return;
    applyBoneTracks(obj, own ?? [], t);
    if (!own) POSED.delete(obj);
  });
}
