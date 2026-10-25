import { DAEMON_VERSION, PROTOCOL_VERSION } from '@vibebyte/vibe3d-protocol';
import { MAX_SNAPSHOT_PIXELS, MAX_SNAPSHOT_TIMEOUT_MS } from '../render/editor';
import { DEFAULT_WS_MAX_PAYLOAD_BYTES } from '../ws/attach';
import type { HandlersFor } from './types';

type Keys = 'system.status';

export const systemHandlers: HandlersFor<Keys> = {
  'system.status': async (_p, ctx) => {
    const renderer = ctx.renderer;
    const ready = Boolean(renderer?.ready);
    const idPass = Boolean(renderer?.idPass);
    const notes: string[] = [];
    if (!ready) {
      notes.push(
        '没有可用的离屏渲染器：渲染类工具会报 E_RENDER_UNAVAILABLE。先用 vibe3d_open_editor 打开房间让页面接管渲染，或在已打开的窗口上用 vibe3d_render_snapshot。',
      );
    } else if (!idPass) {
      notes.push(
        '当前渲染器不支持 id-pass：改用 vibe3d_render_snapshot 出图对照，或 vibe3d_render_pick 逐点取色。',
      );
    }
    return {
      daemonVersion: DAEMON_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      renderer: { name: renderer?.name ?? 'none', ready, idPass },
      limits: {
        snapshotMaxPixels: MAX_SNAPSHOT_PIXELS,
        snapshotTimeoutMs: MAX_SNAPSHOT_TIMEOUT_MS,
        wsPayloadBytes: DEFAULT_WS_MAX_PAYLOAD_BYTES,
      },
      notes,
    };
  },
};
