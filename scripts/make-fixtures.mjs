import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARRAY_BUFFER,
  BinBuilder,
  ELEMENT_ARRAY_BUFFER,
  FLOAT,
  QUAT,
  SCALAR,
  UBYTE,
  USHORT,
  VEC2,
  VEC3,
  accessor,
  checkerPng,
  f32,
  packGlb,
  u16,
} from './lib/glb.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'fixtures', 'assets');

function boxData(size = 1) {
  const h = size / 2;
  const faces = [
    {
      n: [0, 0, 1],
      v: [
        [-h, -h, h],
        [h, -h, h],
        [h, h, h],
        [-h, h, h],
      ],
    },
    {
      n: [0, 0, -1],
      v: [
        [h, -h, -h],
        [-h, -h, -h],
        [-h, h, -h],
        [h, h, -h],
      ],
    },
    {
      n: [1, 0, 0],
      v: [
        [h, -h, h],
        [h, -h, -h],
        [h, h, -h],
        [h, h, h],
      ],
    },
    {
      n: [-1, 0, 0],
      v: [
        [-h, -h, -h],
        [-h, -h, h],
        [-h, h, h],
        [-h, h, -h],
      ],
    },
    {
      n: [0, 1, 0],
      v: [
        [-h, h, h],
        [h, h, h],
        [h, h, -h],
        [-h, h, -h],
      ],
    },
    {
      n: [0, -1, 0],
      v: [
        [-h, -h, -h],
        [h, -h, -h],
        [h, -h, h],
        [-h, -h, h],
      ],
    },
  ];
  const pos = [];
  const nrm = [];
  const uv = [];
  const idx = [];
  faces.forEach((f, i) => {
    for (const v of f.v) {
      pos.push(...v);
      nrm.push(...f.n);
    }
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  return { pos, nrm, uv, idx };
}

function sphereData(radius = 0.5, stacks = 16, slices = 24) {
  const pos = [];
  const nrm = [];
  const uv = [];
  const idx = [];
  for (let y = 0; y <= stacks; y++) {
    const v = y / stacks;
    const phi = v * Math.PI;
    for (let x = 0; x <= slices; x++) {
      const u = x / slices;
      const theta = u * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      pos.push(nx * radius, ny * radius, nz * radius);
      nrm.push(nx, ny, nz);
      uv.push(u, 1 - v);
    }
  }
  for (let y = 0; y < stacks; y++) {
    for (let x = 0; x < slices; x++) {
      const a = y * (slices + 1) + x;
      const b = a + slices + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return { pos, nrm, uv, idx };
}

function mesh(head, data, extra = {}) {
  const bin = new BinBuilder();
  const views = {
    pos: bin.add(f32(data.pos), ARRAY_BUFFER),
    nrm: bin.add(f32(data.nrm), ARRAY_BUFFER),
    uv: bin.add(f32(data.uv), ARRAY_BUFFER),
    idx: bin.add(u16(data.idx), ELEMENT_ARRAY_BUFFER),
  };
  const accessors = [
    accessor(views.pos, FLOAT, data.pos.length / 3, VEC3, {
      min: bounds(data.pos).min,
      max: bounds(data.pos).max,
    }),
    accessor(views.nrm, FLOAT, data.nrm.length / 3, VEC3),
    accessor(views.uv, FLOAT, data.uv.length / 2, VEC2),
    accessor(views.idx, USHORT, data.idx.length, SCALAR),
  ];
  const primitive = {
    attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
    indices: 3,
    material: 0,
    ...extra,
  };
  return { bin, json: { ...head, accessors, meshes: [{ primitives: [primitive] }] } };
}

function bounds(pos) {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[i + k]);
      max[k] = Math.max(max[k], pos[i + k]);
    }
  }
  return { min, max };
}

function base(extra = {}) {
  return {
    asset: { version: '2.0', generator: 'vibe3d fixtures generator' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Root' }],
    ...extra,
  };
}

function texturizedBox() {
  const png = checkerPng(64, 8);
  const data = boxData(1);
  const built = mesh(base(), data);
  const imageView = built.bin.add(png);
  built.json.bufferViews = built.bin.views;
  built.json.buffers = [{ byteLength: built.bin.offset }];
  built.json.images = [{ mimeType: 'image/png', bufferView: imageView }];
  built.json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
  built.json.textures = [{ sampler: 0, source: 0 }];
  built.json.materials = [
    {
      name: 'checker',
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.8 },
    },
  ];
  return packGlb(built.json, built.bin.buffer());
}

function pbrSphere() {
  const built = mesh(base(), sphereData(0.5));
  built.json.bufferViews = built.bin.views;
  built.json.buffers = [{ byteLength: built.bin.offset }];
  built.json.materials = [
    {
      name: 'brushed-steel',
      pbrMetallicRoughness: {
        baseColorFactor: [0.72, 0.74, 0.78, 1],
        metallicFactor: 1,
        roughnessFactor: 0.35,
      },
    },
  ];
  return packGlb(built.json, built.bin.buffer());
}

function skinnedWalk() {
  const pos = [
    -0.2, 0, 0, 0.2, 0, 0, 0.2, 0.5, 0, -0.2, 0.5, 0, -0.2, 1, 0, 0.2, 1, 0, 0.2, 1.5, 0, -0.2, 1.5, 0,
  ];
  const nrm = new Array(24).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0));
  const uv = [0, 0, 1, 0, 1, 0.33, 0, 0.33, 0, 0.66, 1, 0.66, 1, 1, 0, 1];
  const joints = new Array(8).fill(0).flatMap((_, i) => [i < 4 ? 0 : 1, 0, 0, 0]);
  const weights = new Array(8).fill(0).flatMap(() => [1, 0, 0, 0]);
  const idx = [0, 1, 2, 0, 2, 3, 3, 2, 4, 3, 4, 5, 4, 6, 7, 4, 5, 6];
  const bin = new BinBuilder();
  const v = {
    pos: bin.add(f32(pos), ARRAY_BUFFER),
    nrm: bin.add(f32(nrm), ARRAY_BUFFER),
    uv: bin.add(f32(uv), ARRAY_BUFFER),
    joints: bin.add(Buffer.from(joints), ARRAY_BUFFER),
    weights: bin.add(f32(weights), ARRAY_BUFFER),
    idx: bin.add(u16(idx), ELEMENT_ARRAY_BUFFER),
    ibm: bin.add(
      f32([
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -0.75, 0, 1,
      ]),
      ARRAY_BUFFER,
    ),
    time: bin.add(f32([0, 0.33, 0.66, 1]), ARRAY_BUFFER),
  };
  const json = base();
  json.accessors = [
    accessor(v.pos, FLOAT, 8, VEC3, { min: [-0.2, 0, 0], max: [0.2, 1.5, 0] }),
    accessor(v.nrm, FLOAT, 8, VEC3),
    accessor(v.uv, FLOAT, 8, VEC2),
    accessor(v.joints, UBYTE, 8, QUAT),
    accessor(v.weights, FLOAT, 8, QUAT),
    accessor(v.idx, USHORT, idx.length, SCALAR),
    accessor(v.ibm, FLOAT, 2, 'MAT4'),
    accessor(v.time, FLOAT, 4, SCALAR, { min: [0], max: [1] }),
  ];
  const rot = [0, 0, 0, 1, 0, 0, 0.2588, 0.9659, -0.0872, 0, 0, 0.9962, -0.1736, 0, 0, 0.9848];
  const rotView = bin.add(f32(rot), ARRAY_BUFFER);
  json.accessors.push(accessor(rotView, FLOAT, 4, QUAT));
  json.bufferViews = bin.views;
  json.buffers = [{ byteLength: bin.offset }];
  json.nodes = [
    { mesh: 0, name: 'Body', skin: 0 },
    { name: 'Hip', children: [2], translation: [0, 0, 0] },
    { name: 'Spine', translation: [0, 0.75, 0] },
  ];
  json.scenes = [{ nodes: [0, 1] }];
  json.skins = [{ joints: [1, 2], inverseBindMatrices: 6 }];
  json.materials = [
    {
      name: 'cloth',
      pbrMetallicRoughness: {
        baseColorFactor: [0.37, 0.89, 0.75, 1],
        metallicFactor: 0,
        roughnessFactor: 0.9,
      },
    },
  ];
  json.meshes = [
    {
      primitives: [
        {
          attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, JOINTS_0: 3, WEIGHTS_0: 4 },
          indices: 5,
          material: 0,
        },
      ],
    },
  ];
  json.animations = [
    {
      name: 'Walk',
      samplers: [{ input: 7, output: 8, interpolation: 'LINEAR' }],
      channels: [{ sampler: 0, target: { node: 2, path: 'rotation' } }],
    },
  ];
  return packGlb(json, bin.buffer());
}

