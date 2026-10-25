import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BlobStore } from '../src/assets/blobstore';
import { createIngest } from '../src/assets/ingest';
import { parseConfig } from '../src/config';
import { glb } from './helpers/glb';

const blobsAt = () => new BlobStore(join(mkdtempSync(join(tmpdir(), 'v3d-roots-blob-')), 'blobs'));

const dirIn = (prefix: string) => mkdtempSync(join(tmpdir(), prefix));

const fileIn = (prefix: string) => {
  const dir = dirIn(prefix);
  const path = join(dir, 'a.glb');
  writeFileSync(path, glb());
  return path;
};

const token = ['--token', 'x'.repeat(16)];

describe('资产根：本地路径白名单', () => {
  it('根外文件默认拒绝，并给出 policy:"allow" 的下一步与 --asset-root 提示', async () => {
    const allowed = dirIn('v3d-roots-allowed-');
    const outside = fileIn('v3d-roots-outside-');
    const { ingest } = createIngest({ blobs: blobsAt(), roots: [allowed] });

    const err = await ingest(outside).catch((e) => e);
    expect(err.code).toBe('E_UNSUPPORTED');
    expect(err.data.roots).toEqual([resolve(allowed)]);
    expect(err.data.resolved).toBeTruthy();
    expect(err.data.next).toEqual({
      tool: 'vibe3d_put_asset',
      params: { src: outside, policy: 'allow' },
      after: 'vibe3d_import_asset{sha}',
    });
    expect(String(err.data.hint)).toContain('--asset-root');
    expect(String(err.data.hint)).toContain('policy');
  });

  it('policy:"allow" 放行资产根之外的本地文件', async () => {
    const allowed = dirIn('v3d-roots-allowed-');
    const outside = fileIn('v3d-roots-outside-');
    const { ingest, inspect } = createIngest({ blobs: blobsAt(), roots: [allowed] });

    const put = await ingest(outside, 'allow');
    expect(put.meta.name).toBe('a.glb');
    expect(put.meta.kind).toBe('gltf');
    const probe = await inspect(outside, 'allow');
    expect(probe.report.tris).toBe(1);
  });

  it('policy:"strict" 只管网络，根外本地文件仍拒绝', async () => {
    const allowed = dirIn('v3d-roots-allowed-');
    const outside = fileIn('v3d-roots-outside-');
    const { ingest } = createIngest({ blobs: blobsAt(), roots: [allowed] });
    await expect(ingest(outside, 'strict')).rejects.toMatchObject({ code: 'E_UNSUPPORTED' });
  });

  it('根内符号链接指向根外时仍然拒绝', async () => {
    const allowed = dirIn('v3d-roots-allowed-');
    const outside = fileIn('v3d-roots-outside-');
    const link = join(allowed, 'link.glb');
    symlinkSync(outside, link);
    const { ingest } = createIngest({ blobs: blobsAt(), roots: [allowed] });
    await expect(ingest(link)).rejects.toMatchObject({ code: 'E_UNSUPPORTED' });
  });

  it('根内嵌套目录正常放行', async () => {
    const allowed = dirIn('v3d-roots-allowed-');
    const nested = join(allowed, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    const file = join(nested, 'a.glb');
    writeFileSync(file, glb());
    const { ingest } = createIngest({ blobs: blobsAt(), roots: [allowed] });
    await expect(ingest(file)).resolves.toMatchObject({ meta: { kind: 'gltf' } });
  });
});

describe('资产根：默认值与配置', () => {
  it('未配置时默认放行 cwd、临时目录与用户主目录', () => {
    const cfg = parseConfig(token, {});
    expect(cfg.assetRoots).toEqual([...new Set([process.cwd(), tmpdir(), homedir()].map((p) => resolve(p)))]);
  });

  it('--asset-root 可重复传入并累积', () => {
    const cfg = parseConfig([...token, '--asset-root', '/aaa', '--asset-root', '/bbb'], {});
    expect(cfg.assetRoots).toEqual([resolve('/aaa'), resolve('/bbb')]);
  });

  it('VIBE3D_ASSET_ROOTS 支持逗号分隔', () => {
    const cfg = parseConfig(token, { VIBE3D_ASSET_ROOTS: '/aaa, /bbb' });
    expect(cfg.assetRoots).toEqual([resolve('/aaa'), resolve('/bbb')]);
  });
});
