import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const SHA = /^[a-f0-9]{64}$/;
const TMP = /^[a-f0-9]{64}\.tmp$/;

export interface PruneResult {
  removed: number;
  bytes: number;
}

export class BlobStore {
  constructor(private readonly root: string) {}

  path(sha: string): string {
    return join(this.root, sha.slice(0, 2), sha.slice(2, 4), sha);
  }

  async put(bytes: Buffer): Promise<string> {
    const sha = createHash('sha256').update(bytes).digest('hex');
    const target = this.path(sha);
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, target);
    return sha;
  }

  readStream(sha: string): NodeJS.ReadableStream {
    return createReadStream(this.path(sha));
  }

  async prune(referenced: Iterable<string>, maxAgeMs: number, now = Date.now()): Promise<PruneResult> {
    const keep = new Set(referenced);
    const result: PruneResult = { removed: 0, bytes: 0 };
    for (const sha of await this.list()) {
      if (keep.has(sha)) continue;
      const file = this.path(sha);
      const info = await stat(file).catch(() => undefined);
      if (!info || now - info.mtimeMs < maxAgeMs) continue;
      await unlink(file).catch(() => undefined);
      result.removed++;
      result.bytes += info.size;
    }
    for (const tmp of await this.listTmp()) {
      const file = join(tmp.dir, tmp.name);
      const info = await stat(file).catch(() => undefined);
      if (!info || now - info.mtimeMs < maxAgeMs) continue;
      await unlink(file).catch(() => undefined);
      result.removed++;
      result.bytes += info.size;
    }
    await this.pruneDirs();
    return result;
  }

  private async list(): Promise<string[]> {
    const out: string[] = [];
    for (const a of await readdir(this.root, { withFileTypes: true }).catch(() => [])) {
      if (!a.isDirectory()) continue;
      const lvl1 = join(this.root, a.name);
      for (const b of await readdir(lvl1, { withFileTypes: true }).catch(() => [])) {
        if (!b.isDirectory()) continue;
        const lvl2 = join(lvl1, b.name);
        for (const name of await readdir(lvl2).catch(() => [])) {
          if (SHA.test(name) && name.startsWith(a.name + b.name)) out.push(name);
        }
      }
    }
    return out;
  }

  private async listTmp(): Promise<Array<{ dir: string; name: string }>> {
    const out: Array<{ dir: string; name: string }> = [];
    for (const a of await readdir(this.root, { withFileTypes: true }).catch(() => [])) {
      if (!a.isDirectory()) continue;
      const lvl1 = join(this.root, a.name);
      for (const b of await readdir(lvl1, { withFileTypes: true }).catch(() => [])) {
        if (!b.isDirectory()) continue;
        const lvl2 = join(lvl1, b.name);
        for (const name of await readdir(lvl2).catch(() => [])) {
          if (TMP.test(name)) out.push({ dir: lvl2, name });
        }
      }
    }
    return out;
  }

  private async pruneDirs(): Promise<void> {
    for (const a of await readdir(this.root, { withFileTypes: true }).catch(() => [])) {
      if (!a.isDirectory()) continue;
      const lvl1 = join(this.root, a.name);
      for (const b of await readdir(lvl1, { withFileTypes: true }).catch(() => [])) {
        if (!b.isDirectory()) continue;
        await rm(join(lvl1, b.name), { recursive: false }).catch(() => undefined);
      }
      await rm(lvl1, { recursive: false }).catch(() => undefined);
    }
  }
}
