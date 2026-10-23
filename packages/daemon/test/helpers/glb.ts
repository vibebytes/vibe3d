export function gltfDoc(
  opts: {
    animations?: string[];
    min?: number[];
    max?: number[];
    skinned?: boolean;
    extra?: Record<string, unknown>;
  } = {},
) {
  const min = opts.min ?? [0, 0, 0];
  const max = opts.max ?? [1, 1.5, 1];
  const doc: Record<string, unknown> = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'mesh0', ...(opts.skinned ? { skin: 0 } : {}) }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { count: 3, type: 'VEC3', componentType: 5126, min, max },
      { count: 3, type: 'SCALAR', componentType: 5125 },
    ],
    materials: [{}],
    textures: [],
    ...(opts.skinned ? { skins: [{ joints: [0] }] } : {}),
    animations: (opts.animations ?? []).map((name) => ({
      name,
      channels: [{}, {}],
      samplers: [{ input: 0 }],
    })),
    ...opts.extra,
  };
  return doc;
}

export function gltfJson(opts: Parameters<typeof gltfDoc>[0] = {}): Buffer {
  return Buffer.from(JSON.stringify(gltfDoc(opts)));
}

export function glb(opts: Parameters<typeof gltfDoc>[0] = {}, version = 2): Buffer {
  const json = Buffer.from(JSON.stringify(gltfDoc(opts)));
  const pad = Buffer.alloc((4 - (json.length % 4)) % 4, 0x20);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(version, 4);
  header.writeUInt32LE(20 + json.length + pad.length, 8);
  header.writeUInt32LE(json.length + pad.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, json, pad]);
}

export function pngBase64(width = 2, height = 3): string {
  const bytes = Buffer.alloc(24);
  bytes.writeUInt32BE(0x89504e47, 0);
  bytes.writeUInt32BE(13, 4);
  bytes.write('IHDR', 8, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes.toString('base64');
}
