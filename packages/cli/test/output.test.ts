import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Studio, mockTransport } from '@vibebyte/vibe3d-client';
import { describe, expect, it } from 'vitest';
import { settleJob, writeImages } from '../src/output';

const png = Buffer.from('png').toString('base64');

describe('cli output', () => {
  it('单图 + --out 写文件且 JSON 去掉 base64', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vibe3d-out-'));
    const out = join(dir, 'a.png');
    const result = await writeImages({ base64: png, mime: 'image/png', width: 1 }, out);
    expect(result).toMatchObject({ path: out, mime: 'image/png' });
    expect(result).not.toHaveProperty('base64');
    expect((await readFile(out)).equals(Buffer.from('png'))).toBe(true);
  });

  it('多图 + --out 按 view 命名写入目录', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vibe3d-views-'));
    const result = (await writeImages(
      {
        shots: [
          { view: 'front', base64: png, mime: 'image/png' },
          { view: 'top', base64: png, mime: 'image/png' },
        ],
      },
      dir,
    )) as { shots: { path: string }[] };
    expect(result.shots[0]?.path.endsWith('front.png')).toBe(true);
    expect(result.shots[1]?.path.endsWith('top.png')).toBe(true);
  });

  it('无 --out 原样返回', async () => {
    const shot = { base64: png, mime: 'image/png' };
    expect(await writeImages(shot, undefined)).toEqual(shot);
  });

  it('--out 给了但结果里没有图片时报错', async () => {
    await expect(writeImages({ ok: true }, '/tmp/x.png')).rejects.toThrow(/--out/);
  });

  it('默认等待任务完成', async () => {
    const calls: string[] = [];
    let n = 0;
    const studio = Studio.over(
      mockTransport({
        dispatch: async (method) => {
          calls.push(method);
          if (method !== 'job.get') return { jobId: 'j1' };
          n += 1;
          return n < 2
            ? { jobId: 'j1', state: 'running' }
            : { jobId: 'j1', state: 'done', url: '/a.glb', revision: 1 };
        },
      }),
    );
    const job = await settleJob(studio, { jobId: 'j1' }, 'file', {}, fetch, 20);
    expect(job).toMatchObject({ state: 'done' });
    expect(calls.filter((method) => method === 'job.get').length).toBeGreaterThan(1);
  });

  it('--no-wait 直接返回快照', async () => {
    const calls: string[] = [];
    const studio = Studio.over(
      mockTransport({
        dispatch: async (method) => {
          calls.push(method);
          return { jobId: 'j1', state: 'running' };
        },
      }),
    );
    const job = await settleJob(studio, { jobId: 'j1', state: 'running' }, 'file', { wait: false });
    expect(job).toMatchObject({ state: 'running' });
    expect(calls).toEqual([]);
  });

  it('--timeout 超时报错', async () => {
    const studio = Studio.over(
      mockTransport({
        dispatch: async () => ({ jobId: 'j1', state: 'running' }),
      }),
    );
    await expect(
      settleJob(studio, { jobId: 'j1' }, 'file', { timeout: '0.05' }, fetch, 20),
    ).rejects.toMatchObject({
      code: 'E_TIMEOUT',
    });
  });

  it('job file + --out 下载产物', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vibe3d-glb-'));
    const out = join(dir, 'a.glb');
    const studio = Studio.over(
      mockTransport({
        dispatch: async () => ({ jobId: 'j1', state: 'done', url: '/a.glb', revision: 3 }),
      }),
    );
    const fetchImpl = async () => new Response(new Uint8Array([9, 8, 7]));
    const result = await settleJob(
      studio,
      { jobId: 'j1', state: 'done', url: '/a.glb', revision: 3 },
      'file',
      { out },
      fetchImpl as typeof fetch,
      20,
    );
    expect(result).toMatchObject({ path: out, bytes: 3, jobId: 'j1', revision: 3 });
    expect((await readFile(out)).equals(Buffer.from([9, 8, 7]))).toBe(true);
  });

  it('job frames + --out 下载 manifest 与全部帧', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vibe3d-seq-'));
    const studio = Studio.over(
      mockTransport({
        dispatch: async () => ({ jobId: 'j1', state: 'done', url: '/manifest' }),
      }),
    );
    const manifest = {
      frames: [
        { url: '/f0.png', file: 'f0.png' },
        { url: '/f1.png', file: 'f1.png' },
      ],
    };
    const fetchImpl = async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('.json') || url.endsWith('/manifest')) {
        return new Response(JSON.stringify(manifest));
      }
      return new Response(new Uint8Array([1]));
    };
    const result = (await settleJob(
      studio,
      { jobId: 'j1', state: 'done', url: '/manifest' },
      'frames',
      { out: dir },
      fetchImpl as typeof fetch,
      20,
    )) as { files: string[] };
    expect(await readFile(join(dir, 'manifest.json'), 'utf8')).toContain('f0.png');
    expect(result.files).toHaveLength(2);
  });

  it('任务失败时报错而不是成功输出', async () => {
    const studio = Studio.over(
      mockTransport({
        dispatch: async () => ({ jobId: 'j1', state: 'failed', error: { message: '渲染失败' } }),
      }),
    );
    await expect(settleJob(studio, { jobId: 'j1' }, 'file', {}, fetch, 20)).rejects.toThrow(/渲染失败/);
  });

  it('下载 HTTP 非 2xx 报错', async () => {
    const studio = Studio.over(
      mockTransport({
        dispatch: async () => ({ jobId: 'j1', state: 'done', url: '/missing.glb' }),
      }),
    );
    const fetchImpl = async () => new Response('no', { status: 404 });
    await expect(
      settleJob(
        studio,
        { jobId: 'j1', state: 'done', url: '/missing.glb' },
        'file',
        { out: '/tmp/missing.glb' },
        fetchImpl as typeof fetch,
        20,
      ),
    ).rejects.toThrow(/下载失败：HTTP 404/);
  });
});
