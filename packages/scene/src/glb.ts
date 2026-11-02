type Vec3 = [number, number, number];

export interface GlbBone {
  name: string;
  parent: number | null;
  /** Rest-pose translation relative to the parent bone (no rest rotation). */
  translation: Vec3;
}

export interface GlbMaterial {
  name: string;
  color: [number, number, number, number];
  roughness: number;
  metallic: number;
}

export interface GlbPrimitive {
  material: number;
  positions: Float32Array;
  normals: Float32Array;
  /** Four joint indices per vertex. */
  joints: Uint16Array;
  /** Four weights per vertex, summing to 1. */
  weights: Float32Array;
  indices: Uint32Array;
}

export interface SkinnedModel {
  name: string;
  bones: GlbBone[];
  materials: GlbMaterial[];
  primitives: GlbPrimitive[];
  extras?: Record<string, unknown>;
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const FLOAT = 5126;
const UNSIGNED_BYTE = 5121;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;

const pad4 = (n: number): number => (n + 3) & ~3;

class Bin {
  readonly views: Array<{ buffer: 0; byteOffset: number; byteLength: number; target?: number }> = [];
  private parts: Uint8Array[] = [];
  private length = 0;

  add(data: ArrayBufferView, target?: number): number {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.views.push({
      buffer: 0,
      byteOffset: this.length,
      byteLength: bytes.byteLength,
      ...(target ? { target } : {}),
    });
    this.parts.push(bytes);
    const padded = pad4(bytes.byteLength);
    if (padded > bytes.byteLength) this.parts.push(new Uint8Array(padded - bytes.byteLength));
    this.length += padded;
    return this.views.length - 1;
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const part of this.parts) {
      out.set(part, offset);
      offset += part.byteLength;
    }
    return out;
  }
}

function worldPositions(bones: readonly GlbBone[]): Vec3[] {
  const out: Vec3[] = [];
  for (const [i, bone] of bones.entries()) {
    if (bone.parent !== null && bone.parent >= i)
      throw new Error(`bone ${bone.name}: parent must precede child`);
    const origin: Vec3 = bone.parent === null ? [0, 0, 0] : (out[bone.parent] as Vec3);
    out.push([
      origin[0] + bone.translation[0],
      origin[1] + bone.translation[1],
      origin[2] + bone.translation[2],
    ]);
  }
  return out;
}

function bounds(positions: Float32Array): { min: number[]; max: number[] } {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      const v = positions[i + k] ?? 0;
      if (v < (min[k] ?? 0)) min[k] = v;
      if (v > (max[k] ?? 0)) max[k] = v;
    }
  }
  return { min, max };
}

/** Packs a skinned model (bind pose = bone translations only) into a binary glTF 2.0 file. */
export function toGlb(model: SkinnedModel): Uint8Array {
  const bin = new Bin();
  const accessors: Record<string, unknown>[] = [];
  const accessor = (view: number, componentType: number, count: number, type: string, extra = {}) => {
    accessors.push({ bufferView: view, componentType, count, type, ...extra });
    return accessors.length - 1;
  };
  const jointType = model.bones.length <= 256 ? UNSIGNED_BYTE : UNSIGNED_SHORT;
  const primitives = model.primitives.map((prim) => {
    const count = prim.positions.length / 3;
    const joints = jointType === UNSIGNED_BYTE ? Uint8Array.from(prim.joints) : prim.joints;
    const wide = prim.indices.some((i) => i > 0xffff);
    const indices = wide ? prim.indices : Uint16Array.from(prim.indices);
    return {
      attributes: {
        POSITION: accessor(
          bin.add(prim.positions, ARRAY_BUFFER),
          FLOAT,
          count,
          'VEC3',
          bounds(prim.positions),
        ),
        NORMAL: accessor(bin.add(prim.normals, ARRAY_BUFFER), FLOAT, count, 'VEC3'),
        JOINTS_0: accessor(bin.add(joints, ARRAY_BUFFER), jointType, count, 'VEC4'),
        WEIGHTS_0: accessor(bin.add(prim.weights, ARRAY_BUFFER), FLOAT, count, 'VEC4'),
      },
      indices: accessor(
        bin.add(indices, ELEMENT_ARRAY_BUFFER),
        wide ? UNSIGNED_INT : UNSIGNED_SHORT,
        prim.indices.length,
        'SCALAR',
      ),
      material: prim.material,
    };
  });
  const world = worldPositions(model.bones);
  const ibm = new Float32Array(model.bones.length * 16);
  for (const [i, p] of world.entries()) {
    ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -p[0], -p[1], -p[2], 1], i * 16);
  }
  const ibmAccessor = accessor(bin.add(ibm), FLOAT, model.bones.length, 'MAT4');
  const boneNode = (i: number) => i + 1;
  const nodes = [
    { name: model.name, mesh: 0, skin: 0 },
    ...model.bones.map((bone, i) => {
      const children = model.bones.flatMap((b, j) => (b.parent === i ? [boneNode(j)] : []));
      return { name: bone.name, translation: bone.translation, ...(children.length ? { children } : {}) };
    }),
  ];
  const roots = model.bones.flatMap((b, i) => (b.parent === null ? [boneNode(i)] : []));
  const json = {
    asset: { version: '2.0', generator: 'vibe3d-scene' },
    scene: 0,
    scenes: [{ nodes: [0, ...roots] }],
    nodes,
    meshes: [{ name: model.name, primitives }],
    skins: [
      {
        joints: model.bones.map((_, i) => boneNode(i)),
        inverseBindMatrices: ibmAccessor,
        skeleton: roots[0],
      },
    ],
    materials: model.materials.map((m) => ({
      name: m.name,
      pbrMetallicRoughness: {
        baseColorFactor: m.color,
        roughnessFactor: m.roughness,
        metallicFactor: m.metallic,
      },
    })),
    accessors,
    bufferViews: bin.views,
    buffers: [{ byteLength: 0 }],
    ...(model.extras ? { extras: model.extras } : {}),
  };
  const binBytes = bin.bytes();
  json.buffers[0] = { byteLength: binBytes.byteLength };
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = pad4(text.byteLength);
  const total = 12 + 8 + jsonLength + 8 + binBytes.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, CHUNK_JSON, true);
  out.set(text, 20);
  out.fill(0x20, 20 + text.byteLength, 20 + jsonLength);
  view.setUint32(20 + jsonLength, binBytes.byteLength, true);
  view.setUint32(24 + jsonLength, CHUNK_BIN, true);
  out.set(binBytes, 28 + jsonLength);
  return out;
}
