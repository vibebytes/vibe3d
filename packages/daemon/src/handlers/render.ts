import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { AppError, type CameraState, type SceneDoc } from '@vibebyte/vibe3d-protocol';
import {
  type QualityPreset,
  type ViewName,
  buildIdLegend,
  decodeIdMask,
  fitsIdPass,
  frameCamera,
  frameTarget,
  resolveQuality,
  shotWarning,
} from '@vibebyte/vibe3d-scene';
import type {
  DispatchContext,
  OverlayKind,
  Renderer,
  ShadingMode,
  Snapshot,
  SnapshotOptions,
} from '../context';
import { signExportUrl } from '../http/export-url';
import { type JobError, toView } from '../jobs/store';
import { clampRect, cropImage, decodeShot, hexOf, pixelAt, regionStats } from '../render/pick';
import { encodePng } from '../render/png';
import { editorUrl } from './editor-url';
import type { HandlersFor } from './types';

const VIEW_LABELS: Record<ViewName, string> = {
  three_quarter: '三分之四视角',
  front: '正视',
  back: '后视',
  left: '左视',
  right: '右视',
  top: '俯视',
};
const DEFAULT_VIEWS: ViewName[] = ['three_quarter', 'front', 'top'];
const DEFAULT_NODE_PADDING = 1.2;

interface CameraOverrideInput {
  position?: [number, number, number];
  p?: [number, number, number];
  target?: [number, number, number];
  fov?: number;
}

interface RoiInput {
  x: number;
  y: number;
  w: number;
  h: number;
}

function cameraOverride(camera: CameraOverrideInput | undefined, doc: SceneDoc): CameraState | undefined {
  if (!camera) return undefined;
  const base = doc.camera;
  return {
    mode: base.mode,
    p: camera.position ?? camera.p ?? base.p,
    target: camera.target ?? base.target,
    fov: camera.fov ?? base.fov,
    zoom: base.zoom,
  };
}

function baseShot(shot: Snapshot) {
  return { mime: shot.mime, base64: shot.base64, width: shot.width, height: shot.height };
}

function roiFields(shot: Snapshot, roi?: RoiInput) {
  if (!roi) return {};
  if (shot.mime !== 'image/png') {
    throw new AppError('E_INVALID_PARAMS', 'roi 裁剪需要 PNG 截图：省略 format 或显式 format=png');
  }
  const img = decodeShot(shot.base64);
  const box = clampRect(img, roi);
  const crop = encodePng(cropImage(img, box));
  return {
    mime: 'image/png' as const,
    base64: crop.toString('base64'),
    width: box.w,
    height: box.h,
    frame: { width: img.width, height: img.height },
    roi: box,
  };
}

type Keys =
  | 'render.snapshot'
  | 'render.views'
  | 'render.node'
  | 'render.pick'
  | 'render.id-pass'
  | 'render.sequence'
  | 'export.glb'
  | 'job.get'
  | 'job.list'
  | 'job.cancel'
  | 'editor.open';

function requireRenderer(ctx: DispatchContext, roomId?: string): Renderer {
  if (!ctx.renderer?.ready) {
    throw new AppError('E_RENDER_UNAVAILABLE', '渲染器不可用：本进程未启用离屏渲染', {
      renderer: null,
      hint: '用 vibe3d_open_editor 打开编辑器窗口，让页面接管渲染；无窗口时改用 vibe3d_render_snapshot',
      next: { tool: 'vibe3d_open_editor', params: roomId ? { roomId } : {} },
    });
  }
  if (roomId && ctx.renderer.available && !ctx.renderer.available(roomId)) {
    throw new AppError('E_RENDER_UNAVAILABLE', `房间 ${roomId} 没有在线的 editor / headless 页面`, {
      renderer: ctx.renderer.name,
      hint: `先用 vibe3d_open_editor 打开房间 ${roomId}，页面就绪后重试`,
      next: { tool: 'vibe3d_open_editor', params: { roomId } },
    });
  }
  return ctx.renderer;
}

