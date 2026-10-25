import { describe, expect, it } from 'vitest';
import type { DispatchContext } from '../src/context';
import { renderHandlers } from '../src/handlers/render';
import { call, makeHarness } from './helpers/harness';

type Renderer = NonNullable<DispatchContext['renderer']>;

function headless(overrides: Partial<Renderer> = {}): Renderer {
  return {
    name: 'chromium',
    ready: true,
    available: () => true,
    snapshot: async () => ({ mime: 'image/png', base64: '', width: 1, height: 1 }),
    exportGlb: async () => ({ jobId: 'j', url: '/exports/j.glb', bytes: 1 }),
    ...overrides,
  } as Renderer;
}

async function roomId(): Promise<{ ctx: DispatchContext; id: string }> {
  const h = makeHarness();
  const { body } = await call(h, 'room.create', { name: 'errors' });
  return { ctx: h.ctx, id: body.result.roomId as string };
}

const idPass = (ctx: DispatchContext, id: string): Promise<unknown> =>
  renderHandlers['render.id-pass']({ roomId: id, width: 320, height: 240 }, ctx);

describe('能力类错误的出路', () => {
  it('tells the agent how to get id-pass when the renderer cannot do it', async () => {
    const { ctx, id } = await roomId();
    ctx.renderer = headless();
    const err = (await idPass(ctx, id).catch((e) => e)) as {
      code: string;
      message: string;
      data?: Record<string, unknown>;
    };
    expect(err.code).toBe('E_RENDER_UNAVAILABLE');
    expect(err.data?.renderer).toBe('chromium');
    expect(String(err.data?.hint)).toContain('vibe3d_open_editor');
    expect((err.data?.next as { tool?: string }).tool).toBe('vibe3d_render_snapshot');
    expect(err.message).toContain('id-pass');
  });

  it('points at the editor when no renderer is wired at all', async () => {
    const { ctx, id } = await roomId();
    ctx.renderer = undefined;
    const err = (await idPass(ctx, id).catch((e) => e)) as { data?: Record<string, unknown> };
    expect((err.data?.next as { tool?: string }).tool).toBe('vibe3d_open_editor');
  });

  it('names the fallback tool when the room has no live page', async () => {
    const { ctx, id } = await roomId();
    ctx.renderer = headless({ available: () => false });
    const err = (await idPass(ctx, id).catch((e) => e)) as {
      data?: Record<string, unknown>;
    };
    expect(String(err.data?.hint)).toContain('vibe3d_open_editor');
    expect((err.data?.next as { params?: Record<string, unknown> }).params?.roomId).toBe(id);
  });
});
