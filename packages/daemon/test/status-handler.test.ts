import { describe, expect, it } from 'vitest';
import type { DispatchContext } from '../src/context';
import { dispatch } from '../src/dispatch';
import { makeHarness } from './helpers/harness';
import { conventionMap } from '@vibebyte/vibe3d-capabilities';

type Renderer = NonNullable<DispatchContext['renderer']>;

function renderer(overrides: Partial<Renderer> = {}): Renderer {
  return {
    name: 'chromium',
    ready: true,
    available: () => true,
    snapshot: async () => ({ mime: 'image/png', base64: '', width: 1, height: 1 }),
    exportGlb: async () => ({ jobId: 'j', url: '/exports/j.glb', bytes: 1 }),
    ...overrides,
  } as Renderer;
}

interface Status {
  renderer: { name: string; ready: boolean; idPass: boolean };
  limits: { snapshotMaxPixels: number; snapshotTimeoutMs: number; wsPayloadBytes: number };
  conventions: Record<string, string>;
  notes: string[];
}

const status = async (ctx: DispatchContext): Promise<Status> =>
  (await dispatch('system.status', {}, ctx)) as Status;

describe('system.status：调用前就能查到的能力与前提', () => {
  it('says there is no renderer and points at the editor', async () => {
    const ctx = makeHarness().ctx;
    const body = await status(ctx);
    expect(body.renderer).toEqual({ name: 'none', ready: false, idPass: false });
    expect(body.notes.join('\n')).toContain('vibe3d_open_editor');
  });

  it('flags a renderer without id-pass and names the fallback tool', async () => {
    const ctx = makeHarness().ctx;
    ctx.renderer = renderer();
    const body = await status(ctx);
    expect(body.renderer).toEqual({ name: 'chromium', ready: true, idPass: false });
    expect(body.notes.join('\n')).toContain('vibe3d_render_snapshot');
  });

  it('stays quiet once the renderer can do id-pass', async () => {
    const ctx = makeHarness().ctx;
    ctx.renderer = renderer({
      idPass: async () => ({ width: 1, height: 1, rgba: new Uint8Array(4) }),
    });
    const body = await status(ctx);
    expect(body.renderer.idPass).toBe(true);
    expect(body.notes).toEqual([]);
  });

  it('reports the real snapshot and payload limits', async () => {
    const ctx = makeHarness().ctx;
    ctx.renderer = renderer();
    const body = await status(ctx);
    expect(body.limits).toEqual({
      snapshotMaxPixels: 4_000_000,
      snapshotTimeoutMs: 30_000,
      wsPayloadBytes: 16 * 1024 * 1024,
    });
  });

  it('exposes the global conventions block', async () => {
    const body = await status(makeHarness().ctx);
    expect(body.conventions).toEqual(conventionMap());
  });
});
