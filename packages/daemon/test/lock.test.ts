import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireLock } from '../src/lock';

const dirs: string[] = [];
function home(): string {
  const dir = mkdtempSync(join(tmpdir(), 'v3d-lock-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('acquireLock', () => {
  it('写入自身 pid，二进持有者被拒，release 删除锁文件', () => {
    const dir = home();
    const release = acquireLock(dir);
    expect(readFileSync(join(dir, 'lock'), 'utf8')).toBe(String(process.pid));
    expect(() => acquireLock(dir)).toThrowError(/已有 daemon 持有锁/);
    release();
    expect(existsSync(join(dir, 'lock'))).toBe(false);
  });

  it('抢占 kill -9 遗留的陈旧锁', () => {
    const dir = home();
    const { pid } = spawnSync(process.execPath, ['-e', '0']);
    writeFileSync(join(dir, 'lock'), String(pid));
    const release = acquireLock(dir);
    expect(readFileSync(join(dir, 'lock'), 'utf8')).toBe(String(process.pid));
    release();
  });

  it('锁内容损坏按陈旧处理', () => {
    const dir = home();
    writeFileSync(join(dir, 'lock'), 'garbage');
    const release = acquireLock(dir);
    expect(readFileSync(join(dir, 'lock'), 'utf8')).toBe(String(process.pid));
    release();
  });

  it('home 不存在时自动创建', () => {
    const dir = join(home(), 'nested', 'home');
    const release = acquireLock(dir);
    expect(existsSync(join(dir, 'lock'))).toBe(true);
    release();
  });
});
