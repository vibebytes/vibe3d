import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyDoc } from '@vibebyte/vibe3d-protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args';
import { run } from '../src/commands';
import { parseColor } from '../src/fx-args';
import { type Call, recording } from './support/recording';

const color = (hex: string): [number, number, number, number] => {
  const parsed = parseColor(hex);
  if (!parsed) throw new Error(hex);
  return parsed;
};

async function callsOf(argv: string[], responses?: Record<string, unknown>): Promise<Call[]> {
  const rec = recording(responses);
  await run(parseArgs(argv), rec.connect);
  return rec.calls;
}

function byMethod(calls: Call[], method: string): Call {
  const found = calls.filter((call) => call.method === method);
  const last = found.at(-1);
  if (!last) throw new Error(`没有调用 ${method}，实际：${calls.map((call) => call.method).join(',')}`);
  return last;
}

describe('cli legacy flag mapping', () => {
  const fetchImpl = globalThis.fetch;
  beforeAll(() => {
    globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]));
  });
  afterAll(() => {
    globalThis.fetch = fetchImpl;
  });

  it('L1 room ls / room list', async () => {
    for (const argv of [
      ['room', 'ls'],
      ['room', 'list'],
    ]) {
      const call = byMethod(await callsOf(argv), 'room.list');
      expect(call.params).toEqual({});
      expect(call.roomId).toBeUndefined();
    }
  });

  it('L2 room rm --purge / room close', async () => {
    const purged = byMethod(await callsOf(['room', 'rm', 'r1', '--purge']), 'room.close');
    expect(purged.params).toMatchObject({ roomId: 'r1', purge: true });
    expect(purged.roomId).toBe('r1');
    const closed = byMethod(await callsOf(['room', 'close', 'r1']), 'room.close');
    expect(closed.params).toMatchObject({ roomId: 'r1', purge: false });
  });

  it('L3 room timeline --limit', async () => {
    const call = byMethod(await callsOf(['room', 'timeline', 'r1', '--limit', '5']), 'room.timeline');
    expect(call.params).toMatchObject({ roomId: 'r1', limit: 5 });
  });

  it('L4 scene query 别名、root、bbox、tags', async () => {
    const call = byMethod(
      await callsOf([
        'scene',
        'query',
        'r1',
        '--material',
        'm1',
        '--parent',
        'root',
        '--within-bbox',
        '{"min":[0,0,0],"max":[1,1,1]}',
        '--tags',
        'a,b',
        '--min-y',
        '0.5',
        '--has-children',
      ]),
      'scene.query',
    );
    expect(call.params).toMatchObject({
      roomId: 'r1',
      materialId: 'm1',
      parentId: null,
      withinBBox: { min: [0, 0, 0], max: [1, 1, 1] },
      tags: ['a', 'b'],
      minY: 0.5,
      hasChildren: true,
    });
  });

  it('L5 scene query --parent 节点', async () => {
    const call = byMethod(await callsOf(['scene', 'query', 'r1', '--parent', 'n_1']), 'scene.query');
    expect(call.params).toMatchObject({ parentId: 'n_1' });
  });

  it('L6 scene stats', async () => {
    const call = byMethod(
      await callsOf(['scene', 'stats', 'r1', '--budget', '{"triangles":1000}', '--enforce']),
      'scene.stats',
    );
    expect(call.params).toMatchObject({ budget: { triangles: 1000 }, enforce: true });
  });

  it('L7 scene validate', async () => {
    const call = byMethod(
      await callsOf([
        'scene',
        'validate',
        'r1',
        '--checks',
        'floating,intersect',
        '--tolerance',
        '0.02',
        '--ignore',
        'n1,n2',
      ]),
      'scene.validate',
    );
    expect(call.params).toMatchObject({
      checks: ['floating', 'intersect'],
      tolerance: 0.02,
      ignore: ['n1', 'n2'],
    });
  });

  it('L8 scene undo', async () => {
    const call = byMethod(await callsOf(['scene', 'undo', 'r1', '--op-id', 'o1']), 'scene.undo');
    expect(call.params).toMatchObject({ opId: 'o1' });
  });

  it('L9 scene diff', async () => {
    const call = byMethod(await callsOf(['scene', 'diff', 'r1', '--from', '1', '--to', '3']), 'scene.diff');
    expect(call.params).toMatchObject({ from: 1, to: 3 });
  });

  it('L10 scene apply @file --dry-run', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vibe3d-ops-'));
    const file = join(dir, 'ops.json');
    await writeFile(file, JSON.stringify([{ op: 'node.delete', nodeId: 'n1' }]));
    const call = byMethod(
      await callsOf(['scene', 'apply', 'r1', '--ops', `@${file}`, '--dry-run']),
      'ops.apply',
    );
    expect(call.params).toMatchObject({
      ops: [{ op: 'node.delete', nodeId: 'n1' }],
      dryRun: true,
    });
  });

  it('L11 scene checkpoints / ckpt', async () => {
    for (const command of ['checkpoints', 'ckpt']) {
      const call = byMethod(await callsOf(['scene', command, 'r1']), 'scene.checkpoints');
      expect(call.params).toMatchObject({ roomId: 'r1' });
    }
  });

  it('L12 scene restore', async () => {
    const call = byMethod(
      await callsOf(['scene', 'restore', 'r1', 'c1', '--scope', 'subtree', '--ids', 'a,b']),
      'scene.restore',
    );
    expect(call.params).toMatchObject({ checkpointId: 'c1', scope: 'subtree', ids: ['a', 'b'] });
  });

  it('L13 node create 默认 kind 与 parent', async () => {
    const call = byMethod(
      await callsOf(['node', 'create', 'r1', '--shape', 'box', '--size', '1,2,3', '--tags', 'a,b']),
      'node.create',
    );
    expect(call.params).toMatchObject({
      kind: 'mesh',
      parent: null,
      shape: 'box',
      size: [1, 2, 3],
      tags: ['a', 'b'],
    });
  });

  it('L14 node update', async () => {
    const call = byMethod(
      await callsOf(['node', 'update', 'r1', 'n1', '--patch', '{"name":"x"}']),
      'node.update',
    );
    expect(call.params).toMatchObject({ nodeId: 'n1', patch: { name: 'x' } });
  });

  it('L15 node rm --no-cascade / node delete', async () => {
    const removed = byMethod(await callsOf(['node', 'rm', 'r1', 'n1', '--no-cascade']), 'node.delete');
    expect(removed.params).toMatchObject({ nodeId: 'n1', cascade: false });
    const deleted = byMethod(await callsOf(['node', 'delete', 'r1', 'n1']), 'node.delete');
    expect(deleted.params).toMatchObject({ nodeId: 'n1', cascade: true });
  });

  it('L16 node clone', async () => {
    const call = byMethod(
      await callsOf(['node', 'clone', 'r1', 'n1', '--count', '2', '--parent', 'n2']),
      'node.clone',
    );
    expect(call.params).toMatchObject({ nodeId: 'n1', count: 2, parent: 'n2' });
  });

  it('L17 node transform-many', async () => {
    const call = byMethod(
      await callsOf(['node', 'transform-many', 'r1', '--ids', 'a,b', '--translate', '0,1,0']),
      'node.transform_many',
    );
    expect(call.params).toMatchObject({ ids: ['a', 'b'], translate: [0, 1, 0] });
  });

  it('L18 node array', async () => {
    const call = byMethod(
      await callsOf([
        'node',
        'array',
        'r1',
        'n1',
        '--count',
        '5',
        '--offset',
        '1,0,0',
        '--rotate-step',
        '0,0.5,0',
      ]),
      'node.array',
    );
    expect(call.params).toMatchObject({
      id: 'n1',
      count: 5,
      offset: [1, 0, 0],
      rotateStep: [0, 0.5, 0],
    });
  });

  it('L19 node merge', async () => {
    const call = byMethod(await callsOf(['node', 'merge', 'r1', 'n1', '--material', 'm1']), 'node.merge');
    expect(call.params).toMatchObject({ nodeId: 'n1', material: 'm1' });
  });

  it('L20 node fit-screen', async () => {
    const call = byMethod(
      await callsOf([
        'node',
        'fit-screen',
        'r1',
        'n1',
        '--rect',
        '{"x":0,"y":0,"w":0.5,"h":0.5}',
        '--anchor',
        'bottom',
      ]),
      'node.fit_screen',
    );
    expect(call.params).toMatchObject({
      nodeId: 'n1',
      rect: { x: 0, y: 0, w: 0.5, h: 0.5 },
      anchor: 'bottom',
    });
  });

  it.fails('L21 node group --no-keep-world 发出 keepWorld:false', async () => {
    const call = byMethod(
      await callsOf(['node', 'group', 'r1', '--ids', 'a,b', '--name', 'g', '--no-keep-world']),
      'node.group',
    );
    expect(call.params).toMatchObject({ ids: ['a', 'b'], name: 'g', keepWorld: false });
  });

  it('L22 material assign', async () => {
    const call = byMethod(
      await callsOf(['material', 'assign', 'r1', '--material', 'm1', '--ids', 'a,b']),
      'material.assign',
    );
    expect(call.params).toMatchObject({ materialId: 'm1', ids: ['a', 'b'] });
  });

  it('L23 material create', async () => {
    const call = byMethod(
      await callsOf(['material', 'create', 'r1', '--preset', 'concrete', '--params', '{"roughness":0.4}']),
      'material.create',
    );
    expect(call.params).toMatchObject({ preset: 'concrete', params: { roughness: 0.4 } });
  });

  it('L24 material patch 平铺字段', async () => {
    const call = byMethod(
      await callsOf([
        'material',
        'patch',
        'r1',
        'm1',
        '--roughness',
        '0.3',
        '--base-color',
        '#ff0000',
        '--emissive',
        '#00ff00',
        '--emissive-intensity',
        '2',
        '--double-sided',
      ]),
      'material.patch',
    );
    expect(call.params).toMatchObject({
      materialId: 'm1',
      patch: {
        roughness: 0.3,
        baseColor: color('#ff0000'),
        emissive: color('#00ff00').slice(0, 3),
        emissiveIntensity: 2,
        doubleSided: true,
      },
    });
  });

  it('L25 material patch JSON 与平铺合并', async () => {
    const call = byMethod(
      await callsOf(['material', 'patch', 'r1', 'm1', '--patch', '{"metalness":1}', '--roughness', '0.2']),
      'material.patch',
    );
    expect(call.params).toMatchObject({ patch: { metalness: 1, roughness: 0.2 } });
  });

  it('L26 material map', async () => {
    const call = byMethod(
      await callsOf([
        'material',
        'map',
        'r1',
        'm1',
        '--sha',
        's1',
        '--tiling',
        '2,2',
        '--offset',
        '0,0.5',
        '--rotation',
        '0.3',
      ]),
      'material.map',
    );
    expect(call.params).toMatchObject({
      materialId: 'm1',
      sha: 's1',
      tiling: [2, 2],
      offset: [0, 0.5],
      rotation: 0.3,
    });
  });

  it('L27 decal --text 与 --image-sha 各自映射', async () => {
    const text = byMethod(
      await callsOf(['decal', 'create', 'r1', '--text', '标语', '--at', '0,1,0', '--font-size', '64']),
      'decal.create',
    );
    expect(text.params).toMatchObject({ text: '标语', position: [0, 1, 0], fontSize: 64 });
    const image = byMethod(await callsOf(['decal', 'create', 'r1', '--image-sha', 's1']), 'decal.create');
    expect(image.params).toMatchObject({ imageSha: 's1' });
  });

  it('L27 decal --text 与 --image-sha 同时给出时报错', async () => {
    await expect(callsOf(['decal', 'create', 'r1', '--text', '标语', '--image-sha', 's1'])).rejects.toThrow(
      /二选一/,
    );
  });

  it('L28 mesh boolean --keep-tool', async () => {
    const call = byMethod(
      await callsOf(['mesh', 'boolean', 'r1', 'n1', 'n2', '--keep-tool']),
      'mesh.boolean',
    );
    expect(call.params).toMatchObject({ target: 'n1', tool: 'n2', op: 'subtract', deleteTool: false });
  });

  it('L29 mesh tube', async () => {
    const call = byMethod(
      await callsOf([
        'mesh',
        'tube',
        'r1',
        '--points',
        '0,0,0;0,1,0',
        '--radius',
        '0.1',
        '--radial',
        '8',
        '--at',
        '1,0,0',
        '--scale',
        '2,2,2',
        '--color',
        '#888888',
      ]),
      'mesh.tube',
    );
    expect(call.params).toMatchObject({
      points: [
        [0, 0, 0],
        [0, 1, 0],
      ],
      radius: 0.1,
      radialSegments: 8,
      transform: { p: [1, 0, 0], s: [2, 2, 2] },
      color: '#888888',
    });
  });

  it('L30 mesh backdrop', async () => {
    const call = byMethod(
      await callsOf(['mesh', 'backdrop', 'r1', '--width', '10', '--curve', '1.2', '--at', '0,0,-3']),
      'mesh.backdrop',
    );
    expect(call.params).toMatchObject({ width: 10, curve: 1.2, transform: { p: [0, 0, -3] } });
  });

  it('L31 stage set --preset', async () => {
    const call = byMethod(await callsOf(['stage', 'set', 'r1', '--preset', 'cine']), 'stage.set');
    expect(call.params).toMatchObject({ stage: { preset: 'cine' } });
  });

  it('L32 stage set --stage', async () => {
    const call = byMethod(await callsOf(['stage', 'set', 'r1', '--stage', '{"preset":"cine"}']), 'stage.set');
    expect(call.params).toMatchObject({ stage: { preset: 'cine' } });
  });

  it('L33 anim play', async () => {
    const call = byMethod(
      await callsOf([
        'anim',
        'play',
        'r1',
        'n1',
        '--clip',
        'wave',
        '--speed',
        '2',
        '--loop',
        'false',
        '--weight',
        '0.5',
      ]),
      'animation.play',
    );
    expect(call.params).toMatchObject({ nodeId: 'n1', clip: 'wave', speed: 2, loop: false, weight: 0.5 });
  });

  it('L34 anim define 平铺 clip', async () => {
    const call = byMethod(
      await callsOf([
        'anim',
        'define',
        'r1',
        'n1',
        '--type',
        'sway',
        '--axis',
        'y',
        '--amplitude',
        '0.2',
        '--apply-to',
        'subtree',
      ]),
      'animation.define',
    );
    expect(call.params).toMatchObject({
      nodeId: 'n1',
      clip: { type: 'sway', axis: 'y', amplitude: 0.2 },
      applyTo: 'subtree',
    });
  });

  it('L35 --clip-json 当前未读取，缺少 --type 时报错', async () => {
    await expect(callsOf(['anim', 'define', 'r1', 'n1', '--clip-json', '{"tracks":[]}'])).rejects.toThrow(
      /需要 --type/,
    );
  });

  it('L36 anim clear', async () => {
    const call = byMethod(
      await callsOf(['anim', 'clear', 'r1', 'n1', '--apply-to', 'subtree']),
      'animation.clear',
    );
    expect(call.params).toMatchObject({ nodeId: 'n1', applyTo: 'subtree' });
  });

  it('L37 fx create', async () => {
    const call = byMethod(
      await callsOf(['fx', 'create', 'r1', '--node', 'n1', '--color', '#ffaa00', '--radius-top', '0.2']),
      'fx.create',
    );
    expect(call.params).toMatchObject({
      type: 'particles',
      nodeId: 'n1',
      color: color('#ffaa00'),
      radiusTop: 0.2,
    });
  });

  it('L38 fx rm / fx delete', async () => {
    for (const command of ['rm', 'delete']) {
      const call = byMethod(await callsOf(['fx', command, 'r1', 'f1']), 'fx.delete');
      expect(call.params).toMatchObject({ fxId: 'f1' });
    }
  });

  it('L39 env set', async () => {
    const call = byMethod(
      await callsOf([
        'env',
        'set',
        'r1',
        '--fog',
        '5,40',
        '--fog-color',
        '#ccddee',
        '--hdri',
        './sky.hdr',
        '--policy',
        'copy',
      ]),
      'env.set',
    );
    expect(call.params).toMatchObject({
      fog: { near: 5, far: 40, color: color('#ccddee') },
      hdriSrc: './sky.hdr',
      policy: 'copy',
    });
  });

  it('L40 env set --no-fog', async () => {
    const call = byMethod(await callsOf(['env', 'set', 'r1', '--no-fog']), 'env.set');
    expect(call.params).toMatchObject({ fog: null });
  });

  it('L41 camera set', async () => {
    const call = byMethod(
      await callsOf([
        'camera',
        'set',
        'r1',
        '--p',
        '4,3,4',
        '--target',
        '0,1,0',
        '--fov',
        '40',
        '--frame',
        'fit',
        '--name',
        'hero',
      ]),
      'camera.set',
    );
    expect(call.params).toMatchObject({
      camera: { p: [4, 3, 4], target: [0, 1, 0], fov: 40 },
      frame: 'fit',
      name: 'hero',
    });
  });

  it('L42 camera save', async () => {
    const call = byMethod(await callsOf(['camera', 'save', 'r1', '--name', 'hero']), 'camera.save');
    expect(call.params).toMatchObject({ name: 'hero' });
  });

  it('L43 camera rm 位置参数 / camera delete --name', async () => {
    const positional = byMethod(await callsOf(['camera', 'rm', 'r1', 'hero']), 'camera.delete');
    expect(positional.params).toMatchObject({ name: 'hero' });
    const flagged = byMethod(await callsOf(['camera', 'delete', 'r1', '--name', 'hero']), 'camera.delete');
    expect(flagged.params).toMatchObject({ name: 'hero' });
  });

  it('L44 render snapshot --out', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vibe3d-shot-'));
    const out = join(dir, 'a.png');
    const seen = await callsOf([
      'render',
      'snapshot',
      'r1',
      '--size',
      '1280x720',
      '--settle-ms',
      '180',
      '--at',
      '1.2',
      '--transparent',
      '--shading',
      'flat',
      '--overlay',
      'grid,axes',
      '--out',
      out,
    ]);
    expect(byMethod(seen, 'render.snapshot').params).toMatchObject({
      width: 1280,
      height: 720,
      settleMs: 180,
      at: 1.2,
      transparent: true,
      shading: 'flat',
      overlay: ['grid', 'axes'],
    });
    const bytes = await readFile(out);
    expect(bytes.equals(Buffer.from('png'))).toBe(true);
  });

  it('L45 render views --out', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vibe3d-views-'));
    const seen = await callsOf([
      'render',
      'views',
      'r1',
      '--views',
      'front,top',
      '--node',
      'n1',
      '--out',
      dir,
    ]);
    expect(byMethod(seen, 'render.views').params).toMatchObject({
      views: ['front', 'top'],
      nodeIds: ['n1'],
    });
    const front = await readFile(join(dir, 'front.png'));
    expect(front.length).toBeGreaterThan(0);
  });

  it('L46 render node', async () => {
    const call = byMethod(
      await callsOf(['render', 'node', 'r1', 'n1', '--view', 'three_quarter', '--padding', '1.2']),
      'render.node',
    );
    expect(call.params).toMatchObject({ nodeId: 'n1', view: 'three_quarter', padding: 1.2 });
  });

  it('L47 render pick points 与 rect', async () => {
    const call = byMethod(
      await callsOf([
        'render',
        'pick',
        'r1',
        '--points',
        '10,20;30,40',
        '--rect',
        '0,0,200,100',
        '--top-colors',
        '5',
      ]),
      'render.pick',
    );
    expect(call.params).toMatchObject({
      points: [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ],
      rect: { x: 0, y: 0, w: 200, h: 100 },
      topColors: 5,
    });
  });

  it('L48 render pick --point', async () => {
    const call = byMethod(await callsOf(['render', 'pick', 'r1', '--point', '12,34']), 'render.pick');
    expect(call.params).toMatchObject({ points: [{ x: 12, y: 34 }] });
  });

  it('L49 export glb 等待并下载', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vibe3d-glb-'));
    const out = join(dir, 'a.glb');
    const seen = await callsOf(['export', 'glb', 'r1', '--node', 'n1', '--out', out]);
    expect(byMethod(seen, 'export.glb').params).toMatchObject({ nodeIds: ['n1'] });
    expect(seen.filter((call) => call.method === 'job.get').length).toBeGreaterThan(0);
    const bytes = await readFile(out);
    expect(bytes.equals(Buffer.from([1, 2, 3]))).toBe(true);
  });

  it('L50 export glb --no-wait', async () => {
    const seen = await callsOf(['export', 'glb', 'r1', '--no-wait']);
    expect(byMethod(seen, 'export.glb').params).toEqual({ roomId: 'r1' });
    expect(seen.filter((call) => call.method === 'job.get')).toHaveLength(1);
  });

  it('L51 job ls / job list 带房间', async () => {
    expect(byMethod(await callsOf(['job', 'ls', 'r1']), 'job.list').params).toEqual({ roomId: 'r1' });
    expect(byMethod(await callsOf(['job', 'list', 'r1']), 'job.list').params).toEqual({ roomId: 'r1' });
  });

  it.fails('L51 job ls 不带房间也能列出', async () => {
    expect(byMethod(await callsOf(['job', 'ls']), 'job.list').params).toEqual({});
  });

  it('L52 job get / job cancel', async () => {
    expect(byMethod(await callsOf(['job', 'get', 'j1']), 'job.get').params).toEqual({ jobId: 'j1' });
    expect(byMethod(await callsOf(['job', 'cancel', 'j1']), 'job.cancel').params).toEqual({ jobId: 'j1' });
  });

  it.fails('L53 open --no-reuse 发出 focus 与 reuse:false', async () => {
    const call = byMethod(await callsOf(['open', 'r1', '--focus', 'n1', '--no-reuse']), 'editor.open');
    expect(call.params).toMatchObject({ focus: 'n1', reuse: false });
  });

  it.fails('L53 open 不带 flag 时发送 reuse:true', async () => {
    const call = byMethod(await callsOf(['open', 'r1']), 'editor.open');
    expect(call.params).toMatchObject({ reuse: true });
  });

  it('L54 model import', async () => {
    const call = byMethod(
      await callsOf(['model', 'import', 'r1', './a.glb', '--align', 'ground', '--autoplay', '--name', 'm']),
      'node.import',
    );
    expect(call.params).toMatchObject({ src: './a.glb', align: 'ground', autoplay: true, name: 'm' });
  });

  it('L55 asset inspect', async () => {
    const call = byMethod(
      await callsOf(['asset', 'inspect', 'r1', './a.glb', '--policy', 'copy']),
      'asset.inspect',
    );
    expect(call.params).toMatchObject({ src: './a.glb', policy: 'copy' });
  });

  it('L56 asset put', async () => {
    const call = byMethod(
      await callsOf(['asset', 'put', 'r1', './a.png', '--kind', 'image', '--name', 'n']),
      'asset.put',
    );
    expect(call.params).toMatchObject({ src: './a.png', kind: 'image', name: 'n' });
  });

  it('L57 asset ls / list 与 rm / delete', async () => {
    for (const command of ['ls', 'list']) {
      const call = byMethod(await callsOf(['asset', command, 'r1']), 'asset.list');
      expect(call.params).toMatchObject({ roomId: 'r1' });
    }
    for (const command of ['rm', 'delete']) {
      const call = byMethod(await callsOf(['asset', command, 'r1', 's1']), 'asset.delete');
      expect(call.params).toMatchObject({ sha: 's1' });
    }
  });

  it('L58 status 合并 health 与 hello', async () => {
    const rec = recording();
    const result = await run(parseArgs(['status']), rec.connect);
    expect(result).toMatchObject({
      ok: true,
      capabilities: ['scene.get'],
      home: '/tmp/vibe3d-test',
    });
    expect(byMethod(rec.calls, 'hello').params).toEqual({});
  });

  it('L59 room new 追加编辑器 url', async () => {
    const rec = recording();
    const result = (await run(parseArgs(['room', 'new', '--name', 'smoke']), rec.connect)) as {
      url: string;
    };
    expect(byMethod(rec.calls, 'room.create').params).toMatchObject({ name: 'smoke' });
    expect(result.url).toBe('http://127.0.0.1:0/r/r_new');
  });

  it('L60 scene export --out', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vibe3d-doc-'));
    const out = join(dir, 'doc.json');
    const rec = recording();
    await run(parseArgs(['scene', 'export', 'r1', '--out', out]), rec.connect);
    expect(byMethod(rec.calls, 'scene.export').params).toMatchObject({ roomId: 'r1' });
    const text = await readFile(out, 'utf8');
    expect(JSON.parse(text)).toMatchObject({ name: 'exported' });
  });

  it('L61 scene import 读文件', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vibe3d-imp-'));
    const file = join(dir, 'doc.json');
    await writeFile(file, JSON.stringify(emptyDoc('imported')));
    const call = byMethod(await callsOf(['scene', 'import', 'r1', file]), 'scene.import');
    expect(call.params).toMatchObject({ doc: { name: 'imported' } });
  });

  it('L62 job wait', async () => {
    const seen = await callsOf(['job', 'wait', 'j1']);
    expect(byMethod(seen, 'job.get').params).toEqual({ jobId: 'j1' });
  });
});
