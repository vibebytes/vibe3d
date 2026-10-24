import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { type PostPlan, needsPost, postPasses, toneMappingOf } from '../three/post';

function buildComposer(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  plan: PostPlan,
  width: number,
  height: number,
): EffectComposer {
  const composer = new EffectComposer(gl);
  composer.setSize(width, height);
  for (const kind of postPasses(plan)) {
    if (kind === 'render') composer.addPass(new RenderPass(scene, camera));
    else if (kind === 'ssao' && plan.ssao) {
      const pass = new SSAOPass(scene, camera, width, height);
      // kernelRadius is in world units, the stage value is a normalised dial
      pass.kernelRadius = 8 * plan.ssao.radius * Math.max(0.2, plan.ssao.intensity);
      composer.addPass(pass);
    } else if (kind === 'dof' && plan.dof) {
      composer.addPass(
        new BokehPass(scene, camera, {
          focus: plan.dof.focus,
          aperture: plan.dof.aperture,
          maxblur: plan.dof.maxBlur,
        }),
      );
    } else if (kind === 'bloom' && plan.bloom) {
      composer.addPass(
        new UnrealBloomPass(
          new THREE.Vector2(width, height),
          plan.bloom.strength,
          plan.bloom.radius,
          plan.bloom.threshold,
        ),
      );
    } else if (kind === 'output') composer.addPass(new OutputPass());
  }
  return composer;
}

export function PostPipeline({ plan }: { plan: PostPlan | null }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const active = needsPost(plan);
  const key = active && plan ? JSON.stringify(plan) : '';

  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuild on plan key / camera; resize via setSize
  const composer = useMemo(() => {
    if (!active || !plan) return null;
    return buildComposer(gl, scene, camera, plan, size.width, size.height);
  }, [gl, scene, camera, key]);

  useEffect(() => composer?.setSize(size.width, size.height), [composer, size.width, size.height]);

  useEffect(() => {
    gl.toneMapping = plan ? toneMappingOf(plan.tonemap) : THREE.ACESFilmicToneMapping;
  }, [gl, plan]);

  useEffect(() => () => composer?.dispose(), [composer]);

  useFrame(
    () => {
      if (composer) composer.render();
    },
    composer ? 1 : 0,
  );

  return null;
}
