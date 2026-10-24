import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BlobStore } from '../src/assets/blobstore';
import { createIngest } from '../src/assets/ingest';
import { glb, gltfJson } from './helpers/glb';

const setup = (fetchImpl?: typeof fetch) => {
  const root = mkdtempSync(join(tmpdir(), 'v3d-ingest-'));
  const blobs = new BlobStore(join(root, 'blobs'));
  const dir = mkdtempSync(join(tmpdir(), 'v3d-src-'));
  return { dir, blobs, ...createIngest({ blobs, fetchImpl }) };
};

describe('ingest: 本地文件', () => {
  it('解析 GLB、写入内容寻址存储并命中缓存', async () => {
    const { dir, blobs, ingest } = setup();
    const file = join(dir, 'walk.glb');
    writeFileSync(file, glb());
    const first = await ingest(file);
    expect(first.cached).toBe(false);
    expect(first.meta.mime).toBe('model/gltf-binary');
    expect(first.meta.kind).toBe('gltf');
    expect(existsSync(blobs.path(first.meta.sha))).toBe(true);
    const again = await ingest(file);
    expect(again.cached).toBe(true);
    expect(again.meta.sha).toBe(first.meta.sha);
  });

  it('glTF JSON 使用 model/gltf+json，远程超长文件名截断到 300', async () => {
    const fetchImpl = vi.fn(async () => new Response(gltfJson(), { status: 200 })) as unknown as typeof fetch;
    const { dir, ingest, inspect } = setup(fetchImpl);
    const file = join(dir, 'scene.gltf');
    writeFileSync(file, gltfJson());
    const result = await ingest(file);
    expect(result.meta.mime).toBe('model/gltf+json');
    const inspected = await inspect(file);
    expect(inspected.report.selfContained).toBe(true);

    const remote = await ingest(`https://cdn.example.com/${'a'.repeat(320)}.gltf`, 'allow');
    expect(remote.meta.name).toHaveLength(300);
  });

  it('文件不存在时报 E_ASSET_MISSING', async () => {
    const { dir, inspect } = setup();
    await expect(inspect(join(dir, 'missing.glb'))).rejects.toMatchObject({ code: 'E_ASSET_MISSING' });
  });

  it('非白名单扩展名与大小写扩展名', async () => {
    const { dir, ingest } = setup();
    const txt = join(dir, 'notes.txt');
    writeFileSync(txt, 'hi');
    await expect(ingest(txt)).rejects.toMatchObject({ code: 'E_ASSET_TYPE' });

    const upper = join(dir, 'CUBE.GLB');
    writeFileSync(upper, glb());
    await expect(ingest(upper)).resolves.toMatchObject({ meta: { mime: 'model/gltf-binary' } });
  });
});

describe('ingest: 远程地址与策略', () => {
  it('policy=local 允许 loopback，拒绝外网域名', async () => {
    const fetchImpl = vi.fn(async () => new Response(glb(), { status: 200 })) as unknown as typeof fetch;
    const { ingest } = setup(fetchImpl);
    const ok = await ingest('http://localhost:9000/a.glb');
    expect(ok.meta.name).toBe('a.glb');
    await expect(ingest('https://example.com/a.glb')).rejects.toMatchObject({ code: 'E_UNSUPPORTED' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('policy=strict 直接拒绝网络地址', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const { ingest } = setup(fetchImpl);
    await expect(ingest('http://127.0.0.1:1/a.glb', 'strict')).rejects.toMatchObject({
      code: 'E_UNSUPPORTED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('policy=allow 下载远端资产，路径为空时回落 remote.glb', async () => {
    const fetchImpl = vi.fn(async () => new Response(glb(), { status: 200 })) as unknown as typeof fetch;
    const { ingest } = setup(fetchImpl);
    const result = await ingest('https://cdn.example.com/', 'allow');
    expect(result.meta.name).toBe('remote.glb');
    expect(result.report?.tris).toBe(1);
  });

  it('下载失败与超过 64 MB 分别报错', async () => {
    const missing = vi.fn(async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
    const a = setup(missing);
    await expect(a.ingest('https://cdn.example.com/a.glb', 'allow')).rejects.toMatchObject({
      code: 'E_ASSET_MISSING',
    });

    const huge = vi.fn(
      async () => new Response(Buffer.alloc(64 * 1024 * 1024 + 1), { status: 200 }),
    ) as unknown as typeof fetch;
    const b = setup(huge);
    await expect(b.ingest('https://cdn.example.com/big.glb', 'allow')).rejects.toMatchObject({
      code: 'E_PAYLOAD_TOO_LARGE',
    });
  });
});
