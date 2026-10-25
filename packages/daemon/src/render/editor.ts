import { AppError } from '@vibebyte/vibe3d-protocol';
import type { RenderInput, Renderer, Snapshot, SnapshotOptions } from '../context';
import type { WsHub } from '../ws/hub';

export const DEFAULT_SNAPSHOT_TIMEOUT_MS = 5_000;

const MEGAPIXEL = 1_000_000;
const PER_MEGAPIXEL_MS = 2_000;
export const MAX_SNAPSHOT_TIMEOUT_MS = 30_000;
export const MAX_SNAPSHOT_PIXELS = 4_000_000;

export function snapshotAreaPixels(width = 1280, height = 720, pixelRatio = 1): number {
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  return Math.min(MAX_SNAPSHOT_PIXELS, Math.round(width * height * ratio * ratio));
}

export function snapshotTimeoutMs(
  areaPixels: number,
  opts: { baseMs?: number; perMegapixelMs?: number; capMs?: number } = {},
): number {
  const base = opts.baseMs ?? DEFAULT_SNAPSHOT_TIMEOUT_MS;
  const per = opts.perMegapixelMs ?? PER_MEGAPIXEL_MS;
  const cap = opts.capMs ?? MAX_SNAPSHOT_TIMEOUT_MS;
  const area = Number.isFinite(areaPixels) && areaPixels > 0 ? areaPixels : 0;
  return Math.min(cap, Math.round(base + (area / MEGAPIXEL) * per));
}

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

  available(roomId: string): boolean {
    return this.hub.count(roomId) > 0;
  }

  async snapshot(input: RenderInput, opts: SnapshotOptions = {}): Promise<Snapshot> {
    const settleMs = opts.settleMs ?? 0;
    if (settleMs > 0) await new Promise((resolve) => setTimeout(resolve, settleMs));
    const format = opts.format ?? 'png';
    const area = snapshotAreaPixels(opts.width, opts.height, opts.quality?.pixelRatio);
    const budgetMs = Math.max(this.timeoutMs, snapshotTimeoutMs(area));
    let shot: {
      base64: string;
      mime?: string;
      width?: number;
      height?: number;
      meta?: Snapshot['meta'];
    };
    try {
      shot = await this.hub.requestSnapshot(
        input.roomId,
        {
          width: opts.width,
          height: opts.height,
          format,
          at: opts.at,
          transparent: opts.transparent,
          camera: opts.camera,
          shading: opts.shading,
          overlay: opts.overlay,
          highlight: opts.highlight,
          isolate: opts.isolate,
          fog: opts.fog,
        },
        budgetMs + settleMs,
      );
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('E_RENDER_UNAVAILABLE', `editor 快照失败：${String(err)}`);
    }
    const size =
      shot.width && shot.height
        ? { width: shot.width, height: shot.height }
        : (pngSize(shot.base64) ?? { width: opts.width ?? 1280, height: opts.height ?? 720 });
    return {
      mime: shot.mime ?? `image/${format}`,
      base64: shot.base64,
      ...size,
      ...(shot.meta ? { meta: shot.meta } : {}),
    };
  }

  async exportGlb(): Promise<{ jobId: string; url: string; bytes: number }> {
    throw new AppError('E_RENDER_UNAVAILABLE', 'editor 渲染器不支持导出 GLB，请启用 chromium');
  }
}
