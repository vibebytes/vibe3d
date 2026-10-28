import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const entry = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist', 'index.js');

describe('daemon idle exit', () => {
  it('persist daemon 空闲后自杀并清理 run 记录', async () => {
    const home = mkdtempSync(join(tmpdir(), 'vibe3d-idle-'));
    const child = spawn(
      process.execPath,
      [
        entry,
        '--persist',
        '--renderer',
        'none',
        '--home',
        home,
        '--daemon-idle-ms=2500',
        '--port=0',
        '--gc=off',
        '--open-editor=false',
      ],
      { stdio: 'ignore' },
    );
    const [code] = (await once(child, 'exit')) as [number, string | null];
    expect(code).toBe(0);
    const runDir = join(home, 'run');
    if (existsSync(runDir)) expect(readdirSync(runDir)).toEqual([]);
  }, 20_000);

  it('ephemeral daemon 没有房间时也会空闲退出', async () => {
    const home = mkdtempSync(join(tmpdir(), 'vibe3d-idle-eph-'));
    const child = spawn(
      process.execPath,
      [
        entry,
        '--renderer',
        'none',
        '--home',
        home,
        '--daemon-idle-ms=2500',
        '--port=0',
        '--open-editor=false',
      ],
      { stdio: 'ignore' },
    );
    const [code] = (await once(child, 'exit')) as [number, string | null];
    expect(code).toBe(0);
    const runDir = join(home, 'run');
    if (existsSync(runDir)) expect(readdirSync(runDir)).toEqual([]);
  }, 20_000);
});
