import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import type {
  LightNode,
  Material,
  MeshNode,
  ModelNode,
  SceneDoc,
  SceneNode,
} from '@vibebyte/vibe3d-protocol';
import { type ComponentRef, type ReactNode, Suspense, useEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { assetUrl } from '../lib/rpc';
import { useSelection } from '../stores/selection';
import { animations } from '../three/anim';
import { buildMesh, disposeMesh } from '../three/build';
import { animationClips, cloneGltfScene, gltfLoader } from '../three/gltf';
import { rgbaHex } from '../three/materials';
import { pickAt } from '../three/picking';
import { applyRenderer, canvasGlOptions } from '../three/renderer';
import { applyStage, backgroundHex, stageLights } from '../three/stage';
import { Gizmo } from './Gizmo';
import { GridFloor } from './GridFloor';
import { SelectionOutline } from './SelectionOutline';

function MeshView({ node, material }: { node: MeshNode; material: Material | undefined }) {
  const mesh = useMemo(() => buildMesh(node, material), [node, material]);
  useEffect(() => () => disposeMesh(mesh), [mesh]);
  return <primitive object={mesh} />;
}

function ModelView({ node }: { node: ModelNode }) {
  const gltf = useLoader(gltfLoader(), assetUrl(node.sha));
  const scene = useMemo(() => {
    const cloned = cloneGltfScene(gltf);
    cloned.userData.nodeId = node.id;
    return cloned;
  }, [gltf, node.id]);

  useEffect(() => {
    animations.register(node.id, scene, animationClips(gltf));
    animations.apply(node.id, node.anim);
    return () => animations.unregister(node.id);
  }, [node.id, node.anim, scene, gltf]);

  return <primitive object={scene} />;
}

function LightView({ node }: { node: LightNode }) {
  const spec = node.light;
  const color = rgbaHex(spec.color);
  const pos = spec.position ?? [0, 2, 0];
  if (spec.type === 'ambient') return <ambientLight color={color} intensity={spec.intensity} />;
  if (spec.type === 'directional')
    return (
      <directionalLight
        color={color}
        intensity={spec.intensity}
        position={pos}
        castShadow={spec.castShadow}
      />
    );
  if (spec.type === 'spot')
    return (
      <spotLight
        color={color}
        intensity={spec.intensity}
        position={pos}
        angle={spec.angle ?? Math.PI / 6}
        penumbra={spec.penumbra ?? 0.4}
        castShadow={spec.castShadow}
      />
    );
  return <pointLight color={color} intensity={spec.intensity} position={pos} castShadow={spec.castShadow} />;
}

function NodeView({ node, doc }: { node: SceneNode; doc: SceneDoc }) {
  const [px, py, pz] = node.transform.p;
  const [rx, ry, rz] = node.transform.r;
  const [sx, sy, sz] = node.transform.s;
  return (
    <group
      position={[px, py, pz]}
      rotation={[rx, ry, rz]}
      scale={[sx, sy, sz]}
      visible={node.visible}
      name={node.name}
      userData={{ nodeId: node.id }}
    >
      {node.kind === 'mesh' && <MeshView node={node} material={doc.materials[node.material]} />}
      {node.kind === 'light' && <LightView node={node} />}
      {node.kind === 'model' && (
        <Suspense fallback={null}>
          <ModelView node={node} />
        </Suspense>
      )}
      {node.kind === 'group' &&
        Object.values(doc.nodes)
          .filter((n) => n.parent === node.id)
          .map((n) => <NodeView key={n.id} node={n} doc={doc} />)}
    </group>
  );
}

function StageLights({ doc }: { doc: SceneDoc }) {
  return (
    <>
      {stageLights(doc.stage.preset).map((light, i) =>
        light.type === 'ambient' ? (
          <ambientLight
            key={`${light.type}:${light.color}:${light.intensity}`}
            color={light.color}
            intensity={light.intensity}
          />
        ) : (
          <directionalLight
            key={`${light.type}:${i}:${light.color}`}
            color={light.color}
            intensity={light.intensity}
            position={light.position ?? [4, 6, 3]}
            castShadow={light.castShadow}
          />
        ),
      )}
    </>
  );
}

function StageEffects({ doc, headless }: { doc: SceneDoc; headless: boolean }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    applyRenderer(gl, { headless });
    applyStage(gl, doc.stage, doc.env);
  }, [gl, headless, doc.stage, doc.env]);
  return null;
}

function AnimationDriver({ enabled }: { enabled: boolean }) {
  useFrame((_, delta) => {
    if (enabled) animations.update(delta);
  });
  return null;
}

function Picking({ enabled }: { enabled: boolean }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    if (!enabled) return;
    const el = gl.domElement;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      const start = down;
      down = null;
      if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return;
      const hit = pickAt(scene, camera, e.clientX, e.clientY, el);
      useSelection.getState().select(hit ? hit.id : null, { additive: e.shiftKey });
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
    };
  }, [enabled, gl, camera, scene]);

  return null;
}

function CameraRig({ doc }: { doc: SceneDoc }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const [px, py, pz] = doc.camera.p;
  const [tx, ty, tz] = doc.camera.target;
  useEffect(() => {
    camera.position.set(px, py, pz);
    camera.fov = doc.camera.fov;
    camera.zoom = doc.camera.mode === 'ortho' ? doc.camera.zoom : 1;
    camera.updateProjectionMatrix();
    const ctl = controls.current;
    if (ctl) {
      ctl.target.set(tx, ty, tz);
      ctl.update();
    }
  }, [camera, px, py, pz, tx, ty, tz, doc.camera.fov, doc.camera.mode, doc.camera.zoom]);
  return (
    <OrbitControls ref={controls} makeDefault target={[tx, ty, tz]} enableDamping dampingFactor={0.12} />
  );
}

export function SceneCanvas({
  doc,
  headless = false,
  children,
}: { doc: SceneDoc; headless?: boolean; children?: ReactNode }) {
  const ids = useMemo(() => new Set(Object.keys(doc.nodes)), [doc.nodes]);
  const roots = doc.roots.filter((id) => ids.has(id));

  return (
    <div className="viewport h-full w-full">
      <Canvas
        shadows
        dpr={headless ? 1 : [1, 2]}
        frameloop="always"
        camera={{ position: doc.camera.p, fov: doc.camera.fov, near: 0.05, far: 500 }}
        gl={canvasGlOptions({ headless })}
      >
        <color attach="background" args={[backgroundHex(doc.env)]} />
        <fog attach="fog" args={[backgroundHex(doc.env), 18, 42]} />
        <StageLights doc={doc} />
        <StageEffects doc={doc} headless={headless} />
        <AnimationDriver enabled={!headless} />
        <Picking enabled={!headless} />
        <group name="vibe3d-export">
          {roots.map((id) => {
            const node = doc.nodes[id];
            return node ? <NodeView key={id} node={node} doc={doc} /> : null;
          })}
        </group>
        <GridFloor visible={doc.stage.ground} />
        <SelectionOutline enabled={!headless} />
        <Gizmo enabled={!headless} />
        <CameraRig doc={doc} />
        {children}
      </Canvas>
    </div>
  );
}
