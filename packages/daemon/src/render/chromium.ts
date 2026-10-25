import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AppError } from '@vibebyte/vibe3d-protocol';
import type { IdPassOptions, IdPassShot, RenderInput, Renderer, Snapshot, SnapshotOptions } from '../context';
import { signExportUrl } from '../http/export-url';
import type { Logger } from '../logger';
import { Cdp, CdpError } from './cdp';
import { type ChromeHandle, findChrome, launchChrome } from './chrome';
import { verifyGlbExport } from './verify-glb';

interface PageSession {
  sessionId: string;
  targetId: string;
  roomId: string;
}

export interface ChromiumOptions {
  token: string;
  baseUrl: () => string;
  exportsDir: string;
  chromePath?: string;
  logger: Logger;
  navigateTimeoutMs?: number;
  readyTimeoutMs?: number;
  revisionGraceMs?: number;
  maxPages?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class ChromiumRenderer implements Renderer {
  readonly name = 'chromium';
  readonly executable: string | null;
  private chrome?: ChromeHandle;
  private cdp?: Cdp;
  private booting?: Promise<Cdp>;
  private pages: PageSession[] = [];
  private queues = new Map<string, Promise<unknown>>();
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
    return this.serial(
      () =>
        this.withRecovery(async () => {
          const page = await this.openPage(input.roomId, width, height, input.doc?.revision);
          await sleep(opts.settleMs ?? 180);
          const captured = await this.cdp?.send<{
            result: {
              value?:
                | {
                    base64?: string;
                    mime?: string;
                    width?: number;
                    height?: number;
                    meta?: Snapshot['meta'];
                  }
                | string
                | null;
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
                highlight: opts.highlight,
                isolate: opts.isolate,
                fog: opts.fog,
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
              ...(value.meta ? { meta: value.meta } : {}),
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
      input.roomId,
    );
  }

  async idPass(input: RenderInput, opts: IdPassOptions): Promise<IdPassShot> {
    return this.serial(
      () =>
        this.withRecovery(async () => {
          const page = await this.openPage(input.roomId, opts.width, opts.height);
          await sleep(opts.settleMs ?? 120);
          const res = await this.cdp?.send<{
            result: { value?: { width?: number; height?: number; rgba?: string } | null };
          }>(
            'Runtime.evaluate',
            {
              expression: `window.__vibe3dIdPass?.(${JSON.stringify({
                width: opts.width,
                height: opts.height,
                camera: opts.camera,
                at: opts.at,
                legend: opts.legend,
              })}) ?? null`,
              awaitPromise: true,
              returnByValue: true,
            },
            page.sessionId,
            60_000,
          );
          const value = res?.result?.value;
          if (!value?.rgba) {
            throw new AppError('E_RENDER_UNAVAILABLE', '页面未返回 id-pass 像素');
          }
          const width = value.width ?? opts.width;
          const height = value.height ?? opts.height;
          const rgba = new Uint8Array(Buffer.from(value.rgba, 'base64'));
          if (rgba.length !== width * height * 4) {
            throw new AppError('E_RENDER_UNAVAILABLE', 'id-pass 像素长度与尺寸不符', {
              bytes: rgba.length,
              width,
              height,
            });
          }
          return { width, height, rgba };
        }),
      input.roomId,
    );
  }

  async exportGlb(
    input: RenderInput,
    nodeIds?: string[],
    include?: Array<'cameras' | 'lights'>,
  ): Promise<{ jobId: string; url: string; bytes: number }> {
    return this.serial(
      () =>
        this.withRecovery(async () => {
          const page = await this.openPage(input.roomId, 1280, 720);
          const expr = `window.__vibe3dExport?.(${JSON.stringify(nodeIds ?? null)}, ${JSON.stringify(include ?? null)})`;
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
          if (Object.keys(input.doc?.nodes ?? {}).length > 0) {
            verifyGlbExport(input.doc, bytes, { nodeIds });
          }
          const jobId = randomUUID().replace(/-/g, '');
          const file = `${jobId}.glb`;
          await mkdir(this.opts.exportsDir, { recursive: true });
          await writeFile(join(this.opts.exportsDir, file), bytes);
          return { jobId, url: signExportUrl(this.opts.token, file), bytes: bytes.length };
        }),
      input.roomId,
    );
  }

  private async withRecovery<T>(task: () => Promise<T>, attempt = 0): Promise<T> {
    try {
      return await task();
    } catch (err) {
      if (attempt === 0 && err instanceof AppError && err.data?.recycle === true) {
        this.opts.logger.warn({ event: 'renderer.recycle', reason: err.data.stage, err: String(err) });
        await this.close();
        return this.withRecovery(task, attempt + 1);
      }
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
    const pages = this.pages;
    this.pages = [];
    if (this.cdp && !this.cdp.isClosed) {
      for (const page of pages) {
        await this.cdp.send('Target.closeTarget', { targetId: page.targetId }).catch(() => undefined);
      }
    }
    this.cdp?.close();
    await this.chrome?.close();
    this.cdp = undefined;
    this.chrome = undefined;
  }

  private serial<T>(task: () => Promise<T>, key = ''): Promise<T> {
    const prev = this.queues.get(key) ?? Promise.resolve();
    const run = prev.then(task, task);
    const tail = run.catch(() => undefined);
    this.queues.set(key, tail);
    void tail.then(() => {
      if (this.queues.get(key) === tail) this.queues.delete(key);
    });
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

  private async openPage(
    roomId: string,
    width: number,
    height: number,
    expectedRevision?: number,
  ): Promise<PageSession> {
    const cdp = await this.start();
    const page = this.pages.find((p) => p.roomId === roomId) ?? (await this.createPage(cdp, roomId));
    this.pages = [...this.pages.filter((p) => p !== page), page];
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 1, mobile: false },
      page.sessionId,
    );
    await cdp.send('Page.bringToFront', {}, page.sessionId).catch(() => undefined);
    await this.waitReady(page.sessionId, expectedRevision);
    await this.evictPages(cdp);
    return page;
  }

  async warm(roomId: string): Promise<void> {
    if (!this.ready) return;
    await this.serial(
      () =>
        this.withRecovery(async () => {
          const started = Date.now();
          await this.openPage(roomId, 1280, 720);
          this.opts.logger.debug({ event: 'renderer.warm', roomId, elapsedMs: Date.now() - started });
        }),
      roomId,
    ).catch((err) => {
      this.opts.logger.warn({ event: 'renderer.warm_failed', roomId, err: String(err) });
    });
  }

  async drop(roomId: string): Promise<void> {
    const page = this.pages.find((p) => p.roomId === roomId);
    if (!page) return;
    this.pages = this.pages.filter((p) => p !== page);
    if (this.cdp && !this.cdp.isClosed) {
      await this.cdp.send('Target.closeTarget', { targetId: page.targetId }).catch(() => undefined);
    }
  }

  private async createPage(cdp: Cdp, roomId: string): Promise<PageSession> {
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
    const page: PageSession = { targetId, sessionId, roomId };
    const url = `${this.opts.baseUrl()}/editor/r/${roomId}?headless=1&t=${encodeURIComponent(this.opts.token)}`;
    await cdp.send('Page.navigate', { url }, sessionId, this.opts.navigateTimeoutMs ?? 20_000);
    this.pages.push(page);
    return page;
  }

  private async evictPages(cdp: Cdp): Promise<void> {
    const limit = Math.max(1, this.opts.maxPages ?? 6);
    const idle = this.pages.slice(0, Math.max(0, this.pages.length - limit));
    for (const page of idle) {
      this.pages = this.pages.filter((p) => p !== page);
      await cdp.send('Target.closeTarget', { targetId: page.targetId }).catch(() => undefined);
    }
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
    const seen = new Map<string, number>();
    const emit = (event: string, level: string, detail: string): void => {
      const key = `${event}|${detail}`;
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      if (count > 1) return;
      log.warn({ event, level, detail });
    };
    cdp.on('Runtime.exceptionThrown', (p, sid) => {
      if (sid !== sessionId) return;
      const details = p.exceptionDetails as
        | { text?: string; exception?: { description?: string } }
        | undefined;
      emit('page.exception', 'error', details?.exception?.description ?? details?.text ?? '');
    });
    cdp.on('Runtime.consoleAPICalled', (p, sid) => {
      if (sid !== sessionId || (p.type !== 'error' && p.type !== 'warning')) return;
      const args = (p.args as { value?: unknown; description?: string }[] | undefined) ?? [];
      emit(
        'page.console',
        String(p.type),
        args
          .map((a) => String(a.value ?? a.description ?? ''))
          .join(' ')
          .slice(0, 600),
      );
    });
    cdp.on('Log.entryAdded', (p, sid) => {
      if (sid !== sessionId) return;
      const entry = p.entry as { level?: string; text?: string; url?: string } | undefined;
      if (entry?.level !== 'error' && entry?.level !== 'warning') return;
      emit('page.log', String(entry?.level), `${entry?.text ?? ''} ${entry?.url ?? ''}`.slice(0, 600));
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

  private async waitReady(sessionId: string, expectedRevision?: number): Promise<void> {
    const budget = this.opts.readyTimeoutMs ?? 20_000;
    const grace = this.opts.revisionGraceMs ?? (Number(process.env.VIBE3D_REVISION_GRACE_MS) || 1500);
    const deadline = Date.now() + budget;
    let last = '';
    let readyAt = 0;
    while (Date.now() < deadline) {
      const res = await this.cdp?.send<{
        result: { value?: { ready: boolean; revision?: number; error?: string } };
      }>(
        'Runtime.evaluate',
        {
          expression: `({ready: Boolean(window.__vibe3dReady), revision: Number(window.__vibe3dRevision ?? -1), error: document.querySelector('[data-vibe3d-error]')?.getAttribute('data-vibe3d-error') ?? ''})`,
          returnByValue: true,
        },
        sessionId,
      );
      const value = res?.result?.value;
      if (value?.error) throw new AppError('E_RENDER_UNAVAILABLE', `headless 页面报错：${value.error}`);
      last = JSON.stringify(value ?? {});
      if (value?.ready) {
        const caughtUp =
          expectedRevision === undefined ||
          typeof value.revision !== 'number' ||
          value.revision >= expectedRevision;
        if (caughtUp) return;
        readyAt ||= Date.now();
        if (Date.now() - readyAt > grace) return;
      }
      await sleep(60);
    }
    this.opts.logger.warn({
      event: 'renderer.ready_timeout',
      state: last,
      diag: await this.diagnose(sessionId),
    });
    throw new AppError(
      'E_RENDER_UNAVAILABLE',
      `headless 页面在 ${Math.round(budget / 1000) || 1}s 内未就绪`,
      {
        stage: 'ready_timeout',
        recycle: true,
      },
    );
  }
}
