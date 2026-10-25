import { AppError } from '@vibebyte/vibe3d-protocol';
import type { Config } from '../config';
import type { Renderer } from '../context';
import type { Logger } from '../logger';
import type { WsHub } from '../ws/hub';
import { ChromiumRenderer } from './chromium';
import { EditorRenderer } from './editor';

function fallbackCode(err: unknown): string {
  if (err instanceof AppError) {
    if (err.code === 'E_PAYLOAD_TOO_LARGE') return err.code;
    return /超时|timeout/i.test(err.message) ? 'E_SNAPSHOT_TIMEOUT' : err.code;
  }
  return /超时|timeout/i.test(String(err)) ? 'E_SNAPSHOT_TIMEOUT' : 'E_RENDER_UNAVAILABLE';
}

export class AutoRenderer implements Renderer {
  readonly name = 'auto';

  constructor(
    private readonly editor: EditorRenderer,
    private readonly chromium: ChromiumRenderer,
    private readonly hub: WsHub,
    private readonly logger: Logger,
  ) {}

  get ready(): boolean {
    return this.chromium.ready || this.hub.total() > 0;
  }

  available(roomId: string): boolean {
    return this.hub.count(roomId) > 0 || this.chromium.ready;
  }

  async snapshot(input: Parameters<Renderer['snapshot']>[0], opts: Parameters<Renderer['snapshot']>[1]) {
    const hasEditor = this.hub.count(input.roomId) > 0;
    if (!hasEditor) return this.chromium.snapshot(input, opts);
    if (!this.chromium.ready) return this.editor.snapshot(input, opts);
    const started = Date.now();
    const editorShot = this.editor.snapshot(input, opts).then(
      (shot) => ({ source: 'editor' as const, ok: true as const, shot }),
      (err: unknown) => ({ source: 'editor' as const, ok: false as const, err }),
    );
    const chromiumShot = this.chromium.snapshot(input, opts).then(
      (shot) => ({ source: 'chromium' as const, ok: true as const, shot }),
      (err: unknown) => ({ source: 'chromium' as const, ok: false as const, err }),
    );
    const first = await Promise.race([editorShot, chromiumShot]);
    if (first.ok) {
      this.logger.debug({
        event: 'renderer.snapshot',
        renderer: first.source,
        bytes: first.shot.base64.length,
        elapsedMs: Date.now() - started,
      });
      return first.shot;
    }
    const code = fallbackCode(first.err);
    if (code === 'E_PAYLOAD_TOO_LARGE') {
      this.logger.warn({
        event: 'renderer.editor_fallback',
        code,
        elapsedMs: Date.now() - started,
        err: String(first.err),
      });
      throw first.err;
    }
    const other = first.source === 'editor' ? chromiumShot : editorShot;
    const second = await other;
    if (second.ok) {
      this.logger.warn({
        event: 'renderer.editor_fallback',
        code,
        elapsedMs: Date.now() - started,
        err: String(first.err),
      });
      return second.shot;
    }
    throw first.err;
  }

  async idPass(
    input: Parameters<NonNullable<Renderer['idPass']>>[0],
    opts: Parameters<NonNullable<Renderer['idPass']>>[1],
  ) {
    if (this.hub.count(input.roomId) > 0) {
      try {
        return await this.editor.idPass(input, opts);
      } catch (err) {
        this.logger.warn({
          event: 'renderer.editor_fallback',
          op: 'id-pass',
          code: fallbackCode(err),
          err: String(err),
        });
        if (!this.chromium.ready) throw err;
      }
    }
    return this.chromium.idPass(input, opts);
  }

  exportGlb(input: Parameters<Renderer['exportGlb']>[0], nodeIds?: string[]) {
    if (!this.chromium.ready) {
      throw new AppError('E_RENDER_UNAVAILABLE', 'GLB 导出需要可用的 chromium 渲染器');
    }
    return this.chromium.exportGlb(input, nodeIds);
  }

  close(): Promise<void> {
    return this.chromium.close?.() ?? Promise.resolve();
  }

  warm(roomId: string): Promise<void> {
    return this.chromium.warm(roomId);
  }

  drop(roomId: string): Promise<void> {
    return this.chromium.drop(roomId);
  }
}

export interface RendererDeps {
  config: Config;
  hub: WsHub;
  logger: Logger;
  baseUrl: () => string;
  exportsDir: string;
  readyTimeoutMs?: number;
  maxPages?: number;
}

export function createRenderer(deps: RendererDeps): Renderer | undefined {
  const { config, hub, logger } = deps;
  if (config.renderer === 'none') return undefined;

  const chromium = new ChromiumRenderer({
    token: config.token,
    baseUrl: deps.baseUrl,
    exportsDir: deps.exportsDir,
    chromePath: config.chromePath,
    logger,
    navigateTimeoutMs: config.renderTimeoutMs,
    readyTimeoutMs: deps.readyTimeoutMs ?? (Number(process.env.VIBE3D_READY_TIMEOUT_MS) || 20_000),
    maxPages: deps.maxPages ?? (Number(process.env.VIBE3D_RENDER_PAGES) || 6),
    revisionGraceMs: Number(process.env.VIBE3D_REVISION_GRACE_MS) || undefined,
  });
  if (config.renderer === 'chromium') return chromium;

  const editor = new EditorRenderer(hub);
  if (config.renderer === 'editor') return editor;
  return new AutoRenderer(editor, chromium, hub, logger);
}
