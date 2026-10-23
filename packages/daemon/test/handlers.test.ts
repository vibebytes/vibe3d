import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { glb } from './helpers/glb';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function room(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '测试场景' });
  return body.result.roomId;
}

describe('handlers: scene', () => {
  it('node.create 覆盖 mesh 四种基础体、group、light 与材质', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const shapes = ['box', 'sphere', 'cylinder', 'plane'] as const;
    for (const shape of shapes) {
      const { body } = await call(
        h,
        'node.create',
        { roomId, kind: 'mesh', shape, color: '#ff8800', radius: 0.7, height: 2, size: [1, 2, 3] },
        roomId,
      );
      expect(body.result.nodeId).toMatch(/^n_/);
      expect(body.result.revision).toBeGreaterThan(0);
    }
    const custom = await call(
      h,
      'node.create',
      {
        roomId,
        kind: 'mesh',
        material: {
          baseColor: [1, 0, 0, 1],
          metalness: 0.2,
          roughness: 0.3,
          emissive: [0, 0, 0],
          emissiveIntensity: 0,
          opacity: 1,
          doubleSided: false,
        },
      },
      roomId,
    );
    expect(custom.body.result.nodeId).toBeTruthy();

    const group = await call(h, 'node.create', { roomId, kind: 'group', name: '组', parent: null }, roomId);
    expect(group.body.result.nodeId).toBeTruthy();
    const light = await call(
      h,
      'node.create',
      {
        roomId,
        kind: 'light',
        light: { type: 'point', color: [1, 1, 1, 1], intensity: 3, position: [1, 1, 1] },
      },
      roomId,
    );
    expect(light.body.result.nodeId).toBeTruthy();
    const defaultLight = await call(h, 'node.create', { roomId, kind: 'light' }, roomId);
    expect(defaultLight.body.result.nodeId).toBeTruthy();
  });

  it('node.update 合并变换并支持 name/visible/light/anim', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const created = await call(
      h,
      'node.create',
      { roomId, kind: 'group', transform: { p: [1, 2, 3] } },
      roomId,
    );
    const nodeId = created.body.result.nodeId;

    const moved = await call(
      h,
      'node.update',
      {
        roomId,
        nodeId,
        patch: {
          name: '改名',
          visible: false,
          transform: { s: [2, 2, 2] },
        },
      },
      roomId,
    );
    expect(moved.body.result.revision).toBeGreaterThan(created.body.result.revision);
    const state = await call(h, 'scene.get', { roomId }, roomId);
    const node = state.body.result.doc.nodes[nodeId];
    expect(node.name).toBe('改名');
    expect(node.visible).toBe(false);
    expect(node.transform).toEqual({ p: [1, 2, 3], r: [0, 0, 0], s: [2, 2, 2] });

    const plain = await call(h, 'node.update', { roomId, nodeId, patch: {} }, roomId);
    expect(plain.body.result.revision).toBeGreaterThan(moved.body.result.revision);
    await call(
      h,
      'node.update',
      { roomId, nodeId, patch: { transform: { p: [0, 0, 0] }, light: undefined } },
      roomId,
    );
  });

  it('node.delete / stage.set / animation.play / camera.set', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const dir = mkdtempSync(join(tmpdir(), 'v3d-anim-'));
    const file = join(dir, 'walk.glb');
    writeFileSync(file, glb({ animations: ['walk'], skinned: true }));
    const model = await call(h, 'node.import', { roomId, src: file }, roomId);
    const nodeId = model.body.result.nodeId;
    const del = await call(h, 'node.delete', { roomId, nodeId, cascade: false }, roomId);
    expect(del.body.result.deleted).toBe(1);

    const stage = await call(h, 'stage.set', { roomId, stage: { preset: 'cine', ground: false } }, roomId);
    expect(stage.body.result.stage.preset).toBe('cine');
    expect(stage.body.result.stage.ground).toBe(false);

    const again = await call(h, 'node.import', { roomId, src: file, autoplay: true }, roomId);
    const anim = await call(
      h,
      'animation.play',
      { roomId, nodeId: again.body.result.nodeId, clip: 'walk', speed: 1.5 },
      roomId,
    );
    expect(anim.body.result.revision).toBeGreaterThan(0);
    const patched = await call(
      h,
      'node.update',
      {
        roomId,
        nodeId: again.body.result.nodeId,
        patch: { anim: { clip: 'walk', speed: 2, playing: false } },
      },
      roomId,
    );
    expect(patched.body.result.revision).toBeGreaterThan(anim.body.result.revision);

    const cam = await call(h, 'camera.set', { roomId, frame: 'fit', camera: { fov: 45 } }, roomId);
    expect(cam.body.result.camera.fov).toBe(45);
  });

  it('scene 读写：undo/redo/diff/summary/ops.apply(dryRun)', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    await call(h, 'node.create', { roomId, kind: 'mesh' }, roomId);
    await call(h, 'scene.get', { roomId }, roomId);

    const undo = await call(h, 'scene.undo', { roomId }, roomId);
    expect(undo.body.result.revision).toBeGreaterThan(0);
    const afterUndo = await call(h, 'scene.get', { roomId }, roomId);
    expect(Object.keys(afterUndo.body.result.doc.nodes)).toHaveLength(0);
    const redo = await call(h, 'scene.redo', { roomId }, roomId);
    expect(redo.body.result.revision).toBeGreaterThan(undo.body.result.revision);
    const afterRedo = await call(h, 'scene.get', { roomId }, roomId);
    expect(Object.keys(afterRedo.body.result.doc.nodes)).toHaveLength(1);

    const diff = await call(h, 'scene.diff', { roomId, from: 0 }, roomId);
    expect(diff.body.result.from).toBe(0);
    expect(Array.isArray(diff.body.result.ops)).toBe(true);

    const summary = await call(h, 'scene.summary', { roomId }, roomId);
    expect(summary.body.result.nodeCount).toBe(1);
    expect(summary.body.result.stage.preset).toBeTruthy();

    const dry = await call(
      h,
      'ops.apply',
      { roomId, dryRun: true, ops: [{ op: 'stage.set', stage: { preset: 'flat' } }] },
      roomId,
    );
    expect(dry.body.result.revision).toBe(redo.body.result.revision);
    expect(dry.body.result.inverse.length).toBeGreaterThan(0);

    const sel = await call(h, 'selection.get', { roomId }, roomId);
    expect(sel.body.result.nodeIds).toEqual([]);
  });

  it('room.list/get/close 与 editor.open、render 不可用', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const list = await call(h, 'room.list', {});
    expect(list.body.result.rooms[0].roomId).toBe(roomId);
    const one = await call(h, 'room.get', { roomId }, roomId);
    expect(one.body.result.name).toBe('测试场景');

    const editor = await call(h, 'editor.open', { roomId, focus: 'n_abcdefg1', reuse: true }, roomId);
    expect(editor.body.result.url).toContain(`/r/${roomId}?focus=n_abcdefg1`);
    expect(editor.body.result.reused).toBe(true);
    const plain = await call(h, 'editor.open', { roomId }, roomId);
    expect(plain.body.result.url).toContain(`/r/${roomId}`);

    const shot = await call(h, 'render.snapshot', { roomId }, roomId);
    expect(codeOf(shot.body)).toBe('E_RENDER_UNAVAILABLE');
    const exp = await call(h, 'export.glb', { roomId }, roomId);
    expect(codeOf(exp.body)).toBe('E_RENDER_UNAVAILABLE');

    const closed = await call(h, 'room.close', { roomId, purge: true }, roomId);
    expect(closed.body.result.closed).toBe(true);
    const missing = await call(h, 'room.get', { roomId }, roomId);
    expect(codeOf(missing.body)).toBe('E_ROOM_NOT_FOUND');
  });
});

describe('handlers: asset', () => {
  it('asset.inspect 与 node.import（含 autoplay/自定义 transform）', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const dir = mkdtempSync(join(tmpdir(), 'v3d-asset-'));
    const file = join(dir, 'walk.glb');
    writeFileSync(file, glb({ animations: ['walk'], skinned: true }));

    const inspected = await call(h, 'asset.inspect', { roomId, src: file }, roomId);
    expect(inspected.body.result.report.tris).toBe(1);
    expect(inspected.body.result.sha).toMatch(/^[a-f0-9]{64}$/);

    const imported = await call(h, 'node.import', { roomId, src: file, autoplay: true }, roomId);
    expect(imported.body.result.report.animations[0].name).toBe('walk');
    expect(imported.body.result.sha).toBe(inspected.body.result.sha);

    const custom = await call(
      h,
      'node.import',
      { roomId, src: file, name: '自定义', transform: { p: [1, 2, 3], s: [2, 2, 2] } },
      roomId,
    );
    expect(custom.body.result.nodeId).toBeTruthy();

    const missing = await call(h, 'node.import', { roomId, src: join(dir, 'nope.glb') }, roomId);
    expect(codeOf(missing.body)).toBe('E_ASSET_MISSING');
  });
});