function requireJobs(ctx: DispatchContext): NonNullable<DispatchContext['jobs']> {
  if (!ctx.jobs) throw new AppError('E_INTERNAL', '任务队列未初始化');
  return ctx.jobs;
}

interface ImageParams {
  width?: number;
  height?: number;
  format?: 'png' | 'jpeg';
  settleMs?: number;
  at?: number;
  transparent?: boolean;
  shading?: ShadingMode;
  overlay?: OverlayKind[];
  highlight?: string[];
  isolate?: string[];
  quality?: string;
  fog?: 'doc' | 'off' | 'auto';
  camera?: CameraOverrideInput;
  framing?: 'camera' | 'scene';
  roi?: RoiInput;
}

function hasDocAnimation(doc: SceneDoc): boolean {
  for (const id of Object.keys(doc.nodes)) {
    if (doc.nodes[id]?.clip) return true;
  }
  return false;
}

function resolveFraming(p: ImageParams, doc: SceneDoc): CameraOverrideInput | undefined {
  if (p.camera) return p.camera;
  if (p.framing === 'scene') {
    const cam = frameCamera(doc, 'fit');
    return { position: cam.p, target: cam.target, fov: cam.fov };
  }
  return undefined;
}

function imageOptions(p: ImageParams, doc?: SceneDoc, quality?: QualityPreset): SnapshotOptions {
  const at = p.at ?? (doc && hasDocAnimation(doc) ? 0 : undefined);
  const camera = doc ? cameraOverride(resolveFraming(p, doc), doc) : undefined;
  return {
    width: p.width,
    height: p.height,
    format: p.format,
    settleMs: p.settleMs,
    at,
    transparent: p.transparent,
    shading: p.shading,
    overlay: p.overlay?.length ? [...new Set(p.overlay)] : undefined,
    highlight: p.highlight?.length ? [...new Set(p.highlight)] : undefined,
    isolate: p.isolate?.length ? [...new Set(p.isolate)] : undefined,
    quality: quality ?? resolveQuality(p.quality),
    fog: p.fog ?? 'doc',
    ...(camera ? { camera } : {}),
  };
}

function presentShot(shot: Snapshot, quality?: QualityPreset) {
  const meta = shot.meta ?? null;
  const notes = [shotWarning(meta)];
  if (quality?.level === 'draft') {
    notes.push('draft 档：低采样、无抗锯齿，仅供构图与取景确认，请勿据此判断材质与最终画质');
  }
  return {
    fog: meta?.fog ?? null,
    distanceToTarget: meta?.distanceToTarget ?? null,
    camera: meta?.camera ?? null,
    warning: notes.filter(Boolean).join('；') || null,
  };
}

function framingEchoOf(p: ImageParams, doc: SceneDoc): { source: 'camera' | 'scene'; center?: [number, number, number]; fov?: number } {
  if (p.camera || p.framing !== 'scene') return { source: 'camera' };
  const cam = frameCamera(doc, 'fit');
  return { source: 'scene', center: cam.target, fov: cam.fov };
}

