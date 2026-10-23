import type { ModelAnim } from '@vibebyte/vibe3d-protocol';
import * as THREE from 'three';

interface Entry {
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current: string | null;
}

export class AnimationController {
  private entries = new Map<string, Entry>();

  register(nodeId: string, root: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    if (this.entries.has(nodeId) || clips.length === 0) return;
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of clips) actions.set(clip.name, mixer.clipAction(clip));
    this.entries.set(nodeId, { mixer, actions, current: null });
  }

  apply(nodeId: string, anim: ModelAnim | undefined): void {
    if (!anim || !anim.playing) {
      this.stop(nodeId);
      return;
    }
    const clip = anim.clip ?? this.clipOf(nodeId);
    if (!clip) return;
    this.play(nodeId, clip, anim.speed);
  }

  clipOf(nodeId: string): string | null {
    const entry = this.entries.get(nodeId);
    if (!entry) return null;
    return entry.actions.keys().next().value ?? null;
  }

  clipNames(nodeId: string): string[] {
    return [...(this.entries.get(nodeId)?.actions.keys() ?? [])];
  }

  play(nodeId: string, clip?: string, speed = 1): void {
    const entry = this.entries.get(nodeId);
    if (!entry) return;
    const name = clip ?? this.clipOf(nodeId);
    if (!name) return;
    const action = entry.actions.get(name);
    if (!action) return;
    if (entry.current && entry.current !== name) entry.actions.get(entry.current)?.stop();
    action.reset().setEffectiveTimeScale(speed).play();
    entry.current = name;
  }

  stop(nodeId: string): void {
    const entry = this.entries.get(nodeId);
    if (!entry) return;
    if (entry.current) entry.actions.get(entry.current)?.stop();
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
