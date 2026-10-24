import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BlobStore } from '../src/assets/blobstore';
import { createIngest } from '../src/assets/ingest';
import { glb, gltfJson } from './helpers/glb';
import { call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'v3d-policy-'));
  const blobs = new BlobStore(join(root, 'blobs'));
  const dir = mkdtempSync(join(tmpdir(), 'v3d-policy-src-'));
  const fetchImpl = vi.fn(async () => new Response(glb(), { status: 200 })) as unknown as typeof fetch;
  return { dir, fetchImpl, ...createIngest({ blobs, fetchImpl }) };
}

describe('asset policy: 拒绝时给出下一步', () => {
  it('strict 不碰网络，并指明先用 put_asset 预注册', async () => {
    const { ingest, fetchImpl } = setup();
    const url = 'http://127.0.0.1:1/a.glb';
    const err = await ingest(url, 'strict').catch((e) => e);
    expect(err.code).toBe('E_UNSUPPORTED');
    expect(err.data.next).toEqual({
      tool: 'vibe3d_put_asset',
      params: { src: url, policy: 'allow' },
      after: 'vibe3d_import_asset{sha}',
    });
    expect(String(err.data.hint)).toContain('put_asset');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('local 拒绝外网域名时给出 allow 的具体写法', async () => {
    const { ingest } = setup();
    const err = await ingest('https://cdn.example.com/a.glb', 'local').catch((e) => e);
    expect(err.code).toBe('E_UNSUPPORTED');
    expect(err.data.next.params).toEqual({ src: 'https://cdn.example.com/a.glb', policy: 'allow' });
    expect(String(err.data.hint)).toContain('policy');
  });

  it('glTF 外部引用报错保留 missing 并给内嵌命令', async () => {
    const { dir, inspect } = setup();
    const file = join(dir, 'ext.gltf');
    writeFileSync(
      file,
      JSON.stringify({
        ...JSON.parse(gltfJson().toString()),
        buffers: [{ uri: 'scene.bin', byteLength: 12 }],
      }),
    );
    const err = await inspect(file).catch((e) => e);
    expect(err.code).toBe('E_ASSET_EXTERNAL_REFS');
    expect(err.data.missing).toEqual(['scene.bin']);
    expect(String(err.data.hint)).toContain('gltf-transform');
  });
});

describe('asset policy: strict 下外链须预注册', () => {
  const tmpGlb = () => {
    const dir = mkdtempSync(join(tmpdir(), 'v3d-policy-file-'));
    const path = join(dir, 'walk.glb');
    writeFileSync(path, glb({ min: [0, 0, 0], max: [1, 2, 1] }));
    return path;
  };

  it('先 put_asset 再按 sha 导入，strict 也放行', async () => {
    const h = makeHarness();
    const { body: room } = await call(h, 'room.create', { name: 'p' });
    const roomId = room.result.roomId;
    const { body: put } = await call(h, 'asset.put', { roomId, src: tmpGlb() }, roomId);
    const { body } = await call(h, 'node.import', { roomId, sha: put.result.sha, policy: 'strict' }, roomId);
    expect(body.result.nodeId).toBeTruthy();
  });

  it('未预注册的 http 地址在 RPC 层就带出 next，且不建节点', async () => {
    const h = makeHarness();
    const { body: room } = await call(h, 'room.create', { name: 'p' });
    const roomId = room.result.roomId;
    const before = await call(h, 'scene.get', { roomId }, roomId);
    const { body } = await call(
      h,
      'node.import',
      { roomId, src: 'http://127.0.0.1:1/a.glb', policy: 'strict' },
      roomId,
    );
    expect(codeOf(body)).toBe('E_UNSUPPORTED');
    expect(body.error.data.next.tool).toBe('vibe3d_put_asset');
    const after = await call(h, 'scene.get', { roomId }, roomId);
    expect(Object.keys(after.body.result.doc.nodes)).toHaveLength(
      Object.keys(before.body.result.doc.nodes).length,
    );
  });

  it('strict 只管网络来源，本地文件照常导入', async () => {
    const h = makeHarness();
    const { body: room } = await call(h, 'room.create', { name: 'p' });
    const roomId = room.result.roomId;
    const { body } = await call(h, 'node.import', { roomId, src: tmpGlb(), policy: 'strict' }, roomId);
    expect(body.result.report.size.max[1]).toBe(2);
  });
});
