import { AppError } from '@vibebyte/vibe3d-protocol';
import type { RenderInput, Renderer, Snapshot, SnapshotOptions } from '../context';
import type { WsHub } from '../ws/hub';

function pngSize(base64: string): { width: number; height: number } | null {
  const bytes = Buffer.from(base64.slice(0, 64), 'base64');
  if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export class EditorRenderer implements Renderer {
  readonly name = 'editor';

  constructor(
    private readonly hub: WsHub,
    private readonly timeoutMs = 5_000,
  ) {}

  get ready(): boolean {
    return true;
  }

  async snapshot(input: RenderInput, opts: SnapshotOptions = {}): Promise<Snapshot> {
    let png: string;
    try {
      png = await this.hub.requestSnapshot(input.roomId, this.timeoutMs);
    } catch (err) {
      throw new AppError('E_RENDER_UNAVAILABLE', `editor 快照失败：${String(err)}`);
    }
    const size = pngSize(png) ?? { width: opts.width ?? 1280, height: opts.height ?? 720 };
    return { mime: 'image/png', base64: png, ...size };
  }

  async exportGlb(): Promise<{ jobId: string; url: string; bytes: number }> {
    throw new AppError('E_RENDER_UNAVAILABLE', 'editor 渲染器不支持导出 GLB，请启用 chromium');
  }
}
