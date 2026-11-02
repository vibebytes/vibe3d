import { Vibe3DError } from '@vibebyte/vibe3d-client';
import { describe, expect, it } from 'vitest';
import { paramsFromFlags } from '../src/flags';

const params = (
  name: Parameters<typeof paramsFromFlags>[0],
  positionals: string[],
  flags: Record<string, string | boolean>,
) => paramsFromFlags(name, positionals, flags).params;

describe('paramsFromFlags', () => {
  it('R2 别名：scene query --material', () => {
    expect(params('scene.query', ['r1'], { material: 'm1' }).materialId).toBe('m1');
  });

  it('R3 取反：mesh boolean --keep-tool', () => {
    expect(params('mesh.boolean', ['r1', 'n1', 'n2'], { 'keep-tool': true }).deleteTool).toBe(false);
  });

  it('R4 归一化匹配：--within-bbox 与 --withinBBox 等价', () => {
    const box = '{"min":[0,0,0],"max":[1,1,1]}';
    expect(params('scene.query', ['r1'], { 'within-bbox': box }).withinBBox).toEqual({
      min: [0, 0, 0],
      max: [1, 1, 1],
    });
    expect(params('scene.query', ['r1'], { withinBBox: box }).withinBBox).toEqual({
      min: [0, 0, 0],
      max: [1, 1, 1],
    });
  });

  it('R5 点路径：env set --fog.color', () => {
    const fog = params('env.set', ['r1'], { 'Fog.Color': '#fff' }).fog as { color: number[] };
    expect(fog.color[0]).toBe(1);
    expect(fog.color[3]).toBe(1);
  });

  it('R6 平铺：anim define --type sway --axis y', () => {
    expect(params('animation.define', ['r1', 'n1'], { type: 'sway', axis: 'y' }).clip).toEqual({
      type: 'sway',
      axis: 'y',
    });
  });

  it('R7 尺寸糖：render snapshot --size 640x480', () => {
    expect(params('render.snapshot', ['r1'], { size: '640x480' })).toMatchObject({ width: 640, height: 480 });
  });

  it('R7 有 size 字段时不触发：mesh bevel --size 1,1,1', () => {
    expect(params('mesh.bevel', ['r1'], { size: '1,1,1', radius: '0.1' }).size).toEqual([1, 1, 1]);
  });

  it('R8 transform 糖：mesh tube --at 1,0,0', () => {
    expect(
      params('mesh.tube', ['r1'], { points: '0,0,0;0,1,0', radius: '0.1', at: '1,0,0' }).transform,
    ).toEqual({
      p: [1, 0, 0],
    });
  });

  it('R8 有顶层字段时不触发：decal create --rotation', () => {
    const out = params('decal.create', ['r1'], { text: '标语', rotation: '0,0,0.3' });
    expect(out.rotation).toEqual([0, 0, 0.3]);
    expect(out.transform).toBeUndefined();
  });

  it('R9 未知 flag 报错并给出建议', () => {
    expect(() => params('animation.gait', ['r1', 'n1'], { style: 'run', strid: '1' })).toThrow(/--stride/);
  });

  it('V1 字面量映射：--parent root', () => {
    expect(params('scene.query', ['r1'], { parent: 'root' }).parentId).toBeNull();
  });

  it('V3 重复指定报错：render views --node a --node-ids b', () => {
    expect(() => params('render.views', ['r1'], { node: 'a', 'node-ids': 'b' })).toThrow(/nodeIds/);
  });

  it('V4 --input 底稿被 flag 覆盖', () => {
    expect(
      params('animation.gait', ['r1', 'n1'], { input: '{"speed":1}', style: 'run', speed: '2' }).speed,
    ).toBe(2);
  });

  it('V4 平铺写入与 JSON 字段合并：material patch', () => {
    expect(
      params('material.patch', ['r1', 'm1'], { patch: '{"metalness":1}', roughness: '0.2' }).patch,
    ).toEqual({
      metalness: 1,
      roughness: 0.2,
    });
  });

  it('V5 多余位置参数报错', () => {
    expect(() => params('node.get', ['r1', 'n1', 'extra'], {})).toThrow(/多了位置参数/);
  });

  it('V5 缺必填位置参数报错', () => {
    expect(() => params('node.get', ['r1'], {})).toThrow(/nodeId/);
  });

  it('V5 可选位置参数可用 flag 代替：camera rm --name', () => {
    const resolved = paramsFromFlags('camera.delete', ['r1'], { name: 'hero' });
    expect(resolved.params.name).toBe('hero');
  });

  it('V6 CLI 默认值不覆盖用户值：node create --kind light', () => {
    expect(params('node.create', ['r1'], { kind: 'light' }).kind).toBe('light');
    expect(params('node.create', ['r1'], {}).kind).toBe('mesh');
  });

  it('room 作用域时 roomId 同时进入 params 和 Resolved.roomId', () => {
    const resolved = paramsFromFlags('node.get', ['r1', 'n1'], {});
    expect(resolved.params.roomId).toBe('r1');
    expect(resolved.roomId).toBe('r1');
  });

  it('room 作用域且 roomId 可选时位置参数可省略', () => {
    const none = paramsFromFlags('job.list', [], {});
    expect(none.params.roomId).toBeUndefined();
    expect(none.roomId).toBeUndefined();
    const one = paramsFromFlags('job.list', ['r1'], {});
    expect(one.params.roomId).toBe('r1');
    expect(one.roomId).toBe('r1');
  });

  it('保留 flag 不进入 params', () => {
    const out = params('node.get', ['r1', 'n1'], { out: 'x', pretty: true, token: 't' });
    expect(out).not.toHaveProperty('out');
    expect(out).not.toHaveProperty('pretty');
    expect(out).not.toHaveProperty('token');
  });

  it('非法枚举值报错并列出可选值（E_INVALID_PARAMS）', () => {
    expect(() => params('render.snapshot', ['r1'], { shading: 'invalid' })).toThrowError(
      expect.objectContaining({
        code: 'E_INVALID_PARAMS',
        message: expect.stringMatching(/--shading.*flat \| wireframe/),
      }),
    );
  });

  it('--no-x 落在非布尔、非可空字段上报错（E_INVALID_PARAMS）', () => {
    let caught: unknown;
    try {
      params('animation.gait', ['r1', 'n1'], { style: false });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Vibe3DError);
    expect((caught as Vibe3DError).code).toBe('E_INVALID_PARAMS');
    expect((caught as Vibe3DError).message).toMatch(/--style/);
  });

  it('render views --node n1,n2 按逗号拆成多个节点', () => {
    expect(params('render.views', ['r1'], { node: 'n1,n2' }).nodeIds).toEqual(['n1', 'n2']);
  });
});
