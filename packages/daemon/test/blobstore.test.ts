import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BlobStore } from '../src/assets/blobstore';

const DAY = 86_400_000;

function store(): { b: BlobStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'vibe3d-blobs-'));
  return { b: new BlobStore(dir), dir };
}

function age(store: BlobStore, sha: string, days: number): void {
  const t = new Date(Date.now() - days * DAY);
  utimesSync(store.path(sha), t, t);
}

describe('blob GC', () => {
  it('保留被引用对象，删除无引用且过期对象', async () => {
    const { b } = store();
    const live = await b.put(Buffer.from('live'));
    const stale = await b.put(Buffer.from('stale'));
    const fresh = await b.put(Buffer.from('fresh'));
    age(b, stale, 30);
    age(b, live, 30);

    const r = await b.prune([live], 7 * DAY);
    expect(r.removed).toBe(1);
    expect(r.bytes).toBe(5);
    expect(existsSync(b.path(live))).toBe(true);
    expect(existsSync(b.path(stale))).toBe(false);
    expect(existsSync(b.path(fresh))).toBe(true);
  });

  it('maxAge=0 回收一切无引用对象；重复 prune 幂等', async () => {
    const { b } = store();
    const sha = await b.put(Buffer.from('x'));
    age(b, sha, 0.001);
    expect((await b.prune([], 0)).removed).toBe(1);
    expect((await b.prune([], 0)).removed).toBe(0);
    expect(existsSync(b.path(sha))).toBe(false);
  });

  it('清理过期 tmp 残片，保留被引用的真身', async () => {
    const { b, dir } = store();
    const sha = await b.put(Buffer.from('y'));
    const shard = join(dir, sha.slice(0, 2), sha.slice(2, 4));
    const tmp = join(shard, `${sha}.tmp`);
    writeFileSync(tmp, 'partial');
    const old = new Date(Date.now() - 10 * DAY);
    utimesSync(tmp, old, old);

    const r = await b.prune([sha], 7 * DAY);
    expect(r.removed).toBe(1);
    expect(existsSync(tmp)).toBe(false);
    expect(existsSync(b.path(sha))).toBe(true);
  });

  it('空分片目录不影响 prune', async () => {
    const { b, dir } = store();
    mkdirSync(join(dir, 'zz'), { recursive: true });
    await expect(b.prune([], 7 * DAY)).resolves.toEqual({ removed: 0, bytes: 0 });
  });
});