function dracoBox() {
  const data = boxData(1);
  const bin = new BinBuilder();
  const views = [bin.add(f32(data.pos), ARRAY_BUFFER), bin.add(u16(data.idx), ELEMENT_ARRAY_BUFFER)];
  const json = base();
  json.extensionsUsed = ['KHR_draco_mesh_compression'];
  json.extensionsRequired = ['KHR_draco_mesh_compression'];
  json.bufferViews = bin.views;
  json.buffers = [{ byteLength: bin.offset }];
  json.accessors = [
    accessor(views[0], FLOAT, data.pos.length / 3, VEC3),
    accessor(views[1], USHORT, data.idx.length, SCALAR),
  ];
  json.meshes = [
    {
      primitives: [
        {
          attributes: { POSITION: 0 },
          indices: 1,
          material: 0,
          extensions: { KHR_draco_mesh_compression: { bufferView: 0, attributes: { POSITION: 0 } } },
        },
      ],
    },
  ];
  json.materials = [{ name: 'compressed', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }];
  return packGlb(json, bin.buffer());
}

function externalGltf() {
  const positions = f32([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const idx = u16([0, 1, 2]);
  const gltf = {
    asset: { version: '2.0', generator: 'vibe3d fixtures generator' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Triangle' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ name: 'flat', pbrMetallicRoughness: { baseColorFactor: [0.48, 0.65, 1, 1] } }],
    buffers: [{ uri: 'external.bin', byteLength: positions.length + idx.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.length, target: 34962 },
      { buffer: 0, byteOffset: positions.length, byteLength: idx.length, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
  };
  return { json: gltf, bin: Buffer.concat([positions, idx]) };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const files = {
    'box-textured.glb': texturizedBox(),
    'pbr-metal.glb': pbrSphere(),
    'skinned-walk.glb': skinnedWalk(),
    'draco-box.glb': dracoBox(),
  };
  const ext = externalGltf();
  files['external.gltf'] = Buffer.from(JSON.stringify(ext.json, null, 2), 'utf8');
  files['external.bin'] = ext.bin;

  const manifest = { generator: 'scripts/make-fixtures.mjs', license: 'CC0-1.0', assets: {} };
  for (const [name, buf] of Object.entries(files)) {
    await writeFile(join(OUT, name), buf);
    manifest.assets[name] = { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
  }
  await writeFile(join(OUT, 'PROVENANCE.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`fixtures: ${Object.keys(files).length} assets written to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
