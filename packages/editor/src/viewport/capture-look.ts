import * as THREE from 'three';

export type ShadingMode = 'flat' | 'wireframe' | 'normals' | 'material' | 'rendered';
export type OverlayKind = 'grid' | 'axes' | 'bbox' | 'ground' | 'centerline' | 'scale' | 'normal' | 'dims';

export function shadingNeedsShadows(mode?: ShadingMode): boolean {
  return mode === 'rendered';
}

function exportRoot(scene: THREE.Scene): THREE.Object3D | undefined {
  return scene.getObjectByName('vibe3d-export');
}

function unlitCopy(source: THREE.Material): THREE.MeshBasicMaterial {
  const src = source as THREE.MeshStandardMaterial;
  const material = new THREE.MeshBasicMaterial();
  if (src.color) material.color.copy(src.color);
  if (src.map) material.map = src.map;
  material.transparent = src.transparent;
  material.opacity = src.opacity;
  material.alphaTest = src.alphaTest;
  material.side = src.side;
  material.vertexColors = src.vertexColors;
  material.depthWrite = src.depthWrite;
  material.fog = false;
  return material;
}

function shadingMaterial(mode: ShadingMode, source: THREE.Material): THREE.Material {
  if (mode === 'normals') return new THREE.MeshNormalMaterial();
  if (mode === 'wireframe')
    return new THREE.MeshBasicMaterial({ color: 0x8fb7ff, wireframe: true, fog: false });
  if (mode === 'material') return unlitCopy(source);
  return new THREE.MeshBasicMaterial({ color: 0xc9d3dd, fog: false });
}

export function applyShading(scene: THREE.Scene, mode?: ShadingMode): () => void {
  if (!mode || mode === 'rendered') return () => {};
  const root = exportRoot(scene);
  if (!root) return () => {};
  const swapped: Array<{ mesh: THREE.Mesh; previous: THREE.Material | THREE.Material[] }> = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    swapped.push({ mesh, previous: mesh.material });
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((item) => shadingMaterial(mode, item))
      : shadingMaterial(mode, mesh.material);
  });
  return () => {
    for (const entry of swapped) {
      const current = entry.mesh.material;
      const next = Array.isArray(current) ? current : [current];
      for (const item of next) item.dispose();
      entry.mesh.material = entry.previous;
    }
  };
}

export function addOverlays(
  scene: THREE.Scene,
  kinds: OverlayKind[] = [],
  scope?: readonly string[],
): () => void {
  if (kinds.length === 0) return () => {};
  const root = exportRoot(scene);
  const box = scopedBox(root, scope);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 0.001);
  const added: THREE.Object3D[] = [];
  if (kinds.includes('grid')) {
    const grid = new THREE.GridHelper(span * 2, 20, 0x6f8496, 0x333f4b);
    grid.name = 'overlay:grid';
    grid.position.set(center.x, box.min.y, center.z);
    added.push(grid);
  }
  if (kinds.includes('axes')) {
    const axes = new THREE.AxesHelper(span * 0.5);
    axes.position.copy(box.min);
    const material = axes.material as THREE.LineBasicMaterial;
    material.depthTest = false;
    material.transparent = true;
    axes.renderOrder = 999;
    axes.name = 'overlay:axes';
    added.push(axes);
  }
  if (kinds.includes('bbox')) {
    const helper = new THREE.Box3Helper(box.clone(), 0x5fe3c0);
    helper.name = 'overlay:bbox';
    added.push(helper);
  }
  if (kinds.includes('ground')) added.push(groundOverlay(box, size, center));
  if (kinds.includes('centerline')) added.push(centerlineOverlay(box, center));
  if (kinds.includes('scale')) added.push(scaleOverlay(box, size, center));
  if (kinds.includes('dims')) added.push(dimsOverlay(box, size, center));
  if (kinds.includes('normal') && root) added.push(normalOverlay(root, span));
  for (const obj of added) scene.add(obj);
  return () => {
    for (const obj of added) {
      scene.remove(obj);
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        const material = mesh.material;
        if (Array.isArray(material)) {
          for (const item of material) disposeMaterial(item);
        } else if (material) {
          disposeMaterial(material);
        }
        if (!(child as THREE.Sprite).isSprite) mesh.geometry?.dispose?.();
      });
    }
  };
}

