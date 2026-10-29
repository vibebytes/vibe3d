import { emptyDoc } from '@vibebyte/vibe3d-protocol';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDoc } from '../src/stores/doc';
import { captureFrame, captureIdPass } from '../src/viewport/CaptureBridge';

const bag = vi.hoisted(() => ({
  composers: [] as Array<{ disposed: boolean; gl: { renderedVia?: string } }>,
  bokeh: [] as Array<{ position: number[] }>,
  glRenders: 0,
  alphaRenders: 0,
}));

vi.mock('three/examples/jsm/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class {
    disposed = false;
    constructor(public gl: { renderedVia?: string }) {
      bag.composers.push(this);
    }
    addPass() {}
    setSize() {}
    render() {
      this.gl.renderedVia = 'composer';
    }
    dispose() {
      this.disposed = true;
    }
  },
}));

vi.mock('three/examples/jsm/postprocessing/BokehPass.js', () => ({
  BokehPass: class {
    constructor(_scene: unknown, camera: THREE.Camera) {
      bag.bokeh.push({ position: camera.position.toArray() });
    }
  },
}));

vi.mock('three/examples/jsm/postprocessing/RenderPass.js', () => ({
  RenderPass: class {},
}));

vi.mock('three/examples/jsm/postprocessing/OutputPass.js', () => ({
  OutputPass: class {},
}));

vi.mock('three/examples/jsm/postprocessing/SSAOPass.js', () => ({
  SSAOPass: class {},
}));

vi.mock('three/examples/jsm/postprocessing/UnrealBloomPass.js', () => ({
  UnrealBloomPass: class {},
}));

vi.mock('../src/viewport/alpha-cache', async () => {
  const actual = await vi.importActual<typeof import('../src/viewport/alpha-cache')>(
    '../src/viewport/alpha-cache',
  );
  return {
    ...actual,
    alphaRendererCache: () => ({
      get() {
        return {
          shadowMap: { enabled: false, type: 1 },
          toneMapping: 0,
          toneMappingExposure: 1,
          outputColorSpace: 'srgb',
          domElement: { toDataURL: () => 'data:image/png;base64,bbbb' },
          setPixelRatio: () => undefined,
          setSize: () => undefined,
          setClearAlpha: () => undefined,
          render: () => {
            bag.alphaRenders += 1;
          },
          dispose: () => undefined,
        };
      },
      release() {},
    }),
  };
});

const CAM = {
  mode: 'persp' as const,
  p: [0, 1.6, 8] as [number, number, number],
  target: [0, 1, 0] as [number, number, number],
  fov: 28,
  zoom: 1,
};

function sceneOf(): THREE.Scene {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.name = 'vibe3d-export';
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  scene.add(root);
  return scene;
}

function fakeGl() {
  return {
    shadowMap: { enabled: false, type: 1 },
    toneMapping: 0,
    toneMappingExposure: 1,
    outputColorSpace: THREE.SRGBColorSpace,
    domElement: { width: 1280, height: 720, toDataURL: () => 'data:image/png;base64,aaaa' },
    getPixelRatio: () => 1,
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    render: () => {
      bag.glRenders += 1;
    },
    getClearColor: (color: THREE.Color) => color,
    getClearAlpha: () => 1,
    setClearColor: () => undefined,
    setClearAlpha: () => undefined,
    setRenderTarget: () => undefined,
    clear: () => undefined,
    readRenderTargetPixels: () => undefined,
    dispose: () => undefined,
    renderedVia: '' as string,
  };
}

function withDof() {
  const doc = emptyDoc('dof');
  doc.stage = { ...doc.stage, post: { dof: { fStop: 2.8 } } };
  useDoc.setState({ doc });
}

describe('快照后处理门控', () => {
  beforeEach(() => {
    bag.composers.length = 0;
    bag.bokeh.length = 0;
    bag.glRenders = 0;
    bag.alphaRenders = 0;
    useDoc.setState({ doc: emptyDoc('plain') });
  });

  it('rendered 且需要后处理时，缓冲来自一次性 Composer，并用本次相机', () => {
    withDof();
    const gl = fakeGl();
    const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100);
    camera.position.set(0, 0, 20);
    captureFrame(
      gl as never,
      sceneOf(),
      camera,
      { width: 1280, height: 720 },
      {
        shading: 'rendered',
        camera: CAM,
        width: 1280,
        height: 720,
      },
    );
    expect(bag.composers).toHaveLength(1);
    expect(bag.composers[0]?.disposed).toBe(true);
    expect(gl.renderedVia).toBe('composer');
    expect(bag.glRenders).toBe(0);
    expect(bag.bokeh[0]?.position.map((n) => Math.round(n * 100) / 100)).toEqual(CAM.p);
  });

  it('transparent、id_pass、无 post 时不创建 Composer', () => {
    withDof();
    const gl = fakeGl();
    const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100);
    captureFrame(
      gl as never,
      sceneOf(),
      camera,
      { width: 1280, height: 720 },
      {
        shading: 'rendered',
        transparent: true,
        camera: CAM,
        width: 128,
        height: 72,
      },
    );
    captureIdPass(
      gl as never,
      sceneOf(),
      camera,
      { width: 1280, height: 720 },
      {
        legend: { n_hero0001: '#ff0000' },
        width: 64,
        height: 64,
      },
    );
    useDoc.setState({ doc: emptyDoc('plain') });
    captureFrame(
      gl as never,
      sceneOf(),
      camera,
      { width: 1280, height: 720 },
      {
        shading: 'rendered',
        width: 128,
        height: 72,
      },
    );
    expect(bag.composers).toHaveLength(0);
    expect(bag.alphaRenders).toBe(1);
    expect(bag.glRenders).toBeGreaterThan(0);
  });
});
