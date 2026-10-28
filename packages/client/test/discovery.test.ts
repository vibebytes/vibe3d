import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connect,
  listRuns,
  probeRemoteHome,
  resetSpawnGate,
  resolveDaemonEntry,
  startBudgetMs,
  startDaemon,
} from '../src/discovery';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

describe('daemon 入口解析', () => {
  it('没有 node_modules link 时回退到同仓构建产物', () => {
    const entry = resolveDaemonEntry();
    expect(existsSync(entry.file)).toBe(true);
    expect(entry.file.endsWith('daemon/dist/index.js')).toBe(true);
  });
});

describe('启动等待预算', () => {
  it('空 home 用 15s 基线', () => {
    expect(startBudgetMs(0, {})).toBe(15_000);
  });

  it('房间越多预算越大，且封顶 45s', () => {
    expect(startBudgetMs(16, {})).toBeGreaterThan(15_000);
    expect(startBudgetMs(1000, {})).toBe(45_000);
  });

  it('VIBE3D_START_TIMEOUT_MS 可覆盖', () => {
    expect(startBudgetMs(16, { VIBE3D_START_TIMEOUT_MS: '90000' })).toBe(90_000);
    expect(startBudgetMs(16, { VIBE3D_START_TIMEOUT_MS: 'abc' })).toBe(23_000);
  });
});

describe('remote home 探测', () => {
  const serve = async (payload: unknown): Promise<string> => {
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(payload));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    return `http://127.0.0.1:${port}`;
  };

  it('用 daemon /health 的 home 作为账本目录', async () => {
    const url = await serve({ ok: true, home: '/tmp/v3d-home' });
    expect(await probeRemoteHome(url)).toBe('/tmp/v3d-home');
  });

  it('没有 home 或连不上时回退 undefined，不抛错', async () => {
    const url = await serve({ ok: true });
    expect(await probeRemoteHome(url)).toBeUndefined();
    expect(await probeRemoteHome('http://127.0.0.1:1', 200)).toBeUndefined();
  });
});

describe('无 token daemon（默认鉴权关闭）', () => {
  it('run 文件缺 token 字段仍被发现', () => {
    const home = mkdtempSync(join(tmpdir(), 'v3d-run-'));
    mkdirSync(join(home, 'run'), { recursive: true });
    writeFileSync(
      join(home, 'run', `${process.pid}.json`),
      JSON.stringify({
        pid: process.pid,
        port: 59999,
        host: '127.0.0.1',
        home,
        mode: 'ephemeral',
        version: 'test',
        startedAt: new Date().toISOString(),
      }),
    );
    const runs = listRuns(home);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.token).toBeUndefined();
  });

  it('connect 指定 url 不带 token 不再抛错', async () => {
    delete process.env.VIBE3D_TOKEN;
    const run = await connect({ url: 'http://127.0.0.1:1' });
    expect(run.client).toBeTruthy();
    expect(run.token).toBeUndefined();
  });
});

describe('startDaemon 失败诊断与冷却门闩', () => {
  const makeChild = () => {
    const child = new EventEmitter() as unknown as EventEmitter & {
      stderr: EventEmitter;
      exitCode: number | null;
      pid: number;
      unref: () => void;
    };
    child.stderr = Object.assign(new EventEmitter(), { destroy: () => undefined });
    child.exitCode = null;
    child.pid = 424242;
    child.unref = vi.fn();
    return child;
  };

  beforeEach(() => {
    spawnMock.mockReset();
    resetSpawnGate();
  });

  it('spawn 失败：错误信息携带子进程 stderr 尾部，且 child 已 unref', async () => {
    const home = mkdtempSync(join(tmpdir(), 'v3d-spawn-'));
    const child = makeChild();
    spawnMock.mockReturnValue(child);
    setTimeout(() => {
      child.stderr.emit('data', 'Error: Cannot find module /broken/daemon.js');
      child.exitCode = 1;
      child.emit('exit', 1, null);
    }, 30);
    const err = await startDaemon({ home }).catch((e: unknown) => e);
    expect((err as Error).message).toContain('Cannot find module');
    expect((err as { code?: string }).code).toBe('E_NO_DAEMON');
    expect(child.unref).toHaveBeenCalled();
  });

  it('同一 home 启动失败后进入冷却：冷却期内快速失败，不再 spawn', async () => {
    const home = mkdtempSync(join(tmpdir(), 'v3d-spawn-'));
    spawnMock.mockImplementation(() => {
      const child = makeChild();
      setTimeout(() => {
        child.exitCode = 1;
        child.emit('exit', 1, null);
      }, 30);
      return child;
    });
    await expect(startDaemon({ home })).rejects.toThrow(/退出码 1/);
    const t0 = Date.now();
    await expect(startDaemon({ home })).rejects.toThrow(/冷却/);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('VIBE3D_SPAWN_COOLDOWN_MS=0 关闭门闩：冷却期内仍允许再次 spawn', async () => {
    const prev = process.env.VIBE3D_SPAWN_COOLDOWN_MS;
    process.env.VIBE3D_SPAWN_COOLDOWN_MS = '0';
    try {
      const home = mkdtempSync(join(tmpdir(), 'v3d-spawn-'));
      spawnMock.mockImplementation(() => {
        const child = makeChild();
        setTimeout(() => {
          child.exitCode = 1;
          child.emit('exit', 1, null);
        }, 30);
        return child;
      });
      await expect(startDaemon({ home })).rejects.toThrow();
      await expect(startDaemon({ home })).rejects.toThrow();
      expect(spawnMock).toHaveBeenCalledTimes(2);
    } finally {
      if (prev === undefined) delete process.env.VIBE3D_SPAWN_COOLDOWN_MS;
      else process.env.VIBE3D_SPAWN_COOLDOWN_MS = prev;
    }
  });

  it('child error 事件被捕获并转为拒绝，而不是未处理异常', async () => {
    const home = mkdtempSync(join(tmpdir(), 'v3d-spawn-'));
    const child = makeChild();
    spawnMock.mockReturnValue(child);
    setTimeout(() => child.emit('error', new Error('spawn ENOENT')), 30);
    await expect(startDaemon({ home })).rejects.toThrow(/spawn ENOENT/);
  });
});
