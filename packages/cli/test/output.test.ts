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
    const job = await settleJob(studio, { jobId: 'j1' }, 'file', {});
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
});
