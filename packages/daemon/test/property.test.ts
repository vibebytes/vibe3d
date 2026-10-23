import {
  type Op,
  type RoomId,
  type SceneDoc,
  type SceneNode,
  type Vec3,
  emptyDoc,
} from '@vibebyte/vibe3d-protocol';
import { applyOps } from '@vibebyte/vibe3d-scene';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Room } from '../src/rooms/room';

const ROOM = 'r_prop0001' as RoomId;
const num = fc.double({ min: -4, max: 4, noNaN: true, noDefaultInfinity: true });
const vec3 = fc.tuple(num, num, num);
const nonzero = fc.oneof(
  fc.double({ min: 0.1, max: 3, noNaN: true, noDefaultInfinity: true }),
  fc.double({ min: -3, max: -0.1, noNaN: true, noDefaultInfinity: true }),
);
const transform = fc.record({ p: vec3, r: vec3, s: fc.tuple(nonzero, nonzero, nonzero) });
const color = fc.tuple(nonzero, nonzero, nonzero, fc.double({ min: 0, max: 1, noNaN: true }));

type Cmd =
  | { t: 'create'; kind: 'group' | 'mesh' | 'light'; parent: number | null }
  | { t: 'update'; pick: number; transform: SceneDoc['nodes'][string]['transform'] }
  | { t: 'delete'; pick: number }
  | { t: 'reparent'; pick: number; parent: number | null }
  | { t: 'material'; pick: number; baseColor: [number, number, number, number] }
  | { t: 'materialDrop'; pick: number }
  | { t: 'env'; intensity: number }
  | { t: 'stage'; preset: 'flat' | 'cine' | 'clean'; ground: boolean }
  | { t: 'camera'; fov: number; p: Vec3 };

const pick = fc.nat({ max: 64 });
const cmdArb: fc.Arbitrary<Cmd> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({
      t: fc.constant('create' as const),
      kind: fc.constantFrom('group', 'mesh', 'light'),
      parent: fc.option(pick, { nil: null }),
    }),
  },
  { weight: 4, arbitrary: fc.record({ t: fc.constant('update' as const), pick, transform }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('delete' as const), pick }) },
  {
    weight: 2,
    arbitrary: fc.record({
      t: fc.constant('reparent' as const),
      pick,
      parent: fc.option(pick, { nil: null }),
    }),
  },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('material' as const), pick, baseColor: color }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('materialDrop' as const), pick }) },
  {
    weight: 1,
    arbitrary: fc.record({
      t: fc.constant('env' as const),
      intensity: fc.double({ min: 0, max: 4, noNaN: true }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      t: fc.constant('stage' as const),
      preset: fc.constantFrom('flat', 'cine', 'clean'),
      ground: fc.boolean(),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      t: fc.constant('camera' as const),
      fov: fc.double({ min: 5, max: 120, noNaN: true }),
      p: vec3,
    }),
  },
);

const material = (baseColor: [number, number, number, number]) => ({
  baseColor,
  metalness: 0.2,
  roughness: 0.6,
  emissive: [0, 0, 0] as [number, number, number],
  emissiveIntensity: 0,
  opacity: 1,
  doubleSided: false,
});

const seedDoc = (): SceneDoc =>
  applyOps(emptyDoc(), [{ op: 'material.set', id: 'm0', material: material([0.8, 0.8, 0.8, 1]) }]).doc;

function buildOps(cmds: Cmd[]): Op[] {
  let doc = seedDoc();
  const ops: Op[] = [];
  let created = 0;
  let mats = 1;
  for (const cm of cmds) {
    const ids = Object.keys(doc.nodes).sort();
    const idx = 'pick' in cm ? cm.pick : 0;
    const id =
      cm.t === 'create' || cm.t === 'reparent' ? ids[cm.parent ?? 0] : ids[idx % Math.max(1, ids.length)];
    const batch: Op[] = [];
    if (cm.t === 'create') {
      const base = {
        id: `n${created++}`,
        name: '节点',
        parent: id ?? null,
        visible: true,
        transform: { p: [0, 0, 0] as Vec3, r: [0, 0, 0] as Vec3, s: [1, 1, 1] as Vec3 },
      };
      const node: SceneNode =
        cm.kind === 'mesh'
          ? { ...base, kind: 'mesh', geometry: { type: 'box', size: [1, 1, 1] }, material: 'm0' }
          : cm.kind === 'light'
            ? { ...base, kind: 'light', light: { type: 'point', color: [1, 1, 1, 1], intensity: 1 } }
            : { ...base, kind: 'group' };
      batch.push({ op: 'node.create', node });
    } else if (cm.t === 'update' && id) {
      batch.push({ op: 'node.update', id, patch: { transform: cm.transform } });
    } else if (cm.t === 'delete' && id) {
      batch.push({ op: 'node.delete', id, cascade: true });
    } else if (cm.t === 'reparent') {
      if (id)
        batch.push({ op: 'node.reparent', id, parent: cm.parent === null ? null : (ids[cm.parent] ?? null) });
    } else if (cm.t === 'material') {
      batch.push({ op: 'material.set', id: `m${mats++}`, material: material(cm.baseColor) });
    } else if (cm.t === 'materialDrop' && ids.length > 0) {
      batch.push({ op: 'material.delete', id: `m${idx % mats}` });
    } else if (cm.t === 'env') {
      batch.push({ op: 'env.set', env: { ambientIntensity: cm.intensity } });
    } else if (cm.t === 'stage') {
      batch.push({ op: 'stage.set', stage: { preset: cm.preset, ground: cm.ground } });
    } else if (cm.t === 'camera') {
      batch.push({ op: 'camera.set', camera: { fov: cm.fov, p: cm.p } });
    }
    if (batch.length === 0) continue;
    try {
      doc = applyOps(doc, batch).doc;
      ops.push(...batch);
    } catch {
      // 该命令在当前状态下非法，跳过（生成器只保证合法序列）
    }
  }
  return ops;
}

