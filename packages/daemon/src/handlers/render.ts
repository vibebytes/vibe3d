import { AppError } from '@vibebyte/vibe3d-protocol';
import { type ViewName, frameTarget } from '@vibebyte/vibe3d-scene';
import type { DispatchContext, OverlayKind, Renderer, ShadingMode, SnapshotOptions } from '../context';
import { toView } from '../jobs/store';
import { decodeShot, hexOf, pixelAt, regionStats } from '../render/pick';
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

type Keys =
  | 'render.snapshot'
  | 'render.views'
  | 'render.node'
  | 'render.pick'
  | 'export.glb'
  | 'job.get'
  | 'job.list'
  | 'job.cancel'
  | 'editor.open';

function requireRenderer(ctx: DispatchContext, roomId?: string): Renderer {
  if (!ctx.renderer?.ready) {
    throw new AppError('E_RENDER_UNAVAILABLE', '渲染器不可用：本进程未启用离屏渲染');
  }
  if (roomId && ctx.renderer.available && !ctx.renderer.available(roomId)) {
    throw new AppError('E_RENDER_UNAVAILABLE', `房间 ${roomId} 没有在线的 editor / headless 页面`);
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
}

function imageOptions(p: ImageParams): SnapshotOptions {
  return {
    width: p.width,
    height: p.height,
    format: p.format,
    settleMs: p.settleMs,
    at: p.at,
    transparent: p.transparent,
    shading: p.shading,
    overlay: p.overlay?.length ? [...new Set(p.overlay)] : undefined,
  };
}

export const renderHandlers: HandlersFor<Keys> = {
  'render.snapshot': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const renderer = requireRenderer(ctx, room.id);
    const shot = await renderer.snapshot({ roomId: room.id, doc: room.doc }, imageOptions(p));
    return {
      revision: room.revision,
      mime: shot.mime,
      base64: shot.base64,
      width: shot.width,
      height: shot.height,
    };
  },

  'render.views': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const renderer = requireRenderer(ctx, room.id);
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
    for (const view of views) {
      const framed = frameTarget(room.doc, { ids, view }) ?? target;
      const shot = await renderer.snapshot(
        { roomId: room.id, doc: room.doc },
        {
          ...imageOptions(p),
          camera: framed.camera,
        },
      );
      shots.push({
        view,
        label: VIEW_LABELS[view],
        mime: shot.mime,
        base64: shot.base64,
        width: shot.width,
        height: shot.height,
        camera: framed.camera,
      });
    }
    return { revision: room.revision, target: target.bounds, views: shots };
  },

  'render.node': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const renderer = requireRenderer(ctx, room.id);
    if (!room.doc.nodes[p.nodeId]) {
      throw new AppError('E_INVALID_PARAMS', `未知节点：${p.nodeId}`);
    }
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
        ...imageOptions(p),
        camera: framed.camera,
      },
    );
    return {
      revision: room.revision,
      nodeId: p.nodeId,
      target: framed.bounds,
      mime: shot.mime,
      base64: shot.base64,
      width: shot.width,
      height: shot.height,
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
        ...imageOptions(p),
      },
    );
    const img = decodeShot(shot.base64);
    const samples = (p.points ?? []).map((pt) => {
      const { rgb, alpha } = pixelAt(img, pt.x, pt.y);
      return { x: pt.x, y: pt.y, rgb, hex: hexOf(rgb), alpha };
    });
    const region = p.rect ? regionStats(img, p.rect, p.topColors ?? 5) : undefined;
    return {
      revision: room.revision,
      width: img.width,
      height: img.height,
      samples,
      ...(region ? { region } : {}),
    };
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
        const out = await renderer.exportGlb({ roomId: room.id, doc: snapshot }, p.nodeIds);
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
      opened = (await ctx.openExternal(url)) !== false;
      ctx.autoOpen?.set(room.id, opened ? 'opened' : 'failed');
      if (!opened) hint = `自动打开浏览器失败（系统 opener 不可用），改动仍会实时推送：手动打开 ${url}。`;
    }
    return { url, reused, opened, editors, ...(hint ? { hint } : {}) };
  },
};
