import { AppError, type GltfReport } from '@vibebyte/vibe3d-protocol';

const MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_TRIS = 5_000_000;
const UNSUPPORTED = ['KHR_draco_mesh_compression', 'KHR_texture_basisu', 'EXT_meshopt_compression'];
const LIGHT_EXT = 'KHR_lights_punctual';

interface GltfDoc {
  asset?: { version?: string };
  scenes?: { nodes?: number[] }[];
  scene?: number;
  nodes?: {
    mesh?: number;
    children?: number[];
    matrix?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
    name?: string;
  }[];
  meshes?: { primitives?: { indices?: number; attributes?: Record<string, number> }[] }[];
  accessors?: { count?: number; type?: string; componentType?: number; min?: number[]; max?: number[] }[];
  materials?: unknown[];
  textures?: unknown[];
  images?: { uri?: string; bufferView?: number }[];
  buffers?: { uri?: string; byteLength?: number }[];
  animations?: { name?: string; channels?: unknown[]; samplers?: { input?: number }[] }[];
  skins?: unknown[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
}

export function parseGltf(bytes: Buffer, name: string): GltfReport {
  if (bytes.length > MAX_BYTES) {
    throw new AppError('E_ASSET_FORMAT', `文件超过 64 MB（${bytes.length} 字节）`);
  }
  const json = readJsonChunk(bytes, name);
  const doc = JSON.parse(json) as GltfDoc;
  const version = doc.asset?.version ?? '';
  if (!version.startsWith('2.')) {
    throw new AppError('E_ASSET_FORMAT', `只支持 glTF 2.x，当前 ${version || '未知'}`);
  }

  const extensions = doc.extensionsUsed ?? [];
  const unsupported = extensions.filter((e) => UNSUPPORTED.includes(e));
  const required = doc.extensionsRequired ?? [];
  const blocking = required.filter((e) => UNSUPPORTED.includes(e));
  if (blocking.length) {
    throw new AppError('E_ASSET_FORMAT', `依赖不支持的扩展：${blocking.join(', ')}`, {
      unsupported: blocking,
    });
  }

  const missing = externalRefs(doc);
  if (missing.length) {
    throw new AppError('E_ASSET_EXTERNAL_REFS', `glTF 非自包含，缺少：${missing.join(', ')}`, { missing });
  }

  let prims = 0;
  let tris = 0;
  for (const mesh of doc.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      prims++;
      const indices = prim.indices !== undefined ? doc.accessors?.[prim.indices] : undefined;
      if (indices?.count) {
        tris += Math.floor(indices.count / 3);
      } else {
        const attr = Object.values(prim.attributes ?? {})[0];
        const acc = attr !== undefined ? doc.accessors?.[attr] : undefined;
        if (acc?.count) tris += Math.floor(acc.count / 3);
      }
    }
  }
  if (tris > MAX_TRIS) {
    throw new AppError('E_ASSET_FORMAT', `三角面数 ${tris} 超过上限 ${MAX_TRIS}`);
  }

  const animations = (doc.animations ?? []).map((anim) => {
    const durations = (anim.samplers ?? []).map((s) => {
      const acc = s.input !== undefined ? doc.accessors?.[s.input] : undefined;
      const max = acc?.max?.[0];
      return typeof max === 'number' ? max : 0;
    });
    return {
      name: anim.name ?? '',
      durationSec: Math.max(0, ...durations),
      channels: anim.channels?.length ?? 0,
    };
  });

  const size = boundsOf(doc);
  return {
    version: '2.0',
    selfContained: true,
    missing: [],
    extensions,
    unsupported,
    meshes: doc.meshes?.length ?? 0,
    prims,
    tris,
    materials: doc.materials?.length ?? 0,
    textures: doc.textures?.length ?? 0,
    animations,
    skins: doc.skins?.length ?? 0,
    size,
    heroGuess: animations.length ? 'animated' : 'static',
  };
}

function readJsonChunk(bytes: Buffer, name: string): string {
  if (bytes.length >= 12 && bytes.readUInt32LE(0) === MAGIC) {
    if (bytes.length < 20) throw new AppError('E_ASSET_FORMAT', 'GLB 头部被截断');
    const declared = bytes.readUInt32LE(8);
    if (declared > bytes.length) throw new AppError('E_ASSET_FORMAT', 'GLB 声明长度超出实际字节数');
    const length = bytes.readUInt32LE(12);
    const type = bytes.readUInt32LE(16);
    if (type !== JSON_CHUNK) throw new AppError('E_ASSET_FORMAT', 'GLB 首个 chunk 不是 JSON');
    if (20 + length > bytes.length) throw new AppError('E_ASSET_FORMAT', 'GLB JSON chunk 被截断');
    return bytes
      .subarray(20, 20 + length)
      .toString('utf8')
      .trim();
  }
  const text = bytes.toString('utf8').trim();
  if (text.startsWith('{')) return text;
  throw new AppError('E_ASSET_FORMAT', `${name} 既不是 GLB 也不是 glTF JSON`);
}

function externalRefs(doc: GltfDoc): string[] {
  const missing: string[] = [];
  for (const buf of doc.buffers ?? []) {
    if (buf.uri && !buf.uri.startsWith('data:')) missing.push(buf.uri);
  }
  for (const img of doc.images ?? []) {
    if (img.uri && !img.uri.startsWith('data:')) missing.push(img.uri);
  }
  return missing;
}

function boundsOf(doc: GltfDoc): GltfReport['size'] {
  const min: [number, number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  const max: [number, number, number] = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  let found = false;
  const walk = (index: number, offset: [number, number, number]): void => {
    const node = doc.nodes?.[index];
    if (!node) return;
    const t = node.translation ?? [0, 0, 0];
    const p: [number, number, number] = [
      offset[0] + (t[0] ?? 0),
      offset[1] + (t[1] ?? 0),
      offset[2] + (t[2] ?? 0),
    ];
    const mesh = node.mesh !== undefined ? doc.meshes?.[node.mesh] : undefined;
    for (const prim of mesh?.primitives ?? []) {
      const attr = prim.attributes?.POSITION;
      const acc = attr !== undefined ? doc.accessors?.[attr] : undefined;
      if (!acc?.min || !acc.max) continue;
      found = true;
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i] ?? 0, (acc.min[i] ?? 0) + (p[i] ?? 0));
        max[i] = Math.max(max[i] ?? 0, (acc.max[i] ?? 0) + (p[i] ?? 0));
      }
    }
    for (const child of node.children ?? []) walk(child, p);
  };
  const roots = doc.scenes?.[doc.scene ?? 0]?.nodes ?? doc.nodes?.map((_, i) => i) ?? [];
  for (const root of roots) walk(root, [0, 0, 0]);
  if (!found) return { min: [0, 0, 0], max: [0, 0, 0], diag: 0 };
  const diag = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  return { min, max, diag };
}