function scopedBox(root: THREE.Object3D | undefined, scope?: readonly string[]): THREE.Box3 {
  const box = new THREE.Box3();
  if (!root) return box.set(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  if (!scope || scope.length === 0) {
    box.setFromObject(root);
  } else {
    const targets = new Set(scope);
    root.updateMatrixWorld(true);
    root.traverse((obj) => {
      const id = obj.userData?.nodeId;
      if (typeof id === 'string' && targets.has(id)) box.expandByObject(obj);
    });
  }
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  return box;
}

function groundOverlay(box: THREE.Box3, size: THREE.Vector3, center: THREE.Vector3): THREE.Object3D {
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.max(size.x * 1.2, 0.2), Math.max(size.z * 1.2, 0.2)),
    new THREE.MeshBasicMaterial({
      color: 0x5fe3c0,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  plane.name = 'overlay:ground';
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(center.x, box.min.y, center.z);
  (plane.material as THREE.MeshBasicMaterial).polygonOffset = true;
  (plane.material as THREE.MeshBasicMaterial).polygonOffsetFactor = -1;
  (plane.material as THREE.MeshBasicMaterial).polygonOffsetUnits = -1;
  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(plane.geometry),
    new THREE.LineBasicMaterial({ color: 0x5fe3c0, transparent: true, opacity: 0.7 }),
  );
  plane.add(border);
  return plane;
}

function centerlineOverlay(box: THREE.Box3, center: THREE.Vector3): THREE.Object3D {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(center.x, box.min.y, center.z),
    new THREE.Vector3(center.x, box.max.y, center.z),
  ]);
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color: 0xf2b45c, transparent: true, opacity: 0.9, depthTest: false }),
  );
  line.name = 'overlay:centerline';
  line.renderOrder = 999;
  return line;
}

function disposeMaterial(material: THREE.Material): void {
  const map = (material as THREE.SpriteMaterial).map;
  map?.dispose();
  material.dispose();
}

function labelTexture(text: string, color: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const css = `#${color.toString(16).padStart(6, '0')}`;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 40px sans-serif';
  ctx.fillStyle = css;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function labelSprite(text: string, height: number, color = 0xe9eff5): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    color,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const map = labelTexture(text, color);
  if (map) material.map = map;
  const sprite = new THREE.Sprite(material);
  sprite.userData.text = text;
  const width = Math.max(text.length * height * 0.52, height);
  sprite.scale.set(width, height, 1);
  sprite.renderOrder = 999;
  return sprite;
}

function meterLabel(value: number): string {
  return `${value.toFixed(2)} m`;
}

function dimsOverlay(box: THREE.Box3, size: THREE.Vector3, center: THREE.Vector3): THREE.Object3D {
  const group = new THREE.Group();
  group.name = 'overlay:dims';
  group.userData.size = [size.x, size.y, size.z];
  const span = Math.max(size.x, size.y, size.z, 0.001);
  const height = Math.max(span * 0.05, 0.02);
  const pad = height * 1.2;
  const entries: Array<[string, number, THREE.Vector3]> = [
    ['x', size.x, new THREE.Vector3(center.x, box.min.y - pad, box.max.z)],
    ['y', size.y, new THREE.Vector3(box.max.x + pad, center.y, box.max.z)],
    ['z', size.z, new THREE.Vector3(box.max.x + pad, box.min.y - pad, center.z)],
  ];
  for (const [axis, value, position] of entries) {
    const sprite = labelSprite(meterLabel(value), height);
    sprite.name = `overlay:dims:${axis}`;
    sprite.userData.axis = axis;
    sprite.position.copy(position);
    group.add(sprite);
  }
  return group;
}

function niceLength(extent: number): number {
  const base = 10 ** Math.floor(Math.log10(Math.max(extent, 1e-6)));
  for (const mult of [5, 2, 1]) {
    if (mult * base <= extent) return mult * base;
  }
  return base;
}

