import { type Op, type RoomId, emptyDoc } from '@vibebyte/vibe3d-protocol';
import { bench, describe } from 'vitest';
import { Room } from '../src/rooms/room';

const ROOM = 'r_bench0001' as RoomId;
const MATERIAL = 'm_bench0001';
const NODES = 2000;

const materialOp = {
  op: 'material.set',
  id: MATERIAL,
  material: {
    baseColor: [0.8, 0.8, 0.8, 1],
    metalness: 0,
    roughness: 0.8,
    emissive: [0, 0, 0],
    emissiveIntensity: 0,
    opacity: 1,
    doubleSided: false,
  },
} as Op;

const createOps = (count: number): Op[] => [
  materialOp,
  ...Array.from({ length: count }, (_, i) => ({
    op: 'node.create',
    node: {
      id: `n_${String(i + 1).padStart(8, '0')}`,
      name: `node-${i + 1}`,
      parent: null,
      visible: true,
      kind: 'mesh',
      geometry: { type: 'box', size: [1, 1, 1] },
      material: MATERIAL,
      transform: { p: [i % 50, Math.floor(i / 50), 0], r: [0, 0, 0], s: [1, 1, 1] },
    },
  })),
];

const ops = createOps(NODES);

describe(`room.apply ${NODES} nodes`, () => {
  bench('one batch of material.set + node.create', async () => {
    const room = new Room(emptyDoc('bench'), ROOM);
    const result = await room.apply(ops);
    if (result.revision !== 1) throw new Error(`revision ${result.revision}`);
    if (Object.keys(room.doc.nodes).length !== NODES) throw new Error('node count');
  });
});
