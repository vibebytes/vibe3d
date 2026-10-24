import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AnimationController } from '../src/three/anim';

function rig() {
  const root = new THREE.Object3D();
  const child = new THREE.Object3D();
  root.add(child);
  const track = new THREE.VectorKeyframeTrack('.position', [0, 2], [0, 0, 0, 1, 0, 0]);
  const clip = new THREE.AnimationClip('walk', 2, [track]);
  const controller = new AnimationController();
  controller.register('n_aaaaaaaa', root, [clip]);
  return controller;
}

describe('AnimationController 播放参数', () => {
  it('缺省循环、正向、权重 1', () => {
    const c = rig();
    c.play('n_aaaaaaaa', 'walk', { speed: 1 });
    const action = c.actionOf('n_aaaaaaaa');
    expect(action?.loop).toBe(THREE.LoopRepeat);
    expect(action?.getEffectiveWeight()).toBeCloseTo(1);
    expect(action?.getEffectiveTimeScale()).toBeCloseTo(1);
  });

  it('loop:false 单次播放并停在末帧，反向走负时间轴', () => {
    const c = rig();
    c.play('n_aaaaaaaa', 'walk', { speed: 2, loop: false, direction: 'reverse' });
    const action = c.actionOf('n_aaaaaaaa');
    expect(action?.loop).toBe(THREE.LoopOnce);
    expect(action?.clampWhenFinished).toBe(true);
    expect(action?.getEffectiveTimeScale()).toBeCloseTo(-2);
  });

  it('weight 作用到动作权重', () => {
    const c = rig();
    c.play('n_aaaaaaaa', 'walk', { weight: 0.35 });
    expect(c.actionOf('n_aaaaaaaa')?.getEffectiveWeight()).toBeCloseTo(0.35);
  });

  it('apply 读取 doc 上的 loop/direction/weight', () => {
    const c = rig();
    c.apply('n_aaaaaaaa', {
      playing: true,
      clip: 'walk',
      speed: 1.5,
      loop: false,
      direction: 'reverse',
      weight: 0.5,
    });
    const action = c.actionOf('n_aaaaaaaa');
    expect(action?.loop).toBe(THREE.LoopOnce);
    expect(action?.getEffectiveTimeScale()).toBeCloseTo(-1.5);
    expect(action?.getEffectiveWeight()).toBeCloseTo(0.5);
  });

  it('切换 clip 时停掉上一条', () => {
    const root = new THREE.Object3D();
    const controller = new AnimationController();
    const track = new THREE.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 1, 0, 0]);
    controller.register('n_aaaaaaaa', root, [
      new THREE.AnimationClip('idle', 1, [track]),
      new THREE.AnimationClip('walk', 1, [track.clone()]),
    ]);
    controller.play('n_aaaaaaaa', 'idle', {});
    controller.play('n_aaaaaaaa', 'walk', { weight: 0.7 });
    expect(controller.actionOf('n_aaaaaaaa')?.getEffectiveWeight()).toBeCloseTo(0.7);
    expect(controller.actionOf('n_aaaaaaaa')?.isRunning()).toBe(true);
  });
});
