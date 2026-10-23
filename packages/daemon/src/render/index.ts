import type { Config } from '../config';
import type { Renderer } from '../context';
import type { Logger } from '../logger';
import type { WsHub } from '../ws/hub';
import { ChromiumRenderer } from './chromium';
import { EditorRenderer } from './editor';

class AutoRenderer implements Renderer {
  readonly name = 'auto';

  constructor(
    private readonly editor: EditorRenderer,
    private readonly chromium: ChromiumRenderer,
    private readonly hub: WsHub,
    private readonly logger: Logger,
  ) {}

  get ready(): boolean {
    return this.chromium.ready;
  }

  async snapshot(input: Parameters<Renderer['snapshot']>[0], opts: Parameters<Renderer['snapshot']>[1]) {
    if (this.hub.count(input.roomId) > 0) {
      try {
        return await this.editor.snapshot(input, opts);
      } catch (err) {
        this.logger.warn({ event: 'renderer.editor_fallback', err: String(err) });
      }
    }
    return this.chromium.snapshot(input, opts);
  }

  exportGlb(input: Parameters<Renderer['exportGlb']>[0], nodeIds?: string[]) {
    return this.chromium.exportGlb(input, nodeIds);
  }

  close(): Promise<void> {
    return this.chromium.close?.() ?? Promise.resolve();
  }
}

export interface RendererDeps {
  config: Config;
  hub: WsHub;
  logger: Logger;
  baseUrl: () => string;
  exportsDir: string;
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
  });
  if (config.renderer === 'chromium') return chromium;

  const editor = new EditorRenderer(hub);
  if (config.renderer === 'editor') return editor;
  return new AutoRenderer(editor, chromium, hub, logger);
}
