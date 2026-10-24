import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../src/config';
import { EditorRenderer } from '../src/render/editor';
import { createRenderer } from '../src/render/index';
import type { WsHub } from '../src/ws/hub';
import { makeHarness, silentLogger } from './helpers/harness';

const state = vi.hoisted(() => ({
  executable: '/fake/chrome' as string | null,
  shot: 'AAA' as string | undefined,
  evalQueue: [] as unknown[],
  navFailures: 0,
  launches: 0,
}));

vi.mock('../src/render/chrome', () => ({
  findChrome: () => state.executable,
  launchChrome: async () => {
    state.launches++;
    return { wsUrl: 'ws://mock', close: async () => undefined };
  },
}));

vi.mock('../src/render/cdp', () => {
  class CdpError extends Error {
    constructor(
      message: string,
      readonly method: string,
    ) {
      super(message);
    }
  }
  class Cdp {
    isClosed = false;
    static async connect(): Promise<Cdp> {
      return new Cdp();
    }
    async send(method: string): Promise<unknown> {
      if (method === 'Target.createTarget') return { targetId: 't1' };
      if (method === 'Target.attachToTarget') return { sessionId: 's1' };
      if (method === 'Runtime.evaluate')
        return state.evalQueue.shift() ?? { result: { value: { ready: true } } };
      if (method === 'Page.captureScreenshot') return state.shot === undefined ? {} : { data: state.shot };
      if (method === 'Page.navigate' && state.navFailures > 0) {
        state.navFailures--;
        throw new CdpError('lost', 'connect');
      }
      return {};
    }
    on(): () => void {
      return () => undefined;
    }
    close(): void {
      this.isClosed = true;
    }
  }
  return { Cdp, CdpError };
});

function png(width: number, height: number): string {
  const buf = Buffer.alloc(24);
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf.toString('base64');
}

const input = { roomId: 'r_aaaaaaaa', doc: {} as any };

describe('EditorRenderer', () => {
  it('reads PNG dimensions and falls back to requested size', async () => {
    const r = new EditorRenderer({
      requestSnapshot: async () => ({ base64: png(64, 32) }),
    } as unknown as WsHub);
    expect(r.ready).toBe(true);
    await expect(r.snapshot(input)).resolves.toMatchObject({ width: 64, height: 32 });
    const bogus = new EditorRenderer({
      requestSnapshot: async () => ({ base64: 'oops' }),
    } as unknown as WsHub);
    await expect(bogus.snapshot(input, { width: 800, height: 600 })).resolves.toMatchObject({
      width: 800,
      height: 600,
    });
  });

  it('maps hub failures and unsupported exports to E_RENDER_UNAVAILABLE', async () => {
    const r = new EditorRenderer({
      requestSnapshot: async () => {
        throw new Error('offline');
      },
    } as unknown as WsHub);
    await expect(r.snapshot(input)).rejects.toMatchObject({ code: 'E_RENDER_UNAVAILABLE' });
    await expect(r.exportGlb()).rejects.toMatchObject({ code: 'E_RENDER_UNAVAILABLE' });
  });
});

describe('createRenderer', () => {
  const cfg = (renderer: string) =>
    parseConfig(['--token', 'test-token-0123456789', '--renderer', renderer, '--home', '/tmp'], {});

  it('honours each renderer mode', () => {
    const hub = { count: () => 0 } as unknown as WsHub;
    const base = {
      hub,
      logger: silentLogger(),
      baseUrl: () => 'http://127.0.0.1:1',
      exportsDir: '/tmp/v3d-exports',
    };
    expect(createRenderer({ config: cfg('none'), ...base })).toBeUndefined();
    const chromium = createRenderer({ config: cfg('chromium'), ...base });
    expect(chromium?.name).toBe('chromium');
    expect(createRenderer({ config: cfg('editor'), ...base })?.name).toBe('editor');
    state.executable = '/fake/chrome';
    const auto = createRenderer({ config: cfg('auto'), ...base });
    expect(auto?.name).toBe('auto');
    expect(auto?.ready).toBe(true);
  });

  it('rejects snapshots when Chrome is missing', async () => {
    state.executable = null;
    const r = createRenderer({
      config: cfg('chromium'),
      hub: { count: () => 0 } as unknown as WsHub,
      logger: silentLogger(),
      baseUrl: () => 'http://127.0.0.1:1',
      exportsDir: '/tmp/v3d-exports',
    });
    expect(r?.ready).toBe(false);
    await expect(r!.snapshot(input, {})).rejects.toMatchObject({ code: 'E_RENDER_UNAVAILABLE' });
    state.executable = '/fake/chrome';
  });
});

