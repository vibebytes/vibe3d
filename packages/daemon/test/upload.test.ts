import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES, classifyUpload } from '../src/assets/upload';
import { glb, gltfJson } from './helpers/glb';

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
};

describe('upload: 类型与内容校验', () => {
  it('GLB 与自包含 glTF 通过，并给出规范 MIME', () => {
    const a = classifyUpload({ filename: 'cube.glb', mime: 'model/gltf-binary', bytes: glb() });
    expect(a).toMatchObject({ kind: 'gltf', mime: 'model/gltf-binary', ext: '.glb' });
    const b = classifyUpload({ filename: 'scene.gltf', bytes: Buffer.from(gltfJson()) });
    expect(b).toMatchObject({ kind: 'gltf', mime: 'model/gltf+json', ext: '.gltf' });
  });

  it('扩展名大小写不敏感，octet-stream 视为未知类型放行', () => {
    expect(classifyUpload({ filename: 'CUBE.GLB', bytes: glb() }).ext).toBe('.glb');
    expect(classifyUpload({ filename: 'a.glb', mime: 'application/octet-stream', bytes: glb() }).mime).toBe(
      'model/gltf-binary',
    );
  });

  it('非白名单扩展名报 E_ASSET_TYPE 并带候选', () => {
    expect(codeOf(() => classifyUpload({ filename: 'notes.txt', bytes: Buffer.from('hi') }))).toBe(
      'E_ASSET_TYPE',
    );
    try {
      classifyUpload({ filename: 'model.fbx', bytes: Buffer.from('x') });
    } catch (e) {
      expect((e as { data?: { allowed?: string[] } }).data?.allowed).toEqual(['.glb', '.gltf']);
    }
    expect(codeOf(() => classifyUpload({ filename: 'noext', bytes: glb() }))).toBe('E_ASSET_TYPE');
  });

  it('MIME 与扩展名冲突报 E_ASSET_TYPE', () => {
    try {
      classifyUpload({ filename: 'cube.glb', mime: 'text/plain', bytes: glb() });
      throw new Error('should throw');
    } catch (e) {
      const err = e as { code?: string; data?: { mime?: string; allowed?: string[] } };
      expect(err.code).toBe('E_ASSET_TYPE');
      expect(err.data?.mime).toBe('text/plain');
      expect(err.data?.allowed).toEqual(['model/gltf-binary', 'model/gltf+json', 'application/octet-stream']);
    }
  });

  it('空文件与伪装扩展名报 E_ASSET_FORMAT', () => {
    expect(codeOf(() => classifyUpload({ filename: 'empty.glb', bytes: Buffer.alloc(0) }))).toBe(
      'E_ASSET_FORMAT',
    );
    expect(codeOf(() => classifyUpload({ filename: 'fake.glb', bytes: Buffer.from('not a glb') }))).toBe(
      'E_ASSET_FORMAT',
    );
    expect(codeOf(() => classifyUpload({ filename: 'fake.gltf', bytes: Buffer.from('[1,2]') }))).toBe(
      'E_ASSET_FORMAT',
    );
  });

  it('超过 64 MB 报 E_PAYLOAD_TOO_LARGE', () => {
    expect(
      codeOf(() => classifyUpload({ filename: 'big.glb', bytes: Buffer.alloc(MAX_UPLOAD_BYTES + 1) })),
    ).toBe('E_PAYLOAD_TOO_LARGE');
  });
});