function scaleOverlay(box: THREE.Box3, size: THREE.Vector3, center: THREE.Vector3): THREE.Object3D {
  const length = niceLength(Math.max(size.x, 1e-3));
  const y = box.min.y + 0.002;
  const z = center.z;
  const x0 = box.min.x;
  const group = new THREE.Group();
  group.name = 'overlay:scale';
  group.userData.length = length;
  const material = new THREE.LineBasicMaterial({ color: 0xe9eff5, depthTest: false });
  const main = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x0, y, z),
      new THREE.Vector3(x0 + length, y, z),
    ]),
    material,
  );
  main.renderOrder = 999;
  group.add(main);
  const tick = Math.max(length * 0.03, 0.005);
  for (const x of [x0, x0 + length]) {
    const end = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, y, z - tick),
        new THREE.Vector3(x, y, z + tick),
      ]),
      material,
    );
    end.renderOrder = 999;
    group.add(end);
  }
  const label = labelSprite(meterLabel(length), Math.max(length * 0.08, 0.02));
  label.name = 'overlay:scale:label';
  label.position.set(x0 + length / 2, y + tick * 3, z);
  group.add(label);
  return group;
}

function isVisibleChain(obj: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = obj;
  while (current) {
    if (!current.visible) return false;
    if (current.name === 'vibe3d-export') return true;
    current = current.parent;
  }
  return false;
}

function normalOverlay(root: THREE.Object3D, span: number): THREE.Object3D {
  const group = new THREE.Group();
  group.name = 'overlay:normal';
  const length = span * 0.04;
  const maxMeshes = 32;
  const maxPerMesh = 30;
  const positions: number[] = [];
  let meshes = 0;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (meshes >= maxMeshes || !mesh.isMesh || !isVisibleChain(mesh)) return;
    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    const pos = geometry?.getAttribute('position');
    const norm = geometry?.getAttribute('normal');
    if (!pos || !norm) return;
    meshes += 1;
    const step = Math.max(1, Math.floor(pos.count / maxPerMesh));
    for (let i = 0; i < pos.count; i += step) {
      p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      n.fromBufferAttribute(norm, i).transformDirection(mesh.matrixWorld).normalize();
      positions.push(p.x, p.y, p.z, p.x + n.x * length, p.y + n.y * length, p.z + n.z * length);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x7aa7ff }));
  lines.name = 'overlay:normal';
  group.add(lines);
  return group;
}

const HIGHLIGHT = 0xf2b45c;

function exportRootOf(scene: THREE.Scene): THREE.Object3D | undefined {
  return scene.getObjectByName('vibe3d-export');
}

function ownsTarget(mesh: THREE.Object3D, targets: Set<string>): boolean {
  let current: THREE.Object3D | null = mesh;
  while (current) {
    const id = current.userData.nodeId;
    if (typeof id === 'string' && targets.has(id)) return true;
    if (current.name === 'vibe3d-export') return false;
    current = current.parent;
  }
  return false;
}

function highlightMaterial(base: THREE.Material): THREE.Material {
  const transparent = base.transparent;
  const opacity = base.opacity;
  const material = new THREE.MeshBasicMaterial({
    color: HIGHLIGHT,
    transparent,
    opacity,
    depthTest: true,
    depthWrite: true,
  });
  return material;
}

export function applyHighlight(scene: THREE.Scene, ids: readonly string[] = []): () => void {
  if (ids.length === 0) return () => {};
  const root = exportRootOf(scene);
  if (!root) return () => {};
  const targets = new Set(ids);
  const swapped: Array<{ mesh: THREE.Mesh; previous: THREE.Material | THREE.Material[] }> = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || !ownsTarget(mesh, targets)) return;
    swapped.push({ mesh, previous: mesh.material });
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((item) => highlightMaterial(item))
      : highlightMaterial(mesh.material);
  });
  return () => {
    for (const entry of swapped) {
      const current = entry.mesh.material;
      const list = Array.isArray(current) ? current : [current];
      for (const item of list) item.dispose();
      entry.mesh.material = entry.previous;
    }
  };
}

export function applyIsolate(scene: THREE.Scene, ids: readonly string[] = []): () => void {
  if (ids.length === 0) return () => {};
  const root = exportRootOf(scene);
  if (!root) return () => {};
  const targets = new Set(ids);
  const changed: Array<{ mesh: THREE.Mesh; visible: boolean }> = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (ownsTarget(mesh, targets)) return;
    changed.push({ mesh, visible: mesh.visible });
    mesh.visible = false;
  });
  return () => {
    for (const entry of changed) entry.mesh.visible = entry.visible;
  };
}
