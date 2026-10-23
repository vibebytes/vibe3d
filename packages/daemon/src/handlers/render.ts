import { AppError } from '@vibebyte/vibe3d-protocol';
import type { DispatchContext, Renderer } from '../context';
import type { HandlersFor } from './types';

type Keys = 'render.snapshot' | 'export.glb' | 'editor.open';

function requireRenderer(ctx: DispatchContext): Renderer {
  if (!ctx.renderer?.ready) {
    throw new AppError('E_RENDER_UNAVAILABLE', '渲染器不可用：本进程未启用离屏渲染');
  }
  return ctx.renderer;
}

export const renderHandlers: HandlersFor<Keys> = {
  'render.snapshot': async (p, ctx) => {
    const renderer = requireRenderer(ctx);
    const room = ctx.rooms.get(p.roomId);
    const shot = await renderer.snapshot(
      { roomId: room.id, doc: room.doc },
      {
        width: p.width,
        height: p.height,
        format: p.format,
        settleMs: p.settleMs,
      },
    );
    return {
      revision: room.revision,
      mime: shot.mime,
      base64: shot.base64,
      width: shot.width,
      height: shot.height,
    };
  },

  'export.glb': async (p, ctx) => {
    const renderer = requireRenderer(ctx);
    const room = ctx.rooms.get(p.roomId);
    const { jobId, url, bytes } = await renderer.exportGlb({ roomId: room.id, doc: room.doc }, p.nodeIds);
    return { jobId, url, bytes, revision: room.revision };
  },

  'editor.open': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const query = new URLSearchParams();
    if (p.focus) query.set('focus', p.focus);
    const qs = query.toString();
    return { url: `${ctx.baseUrl}/r/${room.id}${qs ? `?${qs}` : ''}`, reused: p.reuse ?? false };
  },
};