describe('ChromiumRenderer', () => {
  const make = (h: ReturnType<typeof makeHarness>) =>
    createRenderer({
      config: parseConfig(['--token', h.token, '--renderer', 'chromium', '--home', h.root], {}),
      hub: { count: () => 0 } as unknown as WsHub,
      logger: h.logger,
      baseUrl: () => 'http://127.0.0.1:1',
      exportsDir: h.dirs.exports,
    })!;

  it('captures screenshots and exports signed GLB jobs', async () => {
    state.executable = '/fake/chrome';
    state.shot = png(10, 20);
    state.evalQueue = [];
    const h = makeHarness();
    const r = createRenderer({
      config: parseConfig(['--token', h.token, '--renderer', 'chromium', '--home', h.root], {}),
      hub: { count: () => 0 } as unknown as WsHub,
      logger: h.logger,
      baseUrl: () => 'http://127.0.0.1:1',
      exportsDir: h.dirs.exports,
    })!;
    await expect(r.snapshot(input, { settleMs: 0, width: 10, height: 20 })).resolves.toMatchObject({
      width: 10,
      height: 20,
      mime: 'image/png',
    });

    state.evalQueue = [
      { result: { value: { ready: true } } },
      { result: { value: Buffer.from('glb-bytes').toString('base64') } },
    ];
    const job = await r.exportGlb(input, ['n1']);
    expect(job.bytes).toBe(9);
    expect(job.url).toMatch(/^\/exports\/[a-f0-9]{32}\.glb\?exp=\d+&sig=[a-f0-9]{32}$/);
    expect(readdirSync(h.dirs.exports)).toContain(`${job.jobId}.glb`);
    await r.close?.();
  });

  it('rejects an export whose GLB drifts from the doc', async () => {
    state.executable = '/fake/chrome';
    state.evalQueue = [];
    const h = makeHarness();
    const r = createRenderer({
      config: parseConfig(['--token', h.token, '--renderer', 'chromium', '--home', h.root], {}),
      hub: { count: () => 0 } as unknown as WsHub,
      logger: h.logger,
      baseUrl: () => 'http://127.0.0.1:1',
      exportsDir: h.dirs.exports,
    })!;
    const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, nodes: [] }), 'utf8');
    const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
    json.copy(padded);
    const glbBytes = Buffer.alloc(20 + padded.length);
    glbBytes.writeUInt32LE(0x46546c67, 0);
    glbBytes.writeUInt32LE(2, 4);
    glbBytes.writeUInt32LE(glbBytes.length, 8);
    glbBytes.writeUInt32LE(padded.length, 12);
    glbBytes.writeUInt32LE(0x4e4f534a, 16);
    padded.copy(glbBytes, 20);
    state.evalQueue = [
      { result: { value: { ready: true } } },
      { result: { value: glbBytes.toString('base64') } },
    ];
    const doc = {
      nodes: {
        n_00000001: {
          id: 'n_00000001',
          kind: 'mesh',
          name: '台阶',
          parent: null,
          visible: true,
          transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
          geometry: { type: 'box', size: [1, 1, 1] },
          material: 'm_00000001',
        },
      },
      roots: ['n_00000001'],
    };
    await expect(r.exportGlb({ roomId: 'r_aaaaaaaa', doc } as never)).rejects.toMatchObject({
      code: 'E_EXPORT_DRIFT',
    });
    expect(readdirSync(h.dirs.exports)).toEqual([]);
    await r.close?.();
  });

  it('retries once without sandbox after losing the connection', async () => {
    state.navFailures = 1;
    state.launches = 0;
    const h = makeHarness();
    const r = createRenderer({
      config: parseConfig(['--token', h.token, '--renderer', 'chromium', '--home', h.root], {}),
      hub: { count: () => 0 } as unknown as WsHub,
      logger: h.logger,
      baseUrl: () => 'http://127.0.0.1:1',
      exportsDir: h.dirs.exports,
    })!;
    await expect(r.snapshot(input, { settleMs: 0 })).resolves.toBeTruthy();
    expect(state.launches).toBe(2);
    expect(existsSync(h.dirs.exports)).toBe(true);
    await r.close?.();
  });

  it('surfaces missing screenshots as E_RENDER_UNAVAILABLE', async () => {
    state.shot = undefined;
    const h = makeHarness();
    const r = make(h);
    await expect(r.snapshot(input, { settleMs: 0 })).rejects.toMatchObject({ code: 'E_RENDER_UNAVAILABLE' });
    state.shot = 'AAA';
  });
});

describe('AutoRenderer', () => {
  it('prefers a live editor, falls back to chromium, and delegates export', async () => {
    state.shot = png(5, 5);
    const h = makeHarness();
    const settings = parseConfig(['--token', h.token, '--renderer', 'auto', '--home', h.root], {});
    const logger = { ...silentLogger(), warn: vi.fn() };
    const auto = createRenderer({
      config: settings,
      hub: { count: () => 0 } as unknown as WsHub,
      logger,
      baseUrl: () => 'http://127.0.0.1:1',
      exportsDir: h.dirs.exports,
    })!;

    await expect(auto.snapshot(input, { settleMs: 0 })).resolves.toMatchObject({ mime: 'image/png' });

    const hub = {
      count: () => 1,
      requestSnapshot: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as WsHub;
    const auto2 = createRenderer({
      config: settings,
      hub,
      logger,
      baseUrl: () => 'http://127.0.0.1:1',
      exportsDir: h.dirs.exports,
    })!;
    await expect(auto2.snapshot(input, { settleMs: 0 })).resolves.toBeTruthy();
    expect(logger.warn).toHaveBeenCalled();

    const hub3 = {
      count: () => 1,
      requestSnapshot: vi.fn().mockResolvedValue({ base64: png(7, 9) }),
    } as unknown as WsHub;
    const auto3 = createRenderer({
      config: settings,
      hub: hub3,
      logger,
      baseUrl: () => 'http://127.0.0.1:1',
      exportsDir: h.dirs.exports,
    })!;
    await expect(auto3.snapshot(input, {})).resolves.toMatchObject({ width: 7, height: 9 });

    state.evalQueue = [
      { result: { value: { ready: true } } },
      { result: { value: Buffer.from('xyz').toString('base64') } },
    ];
    await expect(auto3.exportGlb(input)).resolves.toMatchObject({ bytes: 3 });
    await auto3.close?.();
  });
});
