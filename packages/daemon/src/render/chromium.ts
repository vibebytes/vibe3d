import { createHmac, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AppError } from '@vibebyte/vibe3d-protocol';
import type { RenderInput, Renderer, Snapshot, SnapshotOptions } from '../context';
import type { Logger } from '../logger';
import { Cdp, CdpError } from './cdp';
import { type ChromeHandle, findChrome, launchChrome } from './chrome';

interface PageSession {
  sessionId: string;
  targetId: string;
}

export interface ChromiumOptions {
  token: string;
  baseUrl: () => string;
  exportsDir: string;
  chromePath?: string;
  logger: Logger;
  navigateTimeoutMs?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class ChromiumRenderer implements Renderer {
  readonly name = 'chromium';
  readonly executable: string | null;
  private chrome?: ChromeHandle;
  private cdp?: Cdp;
  private booting?: Promise<Cdp>;
  private page?: PageSession;
  private queue: Promise<unknown> = Promise.resolve();
  private lastErrorAt = 0;
  private noSandbox = /^(1|true|yes|on)$/i.test(process.env.VIBE3D_CHROME_NO_SANDBOX ?? '');

  constructor(private readonly opts: ChromiumOptions) {
    this.executable = findChrome(opts.chromePath);
  }

  get ready(): boolean {
    return this.executable !== null && Date.now() - this.lastErrorAt > 60_000;
  }

  available(): boolean {
    return this.ready;
  }

  async snapshot(input: RenderInput, opts: SnapshotOptions = {}): Promise<Snapshot> {
    const width = opts.width ?? 1280;
    const height = opts.height ?? 720;
    const format = opts.format ?? 'png';
    return this.serial(() =>
      this.withRecovery(async () => {
        const page = await this.openPage(input.roomId, width, height);
        await sleep(opts.settleMs ?? 180);
        const captured = await this.cdp?.send<{
          result: {
            value?: { base64?: string; mime?: string; width?: number; height?: number } | string | null;
          };
        }>(
          'Runtime.evaluate',
          {
            expression: `window.__vibe3dCapture?.(${JSON.stringify({
              width,
              height,
              format,
              at: opts.at,
              transparent: opts.transparent,
              camera: opts.camera,
              shading: opts.shading,
              overlay: opts.overlay,
            })}) ?? null`,
            awaitPromise: true,
            returnByValue: true,
          },
          page.sessionId,
          60_000,
        );
        const value = captured?.result?.value;
        if (typeof value === 'string') {
          if (value.length > 0) return { mime: 'image/png', base64: value, width, height };
        } else if (value?.base64) {
          return {
            mime: value.mime ?? `image/${format}`,
            base64: value.base64,
            width: value.width ?? width,
            height: value.height ?? height,
          };
        }
        const shot = await this.cdp?.send<{ data: string }>(
          'Page.captureScreenshot',
          {
            format,
            quality: format === 'jpeg' ? 88 : undefined,
            fromSurface: true,
            captureBeyondViewport: false,
          },
          page.sessionId,
        );
        if (!shot?.data) throw new AppError('E_RENDER_UNAVAILABLE', '页面未返回截图');
        return { mime: `image/${format}`, base64: shot.data, width, height };
      }),
    );
  }

  async exportGlb(
    input: RenderInput,
    nodeIds?: string[],
  ): Promise<{ jobId: string; url: string; bytes: number }> {
    return this.serial(() =>
      this.withRecovery(async () => {
        const page = await this.openPage(input.roomId, 1280, 720);
        const expr = `window.__vibe3dExport?.(${JSON.stringify(nodeIds ?? null)})`;
        const res = await this.cdp?.send<{ result: { value?: string | null } }>(
          'Runtime.evaluate',
          { expression: expr, awaitPromise: true, returnByValue: true },
          page.sessionId,
          60_000,
        );
        const base64 = res?.result?.value;
        if (!base64 || typeof base64 !== 'string') {
          throw new AppError('E_RENDER_UNAVAILABLE', '页面未返回 GLB 数据');
        }
        const bytes = Buffer.from(base64, 'base64');
        const jobId = randomUUID().replace(/-/g, '');
        await mkdir(this.opts.exportsDir, { recursive: true });
        await writeFile(join(this.opts.exportsDir, `${jobId}.glb`), bytes);
        return { jobId, url: this.sign(jobId), bytes: bytes.length };
      }),
    );
  }

  private async withRecovery<T>(task: () => Promise<T>): Promise<T> {
    try {
      return await task();
    } catch (err) {
      const lost =
        err instanceof CdpError &&
        (err.method === 'close' || err.method === 'socket' || err.method === 'connect');
      if (!lost || this.noSandbox) throw err;
      this.opts.logger.warn({ event: 'renderer.retry_no_sandbox', err: String(err) });
      this.noSandbox = true;
      await this.close();
      return task();
    }
  }

  async close(): Promise<void> {
    this.cdp?.close();
    await this.chrome?.close();
    this.cdp = undefined;
    this.chrome = undefined;
    this.page = undefined;
  }

  private sign(jobId: string): string {
    const exp = Date.now() + 10 * 60_000;
    const sig = createHmac('sha256', this.opts.token).update(`${jobId}:${exp}`).digest('hex').slice(0, 32);
    return `/exports/${jobId}.glb?exp=${exp}&sig=${sig}`;
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async start(): Promise<Cdp> {
    if (this.cdp && !this.cdp.isClosed) return this.cdp;
    if (this.cdp?.isClosed) await this.close();
    if (!this.executable) {
      throw new AppError('E_RENDER_UNAVAILABLE', '未找到 Chromium / Chrome 可执行文件');
    }
    if (this.booting) return this.booting;

    const boot = async (noSandbox: boolean): Promise<Cdp> => {
      this.chrome = await launchChrome(this.executable as string, { noSandbox });
      const cdp = await Cdp.connect(this.chrome.wsUrl);
      this.noSandbox = noSandbox;
      if (noSandbox) void this.rememberNoSandbox();
      this.cdp = cdp;
      return cdp;
    };

    this.booting = (async () => {
      if (!this.noSandbox && (await this.learnedNoSandbox())) this.noSandbox = true;
      try {
        return await boot(this.noSandbox);
      } catch (err) {
        this.lastErrorAt = Date.now();
        await this.close();
        if (this.noSandbox) {
          throw new AppError('E_RENDER_UNAVAILABLE', `Chromium 启动失败：${String(err)}`);
        }
        this.opts.logger.warn({ event: 'renderer.retry_no_sandbox', err: String(err) });
        try {
          return await boot(true);
        } catch (retryErr) {
          this.lastErrorAt = Date.now();
          await this.close();
          throw new AppError('E_RENDER_UNAVAILABLE', `Chromium 启动失败：${String(retryErr)}`);
        }
      }
    })();
    try {
      return await this.booting;
    } finally {
      this.booting = undefined;
    }
  }

  private async openPage(roomId: string, width: number, height: number): Promise<PageSession> {
    const cdp = await this.start();
    if (!this.page) {
      const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', {
        url: 'about:blank',
      });
      const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', {
        targetId,
        flatten: true,
      });
      await cdp.send('Page.enable', {}, sessionId);
      await cdp.send('Runtime.enable', {}, sessionId);
      await cdp.send('Log.enable', {}, sessionId).catch(() => undefined);
      this.watchPage(cdp, sessionId);
      this.page = { targetId, sessionId };
    }
    const page = this.page;
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 1, mobile: false },
      page.sessionId,
    );
    const url = `${this.opts.baseUrl()}/editor/r/${roomId}?headless=1&t=${encodeURIComponent(this.opts.token)}`;
    await cdp.send('Page.navigate', { url }, page.sessionId, this.opts.navigateTimeoutMs ?? 20_000);
    await this.waitReady(page.sessionId);
    return page;
  }

  private get modeFile(): string {
    return join(dirname(this.opts.exportsDir), 'chrome-mode.json');
  }

  private async learnedNoSandbox(): Promise<boolean> {
    try {
      const raw = JSON.parse(await readFile(this.modeFile, 'utf8')) as { noSandbox?: boolean };
      return raw.noSandbox === true;
    } catch {
      return false;
    }
  }

  private async rememberNoSandbox(): Promise<void> {
    try {
      await writeFile(this.modeFile, JSON.stringify({ noSandbox: true }));
    } catch {
      /* 记住启动模式失败不影响渲染 */
    }
  }

  private watchPage(cdp: Cdp, sessionId: string): void {
    const log = this.opts.logger;
    cdp.on('Runtime.exceptionThrown', (p, sid) => {
      if (sid !== sessionId) return;
      const details = p.exceptionDetails as
        | { text?: string; exception?: { description?: string } }
        | undefined;
      log.warn({ event: 'page.exception', detail: details?.exception?.description ?? details?.text ?? '' });
    });
    cdp.on('Runtime.consoleAPICalled', (p, sid) => {
      if (sid !== sessionId || (p.type !== 'error' && p.type !== 'warning')) return;
      const args = (p.args as { value?: unknown; description?: string }[] | undefined) ?? [];
      log.warn({
        event: 'page.console',
        level: p.type,
        detail: args
          .map((a) => String(a.value ?? a.description ?? ''))
          .join(' ')
          .slice(0, 600),
      });
    });
    cdp.on('Log.entryAdded', (p, sid) => {
      if (sid !== sessionId) return;
      const entry = p.entry as { level?: string; text?: string; url?: string } | undefined;
      if (entry?.level !== 'error' && entry?.level !== 'warning') return;
      log.warn({
        event: 'page.log',
        level: entry?.level,
        detail: `${entry?.text ?? ''} ${entry?.url ?? ''}`.slice(0, 600),
      });
    });
  }

  private async diagnose(sessionId: string): Promise<string> {
    try {
      const res = await this.cdp?.send<{ result: { value?: unknown } }>(
        'Runtime.evaluate',
        {
          expression: `({href: location.href, state: document.readyState, canvases: document.querySelectorAll('canvas').length, text: (document.body?.innerText ?? '').slice(0, 200)})`,
          returnByValue: true,
        },
        sessionId,
      );
      return JSON.stringify(res?.result?.value ?? {});
    } catch (err) {
      return String(err);
    }
  }

  private async waitReady(sessionId: string): Promise<void> {
    const deadline = Date.now() + (this.opts.navigateTimeoutMs ?? 20_000);
    let last = '';
    while (Date.now() < deadline) {
      const res = await this.cdp?.send<{ result: { value?: { ready: boolean; error?: string } } }>(
        'Runtime.evaluate',
        {
          expression: `({ready: Boolean(window.__vibe3dReady), error: document.querySelector('[data-vibe3d-error]')?.getAttribute('data-vibe3d-error') ?? ''})`,
          returnByValue: true,
        },
        sessionId,
      );
      const value = res?.result?.value;
      if (value?.error) throw new AppError('E_RENDER_UNAVAILABLE', `headless 页面报错：${value.error}`);
      if (value?.ready) return;
      last = JSON.stringify(value ?? {});
      await sleep(60);
    }
    this.opts.logger.warn({
      event: 'renderer.ready_timeout',
      state: last,
      diag: await this.diagnose(sessionId),
    });
    throw new AppError('E_RENDER_UNAVAILABLE', 'headless 页面在 20s 内未就绪');
  }
}
