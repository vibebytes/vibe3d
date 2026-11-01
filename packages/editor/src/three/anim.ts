import type { ClipSpec, ModelAnim, SceneDoc } from '@vibebyte/vibe3d-protocol';
import { applyNodeClips, boneTracksOf, nodeClipsOf, sampleTrack } from '@vibebyte/vibe3d-scene';
import * as THREE from 'three';

interface Entry {
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current: string | null;
  active: string[];
}

interface PlayOpts {
  speed?: number;
  loop?: boolean;
  direction?: 'forward' | 'reverse';
  weight?: number;
}

export class AnimationController {
  private entries = new Map<string, Entry>();

  register(nodeId: string, root: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    if (this.entries.has(nodeId) || clips.length === 0) return;
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of clips) actions.set(clip.name, mixer.clipAction(clip));
    this.entries.set(nodeId, { mixer, actions, current: null, active: [] });
  }

  apply(nodeId: string, anim: ModelAnim | undefined): void {
    if (!anim || !anim.playing) {
      this.stop(nodeId);
      return;
    }
    const clip = anim.clip ?? this.clipOf(nodeId);
    if (!clip) return;
    this.play(nodeId, anim.clips ?? clip, {
      speed: anim.speed,
      loop: anim.loop,
      direction: anim.direction,
      weight: anim.weight,
    });
  }

  actionOf(nodeId: string): THREE.AnimationAction | undefined {
    const entry = this.entries.get(nodeId);
    if (!entry?.current) return undefined;
    return entry.actions.get(entry.current);
  }

  clipOf(nodeId: string): string | null {
    const entry = this.entries.get(nodeId);
    if (!entry) return null;
    return entry.actions.keys().next().value ?? null;
  }

  clipNames(nodeId: string): string[] {
    return [...(this.entries.get(nodeId)?.actions.keys() ?? [])];
  }

  play(nodeId: string, clip?: string | string[], opts: PlayOpts = {}): void {
    const entry = this.entries.get(nodeId);
    if (!entry) return;
    const names = (Array.isArray(clip) ? clip : clip ? [clip] : []).filter((name) => entry.actions.has(name));
    if (names.length === 0) {
      const fallback = this.clipOf(nodeId);
      if (!fallback) return;
      names.push(fallback);
    }
    for (const name of entry.actions.keys()) {
      if (!names.includes(name)) entry.actions.get(name)?.stop();
    }
    const speed = opts.speed ?? 1;
    const once = opts.loop === false;
    const weight = opts.weight ?? (names.length > 1 ? 1 / names.length : 1);
    for (const name of names) {
      const action = entry.actions.get(name);
      if (!action) continue;
      action.reset();
      action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Number.POSITIVE_INFINITY);
      action.clampWhenFinished = once;
      action.setEffectiveTimeScale(opts.direction === 'reverse' ? -speed : speed);
      action.setEffectiveWeight(weight);
      action.play();
    }
    entry.current = names[0] ?? null;
    entry.active = names;
  }

  stop(nodeId: string): void {
    const entry = this.entries.get(nodeId);
    if (!entry) return;
    for (const name of entry.active) entry.actions.get(name)?.stop();
    entry.active = [];
    entry.current = null;
  }

  setSpeed(nodeId: string, speed: number): void {
    const entry = this.entries.get(nodeId);
    const name = entry?.current;
    if (!entry || !name) return;
    entry.actions.get(name)?.setEffectiveTimeScale(speed);
  }

  seekAll(seconds: number): void {
    for (const entry of this.entries.values()) entry.mixer.setTime(seconds);
  }

  seek(nodeId: string, seconds: number): void {
    const entry = this.entries.get(nodeId);
    const name = entry?.current;
    if (!entry || !name) return;
    entry.mixer.setTime(seconds);
  }

  update(delta: number): void {
    for (const entry of this.entries.values()) entry.mixer.update(delta);
  }

  unregister(nodeId: string): void {
    const entry = this.entries.get(nodeId);
    if (!entry) return;
    entry.mixer.stopAllAction();
    entry.mixer.uncacheRoot(entry.mixer.getRoot() as THREE.Object3D);
    this.entries.delete(nodeId);
  }

  dispose(): void {
    for (const id of [...this.entries.keys()]) this.unregister(id);
  }
}