export const renderHandlers: HandlersFor<Keys> = {
  'render.snapshot': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const renderer = requireRenderer(ctx, room.id);
    const quality = resolveQuality(p.quality);
    const shot = await renderer.snapshot(
      { roomId: room.id, doc: room.doc },
      imageOptions(p, room.doc, quality),
    );
    return {
      revision: room.revision,
      mime: shot.mime,
      base64: shot.base64,
      width: shot.width,
      height: shot.height,
      quality,
      framing: framingEchoOf(p, room.doc),
      ...presentShot(shot, quality),
      ...roiFields(shot, p.roi),
    };
  },

  'render.views': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const renderer = requireRenderer(ctx, room.id);
    const quality = resolveQuality(p.quality);
    const ids = p.nodeIds && p.nodeIds.length > 0 ? p.nodeIds : undefined;
    const missing = (ids ?? []).filter((id) => !room.doc.nodes[id]);
    if (missing.length > 0) {
      throw new AppError('E_INVALID_PARAMS', `nodeIds 含未知节点：${missing.join(', ')}`);
    }
    const views: ViewName[] = p.views && p.views.length > 0 ? p.views : DEFAULT_VIEWS;
    const target = frameTarget(room.doc, { ids });
    if (!target) {
      throw new AppError('E_INVALID_PARAMS', '场景里没有可见几何，无法取景');
    }
    const shots = [];
    const failures: { view: ViewName; code: string; message: string }[] = [];
    let firstError: unknown;
    const results = await Promise.all(
      views.map(async (view) => {
        try {
          const framed = frameTarget(room.doc, { ids, view }) ?? target;
          const shot = await renderer.snapshot(
            { roomId: room.id, doc: room.doc },
            {
              ...imageOptions(p, room.doc, quality),
              camera: framed.camera,
            },
          );
          return {
            ok: true as const,
            view,
            framed,
            shot,
          };
        } catch (err) {
          return { ok: false as const, view, err };
        }
      }),
    );
    for (const result of results) {
      if (result.ok) {
        const { view, framed, shot } = result;
        shots.push({
          view,
          label: VIEW_LABELS[view],
          ...baseShot(shot),
          ...roiFields(shot, p.roi),
          ...presentShot(shot, quality),
          camera: framed.camera,
        });
        continue;
      }
      const err = result.err;
      firstError ??= err;
      failures.push({
        view: result.view,
        code: err instanceof AppError ? err.code : 'E_INTERNAL',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    if (shots.length === 0 && firstError) throw firstError;
    return {
      revision: room.revision,
      target: target.bounds,
      views: shots,
      partial: failures.length > 0,
      failedView: failures[0]?.view ?? null,
      failures,
      quality,
    };
  },

  'render.node': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const renderer = requireRenderer(ctx, room.id);
    if (!room.doc.nodes[p.nodeId]) {
      throw new AppError('E_INVALID_PARAMS', `未知节点：${p.nodeId}`);
    }
    const quality = resolveQuality(p.quality);
    const view = p.view ?? 'three_quarter';
    const framed = frameTarget(room.doc, {
      ids: [p.nodeId],
      view,
      padding: p.padding ?? DEFAULT_NODE_PADDING,
    });
    if (!framed) {
      throw new AppError('E_INVALID_PARAMS', `节点没有可见几何，无法取景：${p.nodeId}`);
    }
    const shot = await renderer.snapshot(
      { roomId: room.id, doc: room.doc },
      {
        ...imageOptions(p, room.doc, quality),
        camera: framed.camera,
      },
    );
    return {
      revision: room.revision,
      nodeId: p.nodeId,
      target: framed.bounds,
      ...baseShot(shot),
      ...roiFields(shot, p.roi),
      quality,
      ...presentShot(shot, quality),
      camera: framed.camera,
    };
  },

  'render.pick': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const renderer = requireRenderer(ctx, room.id);
    if (!p.points?.length && !p.rect) {
      throw new AppError('E_INVALID_PARAMS', 'render.pick 至少需要 points 或 rect 之一');
    }
    const shot = await renderer.snapshot(
      { roomId: room.id, doc: room.doc },
      {
        ...imageOptions(p, room.doc),
      },
    );
    const img = decodeShot(shot.base64);
    const samples = (p.points ?? []).map((pt) => {
      const { rgb, alpha } = pixelAt(img, pt.x, pt.y);
      return { x: pt.x, y: pt.y, rgb, hex: hexOf(rgb), alpha };
    });
    const region = p.rect ? regionStats(img, p.rect, p.topColors ?? 5) : undefined;
    const cropBox = p.roi ? clampRect(img, p.roi) : null;
    const crop = cropBox ? encodePng(cropImage(img, cropBox)) : null;
    return {
      revision: room.revision,
      width: cropBox ? cropBox.w : img.width,
      height: cropBox ? cropBox.h : img.height,
      ...(crop ? { mime: 'image/png' as const, base64: crop.toString('base64') } : {}),
      ...(cropBox
        ? { frame: { width: img.width, height: img.height }, roi: cropBox }
        : {}),
      samples,
      ...(region ? { region } : {}),
    };
  },

  'render.id-pass': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const renderer = requireRenderer(ctx, room.id);
    const width = p.width ?? 640;
    const height = p.height ?? 480;
    if (!fitsIdPass(width, height)) {
      throw new AppError('E_INVALID_PARAMS', `id-pass 分辨率 ${width}x${height} 超过上限`, {
        width,
        height,
        maxPixels: 1_000_000,
      });
    }
    if (!renderer.idPass) {
      throw new AppError('E_RENDER_UNAVAILABLE', `当前渲染器 ${renderer.name} 不支持 id-pass`, {
        renderer: renderer.name,
        hint: 'id-pass 需要已连接的编辑器页面：先用 vibe3d_open_editor 打开房间再重试；只要像素色值用 vibe3d_render_pick，常规截图用 vibe3d_render_snapshot',
        next: { tool: 'vibe3d_render_snapshot', params: { roomId: room.id, width, height } },
      });
    }
    const palette = buildIdLegend(room.doc);
    const shot = await renderer.idPass(
      { roomId: room.id, doc: room.doc },
      {
        width,
        height,
        camera: cameraOverride(resolveFraming(p, room.doc), room.doc),
        settleMs: p.settleMs,
        at: p.at,
        legend: palette.legend,
      },
    );
    const decoded = decodeIdMask(shot.rgba, palette);
    const total = shot.width * shot.height;
    return {
      revision: room.revision,
      width: shot.width,
      height: shot.height,
      legend: palette.legend,
      coverage: decoded.coverage.map((c) => ({
        ...c,
        share: Math.round((c.pixels / total) * 10_000) / 10_000,
      })),
      unknown: decoded.unknown,
      ...(p.includeMask
        ? {
            mask: {
              encoding: 'deflate-index8' as const,
              base64: deflateRawSync(Buffer.from(decoded.index)).toString('base64'),
            },
          }
        : {}),
    };
  },

  'render.sequence': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    if (p.to < p.from) {
      throw new AppError('E_INVALID_PARAMS', `to(${p.to}) 不能小于 from(${p.from})`);
    }
    const count = Math.floor((p.to - p.from) * p.fps + 1e-6) + 1;
    if (count > 600) {
      throw new AppError('E_INVALID_PARAMS', `帧数 ${count} 超过上限 600，请缩小 from/to 区间或降低 fps`);
    }
    const renderer = requireRenderer(ctx, room.id);
    const jobs = requireJobs(ctx);
    const dir = ctx.exportsDir;
    if (!dir) throw new AppError('E_INTERNAL', '导出目录未配置');
    const snapshot = structuredClone(room.doc);
    const revision = room.revision;
    const job = jobs.store.create('render.sequence', room.id);
    const options = imageOptions({ ...p, format: 'png' }, snapshot);
    try {
      jobs.queue.enqueue(job, async (record, report) => {
        report(0.02, 'prepare');
        await mkdir(dir, { recursive: true });
        const frames: { index: number; at: number; file: string; bytes: number }[] = [];
        const file = `${record.id}.json`;
        const writeManifest = async (status: 'done' | 'cancelled' | 'failed', error?: JobError) => {
          const manifest = {
            jobId: record.id,
            roomId: room.id,
            revision,
            status,
            fps: p.fps,
            from: p.from,
            to: p.to,
            expectedFrames: count,
            width: options.width,
            height: options.height,
            frames,
            ...(error ? { error } : {}),
          };
          const body = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
          await writeFile(join(dir, file), body);
          return body;
        };
        try {
          const frameAt = (i: number): number => Math.min(p.from + i / p.fps, p.to);
          const persist = async (i: number, at: number, shot: { base64: string }) => {
            const frameFile = `${record.id}-${String(i).padStart(4, '0')}.png`;
            const bytes = Buffer.from(shot.base64, 'base64');
            await writeFile(join(dir, frameFile), bytes);
            frames.push({ index: i, at, file: frameFile, bytes: bytes.length });
          };
          for (let i = 0; i < count; i += 1) {
            if (record.cancelRequested) break;
            const at = frameAt(i);
            const shot = await renderer.snapshot({ roomId: room.id, doc: snapshot }, { ...options, at });
            await persist(i, at, shot);
            report(0.05 + (0.85 * (i + 1)) / count, `frame ${i + 1}/${count}`);
          }
          const body = await writeManifest(record.cancelRequested ? 'cancelled' : 'done');
          report(0.98, 'manifest');
          return {
            url: ctx.signExport?.(file) ?? signExportUrl(ctx.token ?? '', file),
            bytes: body.length + frames.reduce((sum, f) => sum + f.bytes, 0),
            revision,
            frames: frames.length,
          };
        } catch (err) {
          await writeManifest('failed', {
            code: err instanceof AppError ? err.code : 'E_INTERNAL',
            message: err instanceof Error ? err.message : String(err),
          }).catch(() => undefined);
          throw err;
        }
      });
    } catch (err) {
      jobs.store.cancel(job.id);
      throw err;
    }
    return { jobId: job.id, state: job.state };
  },

  'export.glb': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const renderer = requireRenderer(ctx, room.id);
    const jobs = requireJobs(ctx);
    const snapshot = structuredClone(room.doc);
    const revision = room.revision;
    const job = jobs.store.create('export.glb', room.id);
    try {
      jobs.queue.enqueue(job, async (_job, report) => {
        report(0.05, 'queue');
        const out = await renderer.exportGlb({ roomId: room.id, doc: snapshot }, p.nodeIds, p.include);
        report(0.9, 'pack');
        return { url: out.url, bytes: out.bytes, revision };
      });
    } catch (err) {
      jobs.store.cancel(job.id);
      throw err;
    }
    return { jobId: job.id, state: job.state };
  },

  'job.get': async (p, ctx) => {
    const jobs = requireJobs(ctx);
    const job = jobs.store.get(p.jobId);
    if (!job) throw new AppError('E_JOB_NOT_FOUND', `任务不存在或已过期：${p.jobId}`);
    return toView(job);
  },

  'job.list': async (p, ctx) => {
    const jobs = requireJobs(ctx);
    return { items: jobs.store.list(p.roomId).slice(0, 50).map(toView) };
  },

  'job.cancel': async (p, ctx) => {
    const jobs = requireJobs(ctx);
    const job = jobs.queue.cancel(p.jobId);
    if (!job) throw new AppError('E_JOB_NOT_FOUND', `任务不存在或已过期：${p.jobId}`);
    return toView(job);
  },

  'editor.open': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const url = editorUrl(ctx, room.id, p.focus);
    const editors = ctx.surfaces?.(room.id) ?? 0;
    const reused = p.reuse !== false && editors > 0;
    const shouldOpen = p.open ?? true;
    let opened = false;
    let hint: string | undefined;
    if (!shouldOpen) {
      hint = `open:false，只返回链接没有开窗：${url}`;
    } else if (!ctx.openExternal) {
      hint = `只返回了链接，没有打开浏览器：当前 daemon 未启用自动开窗（--no-open-editor）；手动打开 ${url} 即可，或继续用 open:false 只取链接。`;
    } else {
      opened = (await ctx.openExternal({ url, roomId: room.id })) !== false;
      ctx.autoOpen?.set(room.id, opened ? 'opened' : 'failed');
      if (!opened) hint = `自动打开浏览器失败（系统 opener 不可用），改动仍会实时推送：手动打开 ${url}。`;
    }
    ctx.logger?.info({
      event: 'surface.open',
      via: 'editor.open',
      roomId: room.id,
      reused,
      opened,
      editors,
      focus: p.focus,
    });
    return { url, reused, opened, editors, ...(hint ? { hint } : {}) };
  },
};