const strip = (doc: SceneDoc) => ({ ...doc, revision: 0, updatedAt: '' });

describe('属性测试', () => {
  it('任意合法 ops 序列：apply 后 undo，doc 与之前深等', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(cmdArb, { maxLength: 16 }), async (cmds) => {
        const ops = buildOps(cmds);
        const room = new Room(seedDoc(), ROOM);
        const before = structuredClone(room.doc);
        const applied = await room.apply(ops);
        expect(applied.revision).toBe(1);
        expect(room.opsAt(1)).toEqual(ops);
        await room.undo();
        expect(strip(room.doc)).toEqual(strip(before));
        expect(room.revision).toBe(2);
      }),
      { numRuns: 150 },
    );
  });

  it('undo 后 redo 回到 apply 后的状态', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(cmdArb, { maxLength: 16 }), async (cmds) => {
        const ops = buildOps(cmds);
        const room = new Room(seedDoc(), ROOM);
        await room.apply(ops);
        const after = structuredClone(room.doc);
        await room.undo();
        await room.redo();
        expect(strip(room.doc)).toEqual(strip(after));
      }),
      { numRuns: 100 },
    );
  });

  it('多步 undo 逐层回退，redo 回到最后状态', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(cmdArb, { maxLength: 12 }), async (cmds) => {
        const room = new Room(seedDoc(), ROOM);
        const base = structuredClone(room.doc);
        const all = buildOps(cmds);
        const cut1 = Math.floor(all.length / 3);
        const cut2 = Math.floor((all.length * 2) / 3);
        const snaps: SceneDoc[] = [];
        for (const chunk of [all.slice(0, cut1), all.slice(cut1, cut2), all.slice(cut2)]) {
          await room.apply(chunk);
          snaps.push(structuredClone(room.doc));
        }
        await room.undo(3);
        expect(strip(room.doc)).toEqual(strip(base));
        await room.redo(3);
        expect(strip(room.doc)).toEqual(strip(snaps.at(-1)!));
      }),
      { numRuns: 60 },
    );
  });

  it('生成器自检：典型序列产出预期 ops', () => {
    const cmds: Cmd[] = [
      { t: 'create', kind: 'group', parent: null },
      { t: 'create', kind: 'mesh', parent: 0 },
      { t: 'update', pick: 1, transform: { p: [1, 2, 3], r: [0, 0, 0], s: [1, 1, 1] } },
      { t: 'material', pick: 0, baseColor: [1, 0, 0, 1] },
      { t: 'reparent', pick: 1, parent: null },
      { t: 'delete', pick: 0 },
      { t: 'env', intensity: 2 },
      { t: 'stage', preset: 'cine', ground: true },
      { t: 'camera', fov: 45, p: [0, 1, 5] },
    ];
    expect(buildOps(cmds).map((o) => o.op)).toEqual([
      'node.create',
      'node.create',
      'node.update',
      'material.set',
      'node.reparent',
      'node.delete',
      'env.set',
      'stage.set',
      'camera.set',
    ]);
  });

  it('生成器覆盖：随机序列平均产出足够多合法 op', () => {
    const runs = fc.sample(fc.array(cmdArb, { minLength: 8, maxLength: 16 }), { numRuns: 30, seed: 42 });
    const total = runs.reduce((n, c) => n + buildOps(c).length, 0);
    expect(total / runs.length).toBeGreaterThan(4);
  });

  it('非法 ops 必被拒且 doc / revision 不变', async () => {
    const bad: fc.Arbitrary<Op> = fc.oneof(
      fc.record({
        op: fc.constant('node.update' as const),
        id: fc.constant('nope'),
        patch: fc.constant({ name: 'x' }),
      }),
      fc.record({ op: fc.constant('node.delete' as const), id: fc.constant('nope'), cascade: fc.boolean() }),
      fc.record({
        op: fc.constant('node.reparent' as const),
        id: fc.constant('nope'),
        parent: fc.constant(null),
      }),
      fc.record({ op: fc.constant('camera.set' as const) }),
      fc.record({ op: fc.constant('animation.play' as const), target: fc.constant('nope') }),
    );
    await fc.assert(
      fc.asyncProperty(fc.array(bad, { minLength: 1, maxLength: 4 }), async (ops) => {
        const room = new Room(seedDoc(), ROOM);
        const before = structuredClone(room.doc);
        await expect(room.apply(ops)).rejects.toMatchObject({ code: 'E_INVALID_PARAMS' });
        expect(room.doc).toEqual(before);
        expect(room.revision).toBe(0);
        expect(room.opsAt(0)).toEqual([]);
      }),
      { numRuns: 80 },
    );
  });
});