export const animations = new AnimationController();

interface BaseTransform {
  p: [number, number, number];
  r: [number, number, number];
  s: [number, number, number];
}

export function clipsOf(doc: Pick<SceneDoc, 'nodes'>): Record<string, ClipSpec[]> {
  const out: Record<string, ClipSpec[]> = {};
  for (const [id, node] of Object.entries(doc.nodes ?? {})) {
    const clips = nodeClipsOf(node);
    if (clips.length > 0) out[id] = clips;
  }
  return out;
}

const BASES = new WeakMap<THREE.Object3D, BaseTransform>();

function baseOf(obj: THREE.Object3D): BaseTransform {
  const cached = BASES.get(obj);
  if (cached) return cached;
  const base: BaseTransform = {
    p: [obj.position.x, obj.position.y, obj.position.z],
    r: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
    s: [obj.scale.x, obj.scale.y, obj.scale.z],
  };
  BASES.set(obj, base);
  return base;
}

export function clipBasesOf(doc: Pick<SceneDoc, 'nodes'>): Record<string, BaseTransform> {
  const out: Record<string, BaseTransform> = {};
  for (const [id, node] of Object.entries(doc.nodes ?? {})) {
    if (node?.transform) out[id] = node.transform;
  }
  return out;
}

const BONE_BASES = new WeakMap<THREE.Object3D, BaseTransform>();

function boneBaseOf(obj: THREE.Object3D): BaseTransform {
  const cached = BONE_BASES.get(obj);
  if (cached) return cached;
  const base: BaseTransform = {
    p: [obj.position.x, obj.position.y, obj.position.z],
    r: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
    s: [obj.scale.x, obj.scale.y, obj.scale.z],
  };
  BONE_BASES.set(obj, base);
  return base;
}

export function applyBoneTracks(root: THREE.Object3D, clips: ClipSpec[], time: number): void {
  const bones = new Map<string, THREE.Object3D>();
  root.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) bones.set(obj.name, obj);
  });
  if (bones.size === 0) return;
  for (const clip of clips) {
    for (const { bone, property, track } of boneTracksOf(clip)) {
      const obj = bones.get(bone);
      if (!obj) continue;
      const value = sampleTrack(track, time);
      if (!Array.isArray(value)) continue;
      const base = boneBaseOf(obj);
      const out = { p: [...base.p], r: [...base.r], s: [...base.s] } as BaseTransform;
      out[property === 'rotation' ? 'r' : property === 'position' ? 'p' : 's'] = value;
      obj.position.set(out.p[0], out.p[1], out.p[2]);
      obj.rotation.set(out.r[0], out.r[1], out.r[2]);
      obj.scale.set(out.s[0], out.s[1], out.s[2]);
    }
  }
}

export function applyProceduralClips(
  root: THREE.Object3D,
  clips: Record<string, ClipSpec[]>,
  time: number,
  bases?: Record<string, BaseTransform>,
): void {
  root.traverse((obj) => {
    const nodeId = obj.userData.nodeId as string | undefined;
    if (!nodeId || !obj.userData.ownsTransform) return;
    const nodeClips = clips[nodeId];
    const declared = bases?.[nodeId];
    if (!nodeClips || nodeClips.length === 0) {
      const base = declared ?? (BASES.has(obj) ? baseOf(obj) : undefined);
      if (!base) return;
      obj.position.set(...base.p);
      obj.rotation.set(...base.r);
      obj.scale.set(...base.s);
      BASES.delete(obj);
      return;
    }
    const base = declared ?? baseOf(obj);
    const out = applyNodeClips({ p: base.p, r: base.r, s: base.s }, nodeClips, time);
    obj.position.set(out.p[0], out.p[1], out.p[2]);
    obj.rotation.set(out.r[0], out.r[1], out.r[2]);
    obj.scale.set(out.s[0], out.s[1], out.s[2]);
  });
}
