import { AppError } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import type { Logger } from '../src/logger';
import { AutoRenderer } from '../src/render/index';
import type { WsHub } from '../src/ws/hub';

function recorder(): { logger: Logger; warns: Array<Record<string, unknown>> } {
  const warns: Array<Record<string, unknown>> = [];
  const noop = (): void => undefined;
  const logger: Logger = {
    debug: noop,
    info: noop,
    warn: (obj) => warns.push(obj as Record<string, unknown>),
    error: noop,
    child: () => logger,
  };
  return { logger, warns };
}

function buildError(editorError: unknown, chromiumReady = true) {
  const { logger, warns } = recorder();
  const hub = { count: () => 1, total: () => 1 } as unknown as WsHub;
  const editor = {
    snapshot: async () => {
      throw editorError;
    },
  } as never;
  const chromium = {
    ready: chromiumReady,
    snapshot: async () => ({ mime: 'image/png', base64: 'AA==', width: 1, height: 1 }),
  } as never;
  const renderer = new AutoRenderer(editor, chromium, hub, logger);
  return { renderer, warns };
}

describe('auto renderer fallback logging', () => {
  it('records a stable code and elapsed time', async () => {
    const { renderer, warns } = buildError(new AppError('E_RENDER_UNAVAILABLE', 'editor 快照失败'));
    await renderer.snapshot({ roomId: 'r_aaaaaaaa' } as never, {});
    expect(warns[0]).toMatchObject({
      event: 'renderer.editor_fallback',
      code: 'E_RENDER_UNAVAILABLE',
    });
    expect(typeof warns[0]?.elapsedMs).toBe('number');
  });

  it('classifies snapshot timeouts', async () => {
    const { renderer, warns } = buildError(new Error('editor 快照超时'));
    await renderer.snapshot({ roomId: 'r_aaaaaaaa' } as never, {});
    expect(warns[0]).toMatchObject({ code: 'E_SNAPSHOT_TIMEOUT' });
  });

  it('classifies timeouts wrapped by the editor renderer', async () => {
    const wrapped = new AppError('E_RENDER_UNAVAILABLE', 'editor 快照失败：Error: editor 快照超时');
    const { renderer, warns } = buildError(wrapped);
    await renderer.snapshot({ roomId: 'r_aaaaaaaa' } as never, {});
    expect(warns[0]).toMatchObject({ code: 'E_SNAPSHOT_TIMEOUT' });
  });

  it('does not fall back when the capture exceeds the upload budget', async () => {
    const { renderer, warns } = buildError(new AppError('E_PAYLOAD_TOO_LARGE', 'editor 快照超出上限'));
    await expect(renderer.snapshot({ roomId: 'r_aaaaaaaa' } as never, {})).rejects.toMatchObject({
      code: 'E_PAYLOAD_TOO_LARGE',
    });
    expect(warns[0]).toMatchObject({ event: 'renderer.editor_fallback', code: 'E_PAYLOAD_TOO_LARGE' });
  });
});
