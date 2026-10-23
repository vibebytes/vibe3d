import { describe, expect, it } from 'vitest';
import { parseGltf } from '../src/assets/gltf-parse';
import { glb, gltfDoc, gltfJson } from './helpers/glb';

const parseJson = (extra: Record<string, unknown>) =>
  parseGltf(Buffer.from(JSON.stringify({ ...gltfDoc(), ...extra })), 'model.gltf');

describe('parseGltf: 容器', () => {
  it('解析 GLB 与纯 JSON', () => {
    const glbReport = parseGltf(glb(), 'model.glb');
    expect(glbReport).toMatchObject({ version: '2.0', meshes: 1, prims: 1, tris: 1, selfContained: true });
    expect(glbReport.heroGuess).toBe('static');
    const jsonReport = parseGltf(gltfJson(), 'model.gltf');
    expect(jsonReport.size.diag).toBeCloseTo(Math.hypot(1, 1.5, 1));
  });

  it('拒绝截断/错位的 GLB', () => {
    const short = Buffer.alloc(12);
    short.writeUInt32LE(0x46546c67, 0);
    expect(() => parseGltf(short, 'a.glb')).toThrow(/头部被截断/);

    const overrun = glb();
    overrun.writeUInt32LE(overrun.length + 100, 8);
    expect(() => parseGltf(overrun, 'a.glb')).toThrow(/声明长度超出/);

    const wrongChunk = glb();
    wrongChunk.writeUInt32LE(0x004e4942, 16);
    expect(() => parseGltf(wrongChunk, 'a.glb')).toThrow(/不是 JSON/);

    const cut = glb();
    cut.writeUInt32LE(cut.length, 12);
    expect(() => parseGltf(cut, 'a.glb')).toThrow(/JSON chunk 被截断/);
  });

  it('拒绝非 glTF 内容与错误版本', () => {
    expect(() => parseGltf(Buffer.from('hello world'), 'x.bin')).toThrow(/既不是 GLB 也不是 glTF JSON/);
    expect(() => parseJson({ asset: { version: '1.0' } })).toThrow(/只支持 glTF 2.x/);
    expect(() => parseJson({ asset: {} })).toThrow(/未知/);
  });
});

describe('parseGltf: 扩展与外部引用', () => {
  it('extensionsRequired 含不支持的扩展时阻断，仅 used 时只记录', () => {
    expect(() => parseJson({ extensionsRequired: ['KHR_draco_mesh_compression'] })).toThrow(
      /依赖不支持的扩展/,
    );
    const report = parseJson({
      extensionsUsed: ['KHR_draco_mesh_compression', 'KHR_lights_punctual'],
      extensionsRequired: ['KHR_lights_punctual'],
    });
    expect(report.unsupported).toEqual(['KHR_draco_mesh_compression']);
  });

  it('外部 buffer/image 引用报缺失，data: URI 放行', () => {
    expect(() => parseJson({ buffers: [{ uri: 'mesh.bin', byteLength: 4 }] })).toThrow(/非自包含/);
    expect(() => parseJson({ images: [{ uri: 'tex.png' }] })).toThrow(/非自包含/);
    const ok = parseJson({
      buffers: [{ uri: 'data:application/octet-stream;base64,AA==', byteLength: 1 }],
      images: [{ uri: 'data:image/png;base64,AA==' }],
    });
    expect(ok.selfContained).toBe(true);
  });
});

describe('parseGltf: 统计与包围盒', () => {
  it('合并多 primitive、无 indices 时用 attributes 兜底', () => {
    const doc = gltfDoc();
    (doc.meshes as any)[0].primitives.push({ attributes: { POSITION: 0 } });
    const report = parseGltf(Buffer.from(JSON.stringify(doc)), 'm.gltf');
    expect(report.prims).toBe(2);
    expect(report.tris).toBe(2);
  });

  it('三角面超限被拒绝', () => {
    const doc = gltfDoc();
    (doc.accessors as any)[1].count = 15_000_003;
    expect(() => parseGltf(Buffer.from(JSON.stringify(doc)), 'm.gltf')).toThrow(/三角面数 .* 超过上限/);
  });

  it('动画时长取 sampler accessor 最大值，缺省为 0', () => {
    const doc = gltfDoc({ animations: ['walk'] });
    const acc = (doc.accessors as any)[0];
    acc.min = [0, 0, 0];
    acc.max = [2.5, 1.5, 1];
    (doc.animations as any)[0].samplers = [{ input: 0 }, { input: 99 }, {}];
    const report = parseGltf(Buffer.from(JSON.stringify(doc)), 'm.gltf');
    expect(report.animations[0]).toEqual({ name: 'walk', durationSec: 2.5, channels: 2 });
    expect(report.heroGuess).toBe('animated');
  });

  it('包围盒累加子节点平移，缺 POSITION 时退化为零点', () => {
    const doc = gltfDoc();
    (doc.nodes as any)[0].translation = [2, 0, 0];
    (doc.nodes as any)[0].children = [1];
    (doc.nodes as any).push({ mesh: 0, translation: [0, 3, 0] });
    const report = parseGltf(Buffer.from(JSON.stringify(doc)), 'm.gltf');
    expect(report.size.min).toEqual([2, 0, 0]);
    expect(report.size.max).toEqual([3, 4.5, 1]);

    const empty = gltfDoc();
    (empty.meshes as any)[0].primitives = [];
    const zero = parseGltf(Buffer.from(JSON.stringify(empty)), 'm.gltf');
    expect(zero.size).toEqual({ min: [0, 0, 0], max: [0, 0, 0], diag: 0 });
    expect(zero.tris).toBe(0);
  });
});
